// Reviewer process execution.
//
// Security posture (issue #382): the prompt/diff is NEVER passed through a
// shell. We use spawn() with an argv array; the prompt goes to the child's
// stdin or a prompt file in the OS temp dir. Timeouts kill the child
// (SIGTERM, then SIGKILL after a short grace). Temp files are removed in a
// `finally` — and only AFTER the codex final-message file has been read.
//
// Reviewers never touch the operator's checkout. The pipeline creates a
// clean, detached git worktree pinned to the exact reviewed head SHA
// (createReviewWorktree) and every reviewer runs inside it. Read-only
// enforcement is belt and braces: per-CLI read-only flags, the prompt rules,
// and a git state snapshot (HEAD SHA + status) around each process. Because
// the worktree starts clean at a known SHA, a reviewer that edits an
// already-modified file, adds files, OR moves HEAD all change the snapshot —
// and void the review.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { identityAccepts } from './adapters.mjs'
import {
  CODEX_MCP_LIST_BASE_ARGS,
  assertNoMcpServersEnabled,
  buildCodexMcpDisableArgs,
  findCodexRolloutFile,
  parseCodexMcpList,
  rolloutMtimeMs,
  verifyCodexIdentity,
} from './codexSession.mjs'

const STDOUT_CAP_CHARS = 10_000_000
const STDERR_CAP_CHARS = 200_000
const KILL_GRACE_MS = 5_000
const PREFLIGHT_TIMEOUT_MS = 2 * 60 * 1000

function defaultRunGit(args, { cwd } = {}) {
  return promisify(execFile)('git', args, { encoding: 'utf8', cwd, maxBuffer: 16 * 1024 * 1024 })
}

export function defaultCodexSessionsDir() {
  return join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions')
}

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

// --- Review worktree -----------------------------------------------------------

// Captures exactly the two facts that can change under a reviewer: HEAD and
// the status of tracked+untracked files. Running inside a worktree that was
// just created clean at the reviewed SHA makes "status unchanged" meaningful
// — edits to already-dirty files are impossible because none exist.
export async function snapshotGitState({ cwd, runGit = defaultRunGit }) {
  let headSha
  try {
    headSha = (await runGit(['rev-parse', 'HEAD'], { cwd })).stdout.trim()
  } catch (error) {
    throw new Error(`git rev-parse HEAD failed in ${cwd}: ${error.message}`)
  }
  let status
  try {
    status = (await runGit(['status', '--porcelain'], { cwd })).stdout
  } catch (error) {
    throw new Error(`git status failed in ${cwd}: ${error.message}`)
  }
  return { headSha, status }
}

// Creates a clean detached worktree at the exact SHA under review. All
// reviewers read the repo AS OF that commit — never the operator's current
// checkout state.
export async function createReviewWorktree({ repoRoot, headSha, runGit = defaultRunGit, makeTempDir = defaultMakeTempDir }) {
  const path = makeTempDir('rentenwiki-review-worktree-')
  try {
    await runGit(['worktree', 'add', '--detach', path, headSha], { cwd: repoRoot })
  } catch (error) {
    rmSync(path, { recursive: true, force: true })
    throw new Error(
      `could not create review worktree at ${headSha.slice(0, 8)}: ${error.message}. ` +
        'If this is a fork or an un-fetched branch, fetch the PR head first ' +
        '(`git fetch origin pull/<n>/head`).',
    )
  }
  return { path }
}

export async function removeReviewWorktree({ path, runGit = defaultRunGit, repoRoot }) {
  try {
    await runGit(['worktree', 'remove', '--force', path], { cwd: repoRoot })
  } catch {
    // fall through to direct removal; a stale admin entry is harmless
    try {
      if (repoRoot) await runGit(['worktree', 'prune'], { cwd: repoRoot })
    } catch {
      // best effort
    }
  }
  rmSync(path, { recursive: true, force: true })
}

function defaultMakeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

// --- Grok config-discovery preflight ------------------------------------------------

// grok exposes no flag that disables config discovery, so before the model
// call we ask the CLI itself what it discovers for the review worktree
// (`grok inspect --json` — machine-readable, no private history involved) and
// refuse to run if the untrusted checkout plants anything executable: hooks,
// plugins, MCP servers, or LSP servers. Project-owned or sourceless entries
// fail; user-scope entries are the operator's own machine and are allowed.
export const GROK_INSPECT_ARGS = ['inspect', '--json']
const GROK_DISCOVERY_CATEGORIES = ['hooks', 'plugins', 'mcpServers', 'lspServers']

function discoveredEntryIsUntrusted(entry, cwd) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return true
  const source = entry.source
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return true // cannot prove it is not project-owned
  if (source.type === 'project') return true
  if (typeof source.path === 'string' && source.path.startsWith(cwd)) return true
  return false
}

export async function grokDiscoveryPreflight({ command, cwd, timeoutMs = PREFLIGHT_TIMEOUT_MS, spawnImpl }) {
  let result
  try {
    result = await runReviewerProcess({ command, args: GROK_INSPECT_ARGS, timeoutMs, cwd, spawnImpl })
  } catch (error) {
    return { ok: false, reason: `grok inspect preflight failed to run: ${error.message}` }
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      reason: `grok inspect preflight failed with exit code ${result.exitCode}: ${result.stderr.trim().slice(0, 400) || '(no stderr)'}`,
    }
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return { ok: false, reason: 'grok inspect preflight returned malformed JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'grok inspect preflight output is not a JSON object' }
  }
  const untrusted = []
  for (const category of GROK_DISCOVERY_CATEGORIES) {
    const entries = parsed[category]
    if (entries === undefined || entries === null) continue
    if (!Array.isArray(entries)) {
      return { ok: false, reason: `grok inspect "${category}" is not a list — unexpected discovery shape` }
    }
    for (const entry of entries) {
      if (discoveredEntryIsUntrusted(entry, cwd)) {
        untrusted.push(`${category}:${JSON.stringify(entry.target ?? entry.name ?? entry)?.slice(0, 120)}`)
      }
    }
  }
  if (untrusted.length > 0) {
    return {
      ok: false,
      reason:
        'grok discovers project-owned extensions in the review checkout — a PR must not be able to plant ' +
        `hooks/plugins/MCP/LSP servers for the reviewer: ${untrusted.join(', ')}`,
    }
  }
  return { ok: true, codexMcpArgs: [], discovered: {} }
}

// --- Preflight dispatch -------------------------------------------------------------

// codex gets the MCP disable-override preflight; grok gets the config-
// discovery preflight; claude needs none (--safe-mode handles it natively).
export function defaultReviewerPreflight({ reviewer, ...options }) {
  if (reviewer === 'codex') return codexMcpPreflight(options)
  if (reviewer === 'grok') return grokDiscoveryPreflight(options)
  return { ok: true, codexMcpArgs: [] }
}

// --- Codex MCP preflight ---------------------------------------------------------

// `--ignore-user-config` does not stop project-level codex config from
// registering MCP servers, so before the model call we read the configured
// server list (with plugins/apps/hooks disabled, in the exact checkout),
// build `-c mcp_servers.<name>.enabled=false` overrides for each, and verify
// with a second native list that nothing is left enabled. Server names that
// are not safe config keys are rejected, never interpolated.
export async function codexMcpPreflight({ command, cwd, timeoutMs = PREFLIGHT_TIMEOUT_MS, spawnImpl }) {
  const runList = async (args) => {
    const result = await runReviewerProcess({ command, args, timeoutMs, cwd, spawnImpl })
    if (result.exitCode !== 0) {
      throw new Error(
        `codex mcp list failed with exit code ${result.exitCode}: ${result.stderr.trim().slice(0, 400) || '(no stderr)'}`,
      )
    }
    return parseCodexMcpList(result.stdout)
  }

  let configured
  try {
    configured = await runList(CODEX_MCP_LIST_BASE_ARGS)
  } catch (error) {
    return { ok: false, reason: `codex MCP preflight failed: ${error.message}` }
  }

  let disableArgs
  try {
    disableArgs = buildCodexMcpDisableArgs(configured)
  } catch (error) {
    return { ok: false, reason: error.message }
  }

  try {
    assertNoMcpServersEnabled(await runList([...CODEX_MCP_LIST_BASE_ARGS, ...disableArgs]))
  } catch (error) {
    return { ok: false, reason: error.message }
  }

  return { ok: true, codexMcpArgs: disableArgs, configuredServers: configured.map((server) => server.name) }
}

// --- Reviewer execution -----------------------------------------------------------

// Runs one reviewer end-to-end inside the review worktree: prompt file,
// (codex: MCP preflight), spawn, worktree guard, output parse, and — for
// codex — identity attribution from the CLI's own rollout session file.
// Temp files are read BEFORE removal; removal happens in `finally`.
export async function executeReviewer({
  reviewer,
  model,
  command,
  prompt,
  worktreePath,
  expectedHeadSha,
  timeoutMs,
  buildInvocation,
  parseOutput,
  spawnImpl,
  runGit,
  preflight = defaultReviewerPreflight,
  codexSessionsDir = defaultCodexSessionsDir(),
  startedAt = new Date(),
  now = new Date(),
  realpathImpl,
  statImpl = statSync,
  listDirImpl = readdirSync,
  existsImpl = existsSync,
}) {
  const dir = mkdtempSync(join(tmpdir(), `rentenwiki-review-${reviewer}-`))
  try {
    const promptFile = join(dir, 'prompt.md')
    const lastMessageFile = join(dir, 'codex-last-message.txt')
    writeFileSync(promptFile, prompt, 'utf8')

    const gitOpts = runGit ? { runGit } : {}
    let before
    try {
      before = await snapshotGitState({ cwd: worktreePath, ...gitOpts })
    } catch (error) {
      return { ok: false, reason: `could not snapshot review worktree before run: ${error.message}` }
    }
    if (before.headSha !== expectedHeadSha) {
      return {
        ok: false,
        reason: `review worktree HEAD ${before.headSha.slice(0, 8)} is not the reviewed SHA ${expectedHeadSha.slice(0, 8)}`,
      }
    }
    if (before.status.length > 0) {
      return { ok: false, reason: 'review worktree is not clean — refusing to review from a dirty checkout' }
    }

    let codexMcpArgs = []
    if (reviewer === 'codex' || reviewer === 'grok') {
      const pre = await preflight({ command, cwd: worktreePath, timeoutMs: PREFLIGHT_TIMEOUT_MS, spawnImpl, reviewer })
      if (!pre.ok) return { ok: false, reason: pre.reason }
      codexMcpArgs = pre.codexMcpArgs ?? []
    }

    let result
    try {
      const invocation = buildInvocation({ reviewer, model, promptFile, outputLastMessageFile: lastMessageFile, codexMcpArgs })
      const input = invocation.inputMode === 'stdin' ? prompt : undefined
      result = await runReviewerProcess({
        command,
        args: invocation.args,
        input,
        timeoutMs,
        cwd: worktreePath,
        spawnImpl,
      })
    } catch (error) {
      return { ok: false, reason: error.message }
    }

    let after
    try {
      after = await snapshotGitState({ cwd: worktreePath, ...gitOpts })
    } catch (error) {
      return { ok: false, reason: `could not snapshot review worktree after run: ${error.message}` }
    }
    if (after.headSha !== before.headSha || after.status !== before.status) {
      return {
        ok: false,
        reason: 'reviewer modified the review worktree or moved HEAD — read-only posture violated; review voided',
        meta: { worktreeUnchanged: false },
      }
    }

    // Read the codex final message BEFORE removing the temp dir.
    const lastMessage = readFileOrNull(lastMessageFile)
    const parsed = parseOutput({
      stdout: result.stdout,
      stderr: result.stderr,
      lastMessage,
      exitCode: result.exitCode,
      requestedModel: model,
    })

    if (parsed.ok && reviewer === 'codex') {
      const attributed = attributeCodexIdentity({
        parsed,
        model,
        worktreePath,
        codexSessionsDir,
        startedAt,
        now,
        realpathImpl,
        statImpl,
        listDirImpl,
        existsImpl,
      })
      if (!attributed.ok) return { ok: false, reason: attributed.reason }
      parsed.reportedModels = attributed.models
      parsed.meta = {
        ...parsed.meta,
        identityEvidence: attributed.evidence,
        codexSessionCwdMatched: true,
      }
    }

    return { ...parsed, meta: { ...(parsed.meta ?? {}), exitCode: result.exitCode, worktreeUnchanged: true } }
  } finally {
    cleanupDir(dir)
  }
}

function attributeCodexIdentity({
  parsed,
  model,
  worktreePath,
  codexSessionsDir,
  startedAt,
  now,
  realpathImpl,
  statImpl,
  listDirImpl,
  existsImpl,
}) {
  const threadId = parsed.meta?.threadId
  let rollout
  try {
    rollout = findCodexRolloutFile({
      sessionsDir: codexSessionsDir,
      sessionId: threadId,
      startedAt,
      listDir: listDirImpl,
      exists: existsImpl,
    })
  } catch (error) {
    return { ok: false, reason: `codex rollout lookup failed: ${error.message}` }
  }
  if (!rollout) {
    return {
      ok: false,
      reason: `no codex rollout session file found for thread ${threadId} — cannot attribute the review to a model`,
    }
  }

  let rolloutText
  try {
    rolloutText = readFileSync(rollout.path, 'utf8')
  } catch (error) {
    return { ok: false, reason: `codex rollout file could not be read: ${error.message}` }
  }

  return verifyCodexIdentity({
    requestedModel: model,
    threadId,
    rolloutText,
    rolloutPath: rollout.path,
    rolloutWallClockMs: rollout.wallClockMs,
    expectedCwdCanonical: realpathImpl ? realpathImpl(worktreePath) : worktreePath,
    startedAt,
    now,
    identityAccepts,
    mtimeMs: rolloutMtimeMs(rollout.path, statImpl),
  })
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
