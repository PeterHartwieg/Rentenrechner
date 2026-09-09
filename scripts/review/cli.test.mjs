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

  it('rejects a value-bearing --complex instead of downgrading to routine', async () => {
    const error = await runPlan(['--pr', '42', '--complex', 'bogus', '--json']).catch((e) => e)
    expect(error.code).toBe(1)
    expect(error.stderr).toMatch(/--complex is a boolean flag and takes no value/)
    expect(error.stdout).not.toMatch(/routine/)
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

  it('passes complex: true for a bare --complex and for `--complex true`', async () => {
    for (const argv of [
      ['--pr', '42', '--complex'],
      ['--pr', '42', '--complex', 'true'],
      ['--complex', 'true', '--pr', '42'],
    ]) {
      const { execute, calls } = stubExecute()
      await reviewRunMain({ argv, execute, log: () => {} })
      expect(calls[0].complex, argv.join(' ')).toBe(true)
    }
  })

  it('rejects a value-bearing --complex before any review starts', async () => {
    const { execute, calls } = stubExecute()
    await expect(reviewRunMain({ argv: ['--pr', '42', '--complex', 'bogus'], execute, log: () => {} })).rejects.toThrow(
      /--complex is a boolean flag and takes no value/,
    )
    expect(calls).toHaveLength(0)
  })

  it('runs as a process: a rejected --complex exits 1 and never calls gh', async () => {
    writeFileSync(ghLog, '', 'utf8')
    const RUN_CLI = new URL('./review-run.mjs', import.meta.url).pathname
    const error = await execFileP(process.execPath, [RUN_CLI, '--pr', '42', '--complex', 'bogus'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, FAKE_GH_LOG: ghLog },
    }).catch((e) => e)
    expect(error.code).toBe(1)
    expect(error.stderr).toMatch(/--complex is a boolean flag and takes no value/)
    expect(readFileSync(ghLog, 'utf8')).toBe('')
  })
})
