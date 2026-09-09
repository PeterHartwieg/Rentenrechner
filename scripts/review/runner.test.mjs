import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runReviewerProcess, executeReviewer } from './lib/runner.mjs'
import { buildReviewerInvocation, parseClaudeReviewerOutput, parseCodexReviewerOutput, parseGrokReviewerOutput } from './lib/adapters.mjs'

// Tests in this file spawn only `node` running the local fake reviewer
// fixture. No model CLI and no network is ever contacted.

const FIXTURE = new URL('./test-fixtures/fake-reviewer.mjs', import.meta.url).pathname
const RUN_START = new Date('2026-09-08T12:00:00Z')
const SHA = 'a'.repeat(40)
const THREAD = '01a082a3-fc89-74c3-8171-be21bf04c4c7'

// Real directory standing in for the review worktree: spawn needs an existing
// cwd, and the codex rollout fixture must record its canonical path.
const WORKTREE = realpathSync(mkdtempSync(join(tmpdir(), 'rw-review-worktree-')))
afterAll(() => rmSync(WORKTREE, { recursive: true, force: true }))

// The write-worktree test plants an artifact into the shared stand-in
// worktree; drop it so later snapshots start clean again.
beforeEach(() => rmSync(join(WORKTREE, 'fake-reviewer-artifact.txt'), { force: true }))

function fixtureSpawn({ cli, mode = 'success', env: extraEnv = {} } = {}) {
  return (command, args, options) => {
    const env = { ...options.env, FAKE_REVIEW_CLI: cli ?? 'claude', FAKE_REVIEW_MODE: mode, ...extraEnv }
    return spawn(process.execPath, [FIXTURE, ...args], { ...options, env })
  }
}

function validPrompt() {
  return `PR: #7\nHead SHA (RESTATE THIS EXACTLY in your verdict): \`${SHA}\`\n`
}

// Fake git snapshotter: HEAD is always the reviewed SHA; the status mirrors
// any artifact the fixture actually wrote into the worktree path.
function fakeRunGit({ worktreePath, dirtyAfter = false } = {}) {
  return async (args, { cwd } = {}) => {
    if (args[0] === 'rev-parse') return { stdout: `${SHA}\n` }
    if (args[0] === 'status') {
      const artifact = cwd && existsSync(join(cwd, 'fake-reviewer-artifact.txt'))
      return { stdout: artifact || dirtyAfter ? '?? fake-reviewer-artifact.txt\n' : '' }
    }
    throw new Error(`unexpected git args ${args.join(' ')}`)
  }
}

function baseArgs(overrides = {}) {
  return {
    reviewer: 'claude',
    model: 'opus',
    command: process.execPath,
    prompt: validPrompt(),
    worktreePath: WORKTREE,
    expectedHeadSha: SHA,
    timeoutMs: 20_000,
    buildInvocation: (ctx) => ({
      ...buildReviewerInvocation(ctx),
      args: [FIXTURE, ...buildReviewerInvocation(ctx).args],
    }),
    runGit: fakeRunGit(),
    ...overrides,
  }
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

  it('rejects the run when stdout overflows the capture cap (no silent truncation)', async () => {
    // One chunk overshooting the cap still counts as overflow.
    await expect(
      runReviewerProcess({
        command: process.execPath,
        args: ['-e', 'process.stdout.write("x".repeat(11_000_000))'],
        input: undefined,
        timeoutMs: 30_000,
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/exceeded the .* capture cap/)
  }, 60_000)

  it('rejects the run when stderr alone overflows the capture cap', async () => {
    await expect(
      runReviewerProcess({
        command: process.execPath,
        args: ['-e', 'process.stderr.write("e".repeat(201_000))'],
        input: undefined,
        timeoutMs: 30_000,
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/stderr exceeded/)
  }, 60_000)

  it('accepts output just under the cap', async () => {
    const result = await runReviewerProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(1000))'],
      input: undefined,
      timeoutMs: 30_000,
      cwd: process.cwd(),
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toHaveLength(1000)
  }, 60_000)
})

describe('executeReviewer — worktree guard', () => {
  it('runs a claude-shaped review in a clean worktree at the reviewed SHA', async () => {
    const result = await executeReviewer(
      baseArgs({
        spawnImpl: fixtureSpawn({ cli: 'claude' }),
        parseOutput: parseClaudeReviewerOutput,
        clock: () => RUN_START,
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.text).toContain('"verdict": "approve"')
    expect(result.meta.worktreeUnchanged).toBe(true)
    expect(result.meta.identityEvidence).toBe('native-assistant-message-models')
    // Per-reviewer timing is stamped from the injected clock.
    expect(result.meta.startedAt).toBe(RUN_START.toISOString())
    expect(result.meta.completedAt).toBe(RUN_START.toISOString())
  })

  it('refuses to run when the worktree HEAD is not the reviewed SHA', async () => {
    const result = await executeReviewer(
      baseArgs({
        spawnImpl: fixtureSpawn({ cli: 'claude' }),
        parseOutput: parseClaudeReviewerOutput,
        runGit: async (args) =>
          args[0] === 'rev-parse' ? { stdout: `${'b'.repeat(40)}\n` } : { stdout: '' },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/is not the reviewed SHA/)
  })

  it('refuses to run from a dirty review worktree', async () => {
    const result = await executeReviewer(
      baseArgs({
        spawnImpl: fixtureSpawn({ cli: 'claude' }),
        parseOutput: parseClaudeReviewerOutput,
        runGit: async (args) => (args[0] === 'rev-parse' ? { stdout: `${SHA}\n` } : { stdout: '?? something.txt\n' }),
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not clean/)
  })

  it('voids the review when the reviewer writes to the worktree', async () => {
    // The fake runGit mirrors the artifact the fixture really writes into cwd.
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'write-worktree', env: { FAKE_CODEX_THREAD_ID: THREAD } }),
        parseOutput: () => ({ ok: true, text: 'unused' }),
        runGit: fakeRunGit(),
        preflight: async () => ({ ok: true, codexMcpArgs: [], configuredServers: [] }),
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/modified the review worktree or moved HEAD/)
  })
})

describe('executeReviewer — temp cleanup ordering', () => {
  it('reads the codex last message BEFORE removing the temp dir', async () => {
    // The fixture writes the final-message file and exits; a successful parse
    // is only possible if the runner read the file before cleanup. If the
    // runner cleaned up first, the parse would fail with "empty or missing".
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'success', env: { FAKE_CODEX_THREAD_ID: THREAD } }),
        parseOutput: parseCodexReviewerOutput,
        preflight: async () => ({ ok: true, codexMcpArgs: [], configuredServers: [] }),
        codexSessionsDir: codexSessionsFixture(),
        startedAt: new Date(Date.now() - 60_000),
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.text).toContain('"verdict": "approve"')
  })
})

describe('executeReviewer — codex MCP preflight + rollout identity', () => {
  it('passes preflight MCP disable overrides into the invocation and attributes identity from the rollout file', async () => {
    const seenCodexArgs = []
    const sessionsDir = codexSessionsFixture()
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'success', env: { FAKE_CODEX_THREAD_ID: THREAD } }),
        parseOutput: parseCodexReviewerOutput,
        buildInvocation: (ctx) => {
          seenCodexArgs.push(ctx.codexMcpArgs)
          return {
            ...buildReviewerInvocation(ctx),
            args: [FIXTURE, ...buildReviewerInvocation(ctx).args],
          }
        },
        preflight: async () => ({
          ok: true,
          codexMcpArgs: ['-c', 'mcp_servers.node_repl.enabled=false', '-c', 'mcp_servers.computer-use.enabled=false'],
          configuredServers: ['node_repl', 'computer-use'],
        }),
        codexSessionsDir: sessionsDir,
        startedAt: new Date(Date.now() - 60_000),
      }),
    )
    expect(seenCodexArgs[0]).toEqual([
      '-c',
      'mcp_servers.node_repl.enabled=false',
      '-c',
      'mcp_servers.computer-use.enabled=false',
    ])
    expect(result.ok).toBe(true)
    expect(result.reportedModels).toEqual(['gpt-6-astra'])
    expect(result.meta.identityEvidence).toBe('cli-session-turn-context')
  })

  it('fails closed without spawning the reviewer when MCP servers stay enabled', async () => {
    let spawned = false
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: (...args) => {
          spawned = true
          return fixtureSpawn({ cli: 'codex' })(...args)
        },
        parseOutput: parseCodexReviewerOutput,
        preflight: async () => ({ ok: false, reason: 'codex MCP servers still enabled after disable overrides: node_repl' }),
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/still enabled/)
    expect(spawned).toBe(false)
  })

  it('fails closed when the rollout session records a different model', async () => {
    const sessionsDir = codexSessionsFixture({ model: 'gpt-5.6-sol' })
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'success', env: { FAKE_CODEX_THREAD_ID: THREAD } }),
        parseOutput: parseCodexReviewerOutput,
        preflight: async () => ({ ok: true, codexMcpArgs: [], configuredServers: [] }),
        codexSessionsDir: sessionsDir,
        startedAt: new Date(Date.now() - 60_000),
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/model identity mismatch/)
  })

  it('fails closed when no rollout session file exists for the thread', async () => {
    const result = await executeReviewer(
      baseArgs({
        reviewer: 'codex',
        model: 'gpt-6-astra',
        spawnImpl: fixtureSpawn({ cli: 'codex', mode: 'success', env: { FAKE_CODEX_THREAD_ID: THREAD } }),
        parseOutput: parseCodexReviewerOutput,
        preflight: async () => ({ ok: true, codexMcpArgs: [], configuredServers: [] }),
        codexSessionsDir: join(tmpdir(), 'rw-no-such-sessions-dir'),
        startedAt: new Date(Date.now() - 60_000),
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no codex rollout session file/)
  })
})

// Writes a synthetic codex rollout transcript for THREAD into a fake
// $CODEX_HOME/sessions tree, named after `startedAt`'s local wall clock.
// Returns the sessions dir itself — the shape `defaultCodexSessionsDir()`
// hands the runner.
function codexSessionsFixture({ model = 'gpt-6-astra' } = {}) {
  const startedAt = new Date(Date.now() - 60_000)
  const pad = (n) => String(n).padStart(2, '0')
  const y = startedAt.getFullYear()
  const mo = pad(startedAt.getMonth() + 1)
  const d = pad(startedAt.getDate())
  const h = pad(startedAt.getHours())
  const mi = pad(startedAt.getMinutes())
  const s = pad(startedAt.getSeconds())
  const sessionsDir = mkdtempSync(join(tmpdir(), 'rw-codex-sessions-'))
  const dir = join(sessionsDir, String(y), mo, d)
  mkdirSync(dir, { recursive: true })
  const name = `rollout-${y}-${mo}-${d}T${h}-${mi}-${s}-${THREAD}.jsonl`
  writeFileSync(
    join(dir, name),
    [
      JSON.stringify({ type: 'session_meta', payload: { id: THREAD, model_provider: 'openai', cwd: WORKTREE } }),
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model, cwd: WORKTREE } }),
    ].join('\n'),
    'utf8',
  )
  return sessionsDir
}

describe('executeReviewer — grok config-discovery preflight', () => {
  function grokArgs(overrides = {}) {
    return baseArgs({
      reviewer: 'grok',
      model: 'grok-4.6',
      spawnImpl: fixtureSpawn({ cli: 'grok' }),
      parseOutput: (ctx) => {
        // The fixture's grok review shape; identity already covered elsewhere.
        return parseGrokReviewerOutput(ctx)
      },
      ...overrides,
    })
  }

  it('runs `grok inspect --json` in the worktree before the review and approves clean discovery', async () => {
    let inspected = false
    const spawnImpl = (command, args, options) => {
      const cli = args[0] === 'inspect' ? 'grok-inspect' : 'grok'
      if (args[0] === 'inspect') inspected = true
      return fixtureSpawn({ cli })(command, args, options)
    }
    const result = await executeReviewer(grokArgs({ spawnImpl }))
    expect(inspected).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('fails closed when the untrusted checkout plants a project hook', async () => {
    let inspected = false
    const spawnImpl = (command, args, options) => {
      if (args[0] === 'inspect') {
        inspected = true
        return fixtureSpawn({ cli: 'grok-inspect' })(command, args, {
          ...options,
          env: { ...options.env, FAKE_GROK_PROJECT_HOOK: '1' },
        })
      }
      return fixtureSpawn({ cli: 'grok' })(command, args, options)
    }
    const result = await executeReviewer(grokArgs({ spawnImpl }))
    expect(inspected).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/project-owned extensions in the review checkout/)
  })
})

describe('executeReviewer — timeout', () => {
  it('surfaces a timed-out reviewer as a failed review', async () => {
    const result = await executeReviewer(
      baseArgs({
        timeoutMs: 200,
        buildInvocation: () => ({ args: ['-e', 'setTimeout(() => {}, 60000)'], inputMode: 'stdin' }),
        parseOutput: parseClaudeReviewerOutput,
        // Real spawn on purpose: the child is a raw node -e timer, not the fixture.
        spawnImpl: spawn,
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/timed out/)
  }, 10_000)
})
