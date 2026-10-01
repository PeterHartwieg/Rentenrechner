import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterAll, describe, expect, it } from 'vitest'

import { main as reviewRunMain } from './review-run.mjs'

// Entrypoint-level tests for the two CLIs. `review:plan` is exercised as a
// real subprocess against a fake `gh` on PATH (read-only, no network, no model
// CLI); `review:run` is exercised through its exported main() with an injected
// execute, because a full run would need real reviewer binaries.
//
// The behaviour under test is the ARGV WIRING itself: the live finding on
// ad2f987 was that `--complex true` parsed to the string 'true', failed the
// entrypoints' `=== true` check, and silently produced a routine panel while
// the helper that normalises the flag sat unused.

const execFileP = promisify(execFile)
const PLAN_CLI = new URL('./review-plan.mjs', import.meta.url).pathname
const GH_FIXTURE = new URL('./test-fixtures/fake-gh.mjs', import.meta.url).pathname

const shimDir = mkdtempSync(join(tmpdir(), 'rw-cli-gh-'))
const ghLog = join(shimDir, 'gh-calls.log')
writeFileSync(join(shimDir, 'gh'), `#!/bin/sh\nexec ${process.execPath} ${GH_FIXTURE} "$@"\n`, 'utf8')
chmodSync(join(shimDir, 'gh'), 0o755)
afterAll(() => rmSync(shimDir, { recursive: true, force: true }))

function runPlan(args) {
  return execFileP(process.execPath, [PLAN_CLI, ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, FAKE_GH_LOG: ghLog },
  })
}

describe('review:plan entrypoint — --complex wiring', () => {
  it('selects the routine panel when the flag is absent', async () => {
    const { stdout } = await runPlan(['--pr', '42', '--json'])
    expect(JSON.parse(stdout).panel.kind).toBe('routine')
  })

  it('selects the complex panel for a bare --complex', async () => {
    const { stdout } = await runPlan(['--pr', '42', '--complex', '--json'])
    expect(JSON.parse(stdout).panel.kind).toBe('complex')
  })

  it('selects the complex panel for the documented `--complex true` (regression: silently routine)', async () => {
    const { stdout } = await runPlan(['--pr', '42', '--complex', 'true', '--json'])
    const plan = JSON.parse(stdout)
    expect(plan.panel.kind).toBe('complex')
    expect(plan.panel.reviewers.map((r) => r.reviewer)).toEqual(['claude', 'codex', 'grok'])
  })

  it('reports the complex panel in human-readable output too', async () => {
    const { stdout } = await runPlan(['--pr', '42', '--complex', 'true'])
    expect(stdout).toMatch(/Panel {4}: complex/)
    expect(stdout).not.toMatch(/Panel {4}: routine/)
  })

  it('selects the complex panel for `--complex=true` (root reproduction: silently routine)', async () => {
    // parseFlags used to produce a flag literally named `complex=true`, so
    // flags.complex stayed undefined and the guard read "routine requested".
    const { stdout } = await runPlan(['--pr', '42', '--complex=true', '--json'])
    expect(JSON.parse(stdout).panel.kind).toBe('complex')
  })

  it('accepts `=` syntax for the ordinary flags too', async () => {
    const { stdout } = await runPlan(['--pr=42', '--json=true'])
    expect(JSON.parse(stdout).pr).toBe(42)
    expect(JSON.parse(stdout).panel.kind).toBe('routine')
  })

  it('rejects a value-bearing --complex instead of downgrading to routine', async () => {
    for (const args of [
      ['--pr', '42', '--complex', 'bogus', '--json'],
      ['--pr', '42', '--complex=bogus', '--json'],
      ['--pr', '42', '--complex=false', '--json'],
      ['--pr', '42', '--complex=0', '--json'],
    ]) {
      const error = await runPlan(args).catch((e) => e)
      expect(error.code, args.join(' ')).toBe(1)
      expect(error.stderr, args.join(' ')).toMatch(/--complex is a boolean flag and takes no value/)
      expect(error.stdout, args.join(' ')).not.toMatch(/routine|complex/)
    }
  })

  it('rejects a misspelled flag instead of running the routine panel', async () => {
    writeFileSync(ghLog, '', 'utf8')
    for (const typo of ['--complexx=true', '--complx', '--Complex=true', '--comple x']) {
      const error = await runPlan(['--pr', '42', typo, '--json']).catch((e) => e)
      expect(error.code, typo).toBe(1)
      expect(error.stderr, typo).toMatch(/unknown flag\(s\)|unexpected argument\(s\)/)
      expect(error.stdout, typo).not.toMatch(/routine|complex/)
    }
    // Rejected before any GitHub call.
    expect(readFileSync(ghLog, 'utf8')).toBe('')
  })

  it('rejects a stray positional argument rather than guessing what it meant', async () => {
    const error = await runPlan(['42', '--complex', '--json']).catch((e) => e)
    expect(error.code).toBe(1)
    expect(error.stderr).toMatch(/unexpected argument\(s\): 42/)
  })
})

describe('review:run entrypoint — --complex wiring', () => {
  function stubExecute() {
    const calls = []
    const execute = async (options) => {
      calls.push(options)
      return {
        decision: 'approve',
        ok: true,
        reasons: [],
        reviews: [],
        receipt: { panel: { kind: options.complex ? 'complex' : 'routine' } },
        receiptPath: '/fake/receipt.json',
        published: null,
      }
    }
    return { execute, calls }
  }

  it('passes complex: false when the flag is absent', async () => {
    const { execute, calls } = stubExecute()
    const { exitCode } = await reviewRunMain({ argv: ['--pr', '42'], execute, log: () => {} })
    expect(exitCode).toBe(0)
    expect(calls[0].complex).toBe(false)
  })

  it('passes complex: true for the bare, spaced and `=` forms alike', async () => {
    for (const argv of [
      ['--pr', '42', '--complex'],
      ['--pr', '42', '--complex', 'true'],
      ['--complex', 'true', '--pr', '42'],
      ['--pr', '42', '--complex=true'],
      ['--pr=42', '--complex=true'],
      ['--complex=true', '--pr', '42'],
    ]) {
      const { execute, calls } = stubExecute()
      await reviewRunMain({ argv, execute, log: () => {} })
      expect(calls[0].complex, argv.join(' ')).toBe(true)
    }
  })

  it('rejects a value-bearing --complex before any review starts', async () => {
    for (const argv of [
      ['--pr', '42', '--complex', 'bogus'],
      ['--pr', '42', '--complex=bogus'],
      ['--pr', '42', '--complex=false'],
    ]) {
      const { execute, calls } = stubExecute()
      await expect(reviewRunMain({ argv, execute, log: () => {} }), argv.join(' ')).rejects.toThrow(
        /--complex is a boolean flag and takes no value/,
      )
      expect(calls, argv.join(' ')).toHaveLength(0)
    }
  })

  it('rejects a misspelled or unsupported flag instead of running a quieter panel', async () => {
    for (const argv of [
      ['--pr', '42', '--complexx=true'],
      ['--pr', '42', '--complx'],
      ['--pr', '42', '--publsh'],
      ['--pr', '42', '--complex', 'extra-arg-after-flag-value', '--publish'],
    ]) {
      const { execute, calls } = stubExecute()
      await expect(reviewRunMain({ argv, execute, log: () => {} }), argv.join(' ')).rejects.toThrow(
        /unknown flag\(s\)|--complex is a boolean flag/,
      )
      expect(calls, argv.join(' ')).toHaveLength(0)
    }
  })

  it('rejects a stray positional argument', async () => {
    const { execute, calls } = stubExecute()
    await expect(reviewRunMain({ argv: ['42', '--complex'], execute, log: () => {} })).rejects.toThrow(
      /unexpected argument\(s\): 42/,
    )
    expect(calls).toHaveLength(0)
  })

  it('still reads the value-taking flags, in both syntaxes', async () => {
    const { execute, calls } = stubExecute()
    await reviewRunMain({
      argv: ['--pr', '42', '--publish', '--comment=true', '--verify-commit=' + 'c'.repeat(40), '--timeout-minutes', '5'],
      execute,
      log: () => {},
    })
    expect(calls[0]).toMatchObject({
      pr: 42,
      complex: false,
      publish: true,
      comment: true,
      verifyCommit: 'c'.repeat(40),
      timeoutMs: 5 * 60 * 1000,
    })
  })

  it('rejects a value-bearing boolean flag rather than quietly not doing it', async () => {
    const { execute, calls } = stubExecute()
    await expect(reviewRunMain({ argv: ['--pr', '42', '--publish=yes'], execute, log: () => {} })).rejects.toThrow(
      /--publish is a boolean flag and takes no value/,
    )
    expect(calls).toHaveLength(0)
  })

  it('runs as a process: rejected complex forms exit 1 and never call gh', async () => {
    const RUN_CLI = new URL('./review-run.mjs', import.meta.url).pathname
    for (const [args, expected] of [
      [['--pr', '42', '--complex', 'bogus'], /--complex is a boolean flag and takes no value/],
      [['--pr', '42', '--complex=bogus'], /--complex is a boolean flag and takes no value/],
      [['--pr', '42', '--complexx=true'], /unknown flag\(s\): --complexx/],
      [['42', '--complex'], /unexpected argument\(s\): 42/],
    ]) {
      writeFileSync(ghLog, '', 'utf8')
      const error = await execFileP(process.execPath, [RUN_CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, FAKE_GH_LOG: ghLog },
      }).catch((e) => e)
      expect(error.code, args.join(' ')).toBe(1)
      expect(error.stderr, args.join(' ')).toMatch(expected)
      // No GitHub call, no reviewer: rejected before any of that.
      expect(readFileSync(ghLog, 'utf8'), args.join(' ')).toBe('')
      expect(error.stdout, args.join(' ')).not.toMatch(/Panel/)
    }
  })
})
