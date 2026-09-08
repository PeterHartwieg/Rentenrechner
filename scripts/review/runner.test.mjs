import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runReviewerProcess, executeReviewer } from './lib/runner.mjs'
import { buildReviewerInvocation, parseClaudeReviewerOutput } from './lib/adapters.mjs'

// Tests in this file spawn only `node` running the local fake reviewer
// fixture. No model CLI and no network is ever contacted.

const FIXTURE = new URL('./test-fixtures/fake-reviewer.mjs', import.meta.url).pathname

function fixtureSpawn({ cli, mode = 'success' } = {}) {
  return (command, args, options) => {
    const env = { ...options.env, FAKE_REVIEW_CLI: cli ?? 'claude', FAKE_REVIEW_MODE: mode }
    return spawn(process.execPath, [FIXTURE, ...args], { ...options, env })
  }
}

function validPrompt() {
  return `PR: #7\nHead SHA (RESTATE THIS EXACTLY in your verdict): \`${'a'.repeat(40)}\`\n`
}

describe('runReviewerProcess', () => {
  it('delivers the prompt via stdin and captures stdout', async () => {
    const result = await runReviewerProcess({
      command: process.execPath,
      args: [
        '-e',
        'let s=""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write("len:" + s.length))',
      ],
      input: 'x'.repeat(1000),
      timeoutMs: 10_000,
      cwd: process.cwd(),
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('len:1000')
  })

  it('propagates non-zero exit codes', async () => {
    const result = await runReviewerProcess({
      command: process.execPath,
      args: ['-e', 'process.exit(3)'],
      input: undefined,
      timeoutMs: 10_000,
      cwd: process.cwd(),
    })
    expect(result.exitCode).toBe(3)
  })

  it('times out a hanging child and rejects', async () => {
    await expect(
      runReviewerProcess({
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 60000)'],
        input: undefined,
        timeoutMs: 150,
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/timed out after 150ms/)
  }, 10_000)

  it('reports spawn errors helpfully', async () => {
    await expect(
      runReviewerProcess({
        command: '/nonexistent/reviewer-binary',
        args: [],
        input: undefined,
        timeoutMs: 10_000,
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/failed to (run|start) \/nonexistent\/reviewer-binary/)
  })
})

describe('executeReviewer', () => {
  let repo

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'rw-review-repo-'))
    writeFileSync(join(repo, 'marker.txt'), 'repo content', 'utf8')
  })

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('runs a claude-shaped review end to end and returns parsed text', async () => {
    const result = await executeReviewer({
      reviewer: 'claude',
      model: 'opus',
      command: process.execPath,
      prompt: validPrompt(),
      repoRoot: repo,
      timeoutMs: 20_000,
      buildInvocation: (ctx) => ({
        ...buildReviewerInvocation(ctx),
        args: [FIXTURE, ...buildReviewerInvocation(ctx).args],
      }),
      parseOutput: parseClaudeReviewerOutput,
      spawnImpl: fixtureSpawn({ cli: 'claude' }),
      runGitStatus: async () => '',
    })

    expect(result.ok).toBe(true)
    expect(result.text).toContain('"verdict": "approve"')
    expect(result.meta.worktreeUnchanged).toBe(true)
  })

  it('voids the review when the reviewer writes to the worktree', async () => {
    const result = await executeReviewer({
      reviewer: 'codex',
      model: 'gpt-6-astra',
      command: process.execPath,
      prompt: validPrompt(),
      repoRoot: repo,
      timeoutMs: 20_000,
      buildInvocation: (ctx) => ({
        ...buildReviewerInvocation(ctx),
        args: [FIXTURE, ...buildReviewerInvocation(ctx).args],
      }),
      parseOutput: () => ({ ok: true, text: 'unused' }),
      spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'write-worktree' }),
      runGitStatus: async () => {
        // Reflects the fixture's artifact file appearing in the repo.
        return import('node:fs').then((fs) =>
          fs.existsSync(join(repo, 'fake-reviewer-artifact.txt')) ? '?? fake-reviewer-artifact.txt\n' : '',
        )
      },
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/modified the worktree/)
  })

  it('surfaces a timed-out reviewer as a failed review', async () => {
    const result = await executeReviewer({
      reviewer: 'claude',
      model: 'opus',
      command: process.execPath,
      prompt: validPrompt(),
      repoRoot: repo,
      timeoutMs: 200,
      buildInvocation: () => ({ args: ['-e', 'setTimeout(() => {}, 60000)'], inputMode: 'stdin' }),
      parseOutput: parseClaudeReviewerOutput,
      // Real spawn on purpose: the child is a raw node -e timer, not the fixture.
      spawnImpl: spawn,
      runGitStatus: async () => '',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/timed out/)
  }, 10_000)
})
