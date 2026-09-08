// Reviewer process execution.
//
// Security posture (issue #382): the prompt/diff is NEVER passed through a
// shell. We use spawn() with an argv array; the prompt goes to the child's
// stdin or a prompt file in the OS temp dir. Timeouts kill the child
// (SIGTERM, then SIGKILL after a short grace). Temp files are removed once
// the reviewer has finished.
//
// Read-only enforcement is belt and braces: the prompt forbids writes, the
// CLI flags restrict tools, and around each reviewer we snapshot
// `git status --porcelain` — any worktree mutation voids that review.

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STDOUT_CAP_CHARS = 10_000_000
const STDERR_CAP_CHARS = 200_000
const KILL_GRACE_MS = 5_000

export async function runReviewerProcess({ command, args, input, timeoutMs, cwd, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnImpl(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new Error(`failed to start ${command}: ${error.message}`))
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGTERM')
      } catch {
        // already gone
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }, KILL_GRACE_MS).unref()
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (stdout.length < STDOUT_CAP_CHARS) stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < STDERR_CAP_CHARS) stderr += chunk
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`failed to run ${command}: ${error.message}`))
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms and was killed`))
        return
      }
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut })
    })

    if (typeof input === 'string') {
      child.stdin.on('error', () => {
        // EPIPE if the CLI closes stdin early — the exit code decides.
      })
      child.stdin.end(input)
    } else {
      child.stdin.end()
    }
  })
}

// Runs one reviewer end-to-end: prompt file, spawn, worktree guard, parse.
// Returns the adapter's parse result plus execution metadata for the receipt.
export async function executeReviewer({
  reviewer,
  model,
  command,
  prompt,
  repoRoot,
  timeoutMs,
  buildInvocation,
  parseOutput,
  spawnImpl,
  runGitStatus,
}) {
  const dir = mkdtempSync(join(tmpdir(), `rentenwiki-review-${reviewer}-`))
  const promptFile = join(dir, 'prompt.md')
  const lastMessageFile = join(dir, 'codex-last-message.txt')
  writeFileSync(promptFile, prompt, 'utf8')

  let statusBefore
  try {
    statusBefore = await runGitStatus()
  } catch (error) {
    cleanupDir(dir)
    return { ok: false, reason: `could not snapshot worktree state before review: ${error.message}` }
  }

  let result
  try {
    const invocation = buildInvocation({ reviewer, model, promptFile, outputLastMessageFile: lastMessageFile })
    const input = invocation.inputMode === 'stdin' ? prompt : undefined

    result = await runReviewerProcess({
      command,
      args: invocation.args,
      input,
      timeoutMs,
      cwd: repoRoot,
      spawnImpl,
    })
  } catch (error) {
    cleanupDir(dir)
    return { ok: false, reason: error.message }
  }

  let statusAfter
  try {
    statusAfter = await runGitStatus()
  } catch (error) {
    cleanupDir(dir)
    return { ok: false, reason: `could not snapshot worktree state after review: ${error.message}` }
  }
  if (statusAfter !== statusBefore) {
    cleanupDir(dir)
    return {
      ok: false,
      reason: 'reviewer modified the worktree — read-only posture violated; review voided',
      meta: { worktreeUnchanged: false },
    }
  }

  // Read the codex final message BEFORE removing the temp dir.
  const lastMessage = readFileOrNull(lastMessageFile)
  cleanupDir(dir)
  const parsed = parseOutput({
    stdout: result.stdout,
    stderr: result.stderr,
    lastMessage,
    exitCode: result.exitCode,
    requestedModel: model,
  })
  return { ...parsed, meta: { ...(parsed.meta ?? {}), exitCode: result.exitCode, worktreeUnchanged: true } }
}

function readFileOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best effort — the temp dir is outside the repo
  }
}
