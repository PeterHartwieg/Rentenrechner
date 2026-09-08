import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { executeReview, planReview } from './lib/orchestrate.mjs'
import { DEFAULT_POLICY } from './lib/sources.mjs'

// Full-pipeline tests. Everything external is faked: gh returns canned JSON,
// reviewers are the local node fixture, git status is constant. No test in
// this file contacts the network or a model CLI.

const SHA = 'a'.repeat(40)
const DIFF = 'diff --git a/src/engine/tax.ts\n+++ b/src/engine/tax.ts\n+const x = 1\n'

function fakeGh() {
  return async (command, args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        number: 42,
        headRefOid: SHA,
        headRefName: 'codex/some-fix',
        baseRefName: 'main',
        title: 'Fix BBG cap',
        url: 'https://github.com/PeterHartwieg/Rentenrechner/pull/42',
      })
    }
    if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) return 'src/engine/tax.ts\n'
    if (args[0] === 'pr' && args[1] === 'diff') return DIFF
    throw new Error(`unexpected gh call: ${args.join(' ')}`)
  }
}

const FIXTURE = new URL('./test-fixtures/fake-reviewer.mjs', import.meta.url).pathname

// executeReview resolves binaries from env before spawning; point all three
// at the local node executable (guaranteed present and executable) so the
// availability preflight passes without touching any real model CLI.
Object.assign(process.env, {
  REVIEW_CLAUDE_BIN: process.execPath,
  REVIEW_GROK_BIN: process.execPath,
  REVIEW_CODEX_BIN: process.execPath,
})

// The pipeline passes `command` straight through; we derive the reviewer kind
// from the argv shape: codex starts with 'exec', grok carries --prompt-file,
// claude carries -p.
function kindFromArgs(args) {
  if (args[0] === 'exec') return 'codex'
  if (args.includes('--prompt-file')) return 'grok'
  return 'claude'
}

function pipelineSpawn(modes) {
  return (command, args, options) => {
    const kind = kindFromArgs(args)
    const env = { ...options.env, FAKE_REVIEW_CLI: kind, FAKE_REVIEW_MODE: modes[kind] ?? 'success' }
    return spawn(process.execPath, [FIXTURE, ...args], { ...options, env })
  }
}

async function runPipeline({ complex = false, modes = {}, verifyCommit = null } = {}) {
  const saved = []
  const result = await executeReview({
    pr: 42,
    complex,
    repoRoot: process.cwd(),
    verifyCommit,
    timeoutMs: 30_000,
    ghRun: fakeGh(),
    spawnImpl: pipelineSpawn(modes),
    runGitStatus: async () => '',
    now: new Date('2026-09-08T12:00:00Z'),
    save: ({ receipt }) => {
      saved.push(receipt)
      return `/fake/receipt-${saved.length}.json`
    },
  })
  return { ...result, saved }
}

describe('planReview', () => {
  it('plans the routine panel by default', async () => {
    const plan = await planReview({ pr: 42, repoRoot: process.cwd(), ghRun: fakeGh() })
    expect(plan.panel.kind).toBe('routine')
    expect(plan.panel.reviewers.map((r) => r.reviewer)).toEqual(['grok', 'claude'])
    expect(plan.prInfo.headSha).toBe(SHA)
    expect(plan.impact.breadth).toBe('broad')
    expect(plan.contextPaths).toContain('AGENTS.md')
  })

  it('plans the complex panel only when explicitly requested', async () => {
    const plan = await planReview({ pr: 42, complex: true, repoRoot: process.cwd(), ghRun: fakeGh() })
    expect(plan.panel.kind).toBe('complex')
    expect(plan.panel.reviewers.map((r) => r.reviewer)).toEqual(['claude', 'codex', 'grok'])
  })
})

describe('executeReview — routine panel', () => {
  it('approves when all reviewers complete with matching SHA and model', async () => {
    const result = await runPipeline()
    expect(result.ok).toBe(true)
    expect(result.decision).toBe('approve')
    expect(result.reviews).toHaveLength(2)
    expect(result.receipt.reviewers.map((r) => r.accepted)).toEqual([true, true])
    expect(result.receipt.panel.kind).toBe('routine')
    expect(result.saved).toHaveLength(1)
  }, 60_000)

  it('rejects when one reviewer rejects', async () => {
    const result = await runPipeline({ modes: { grok: 'reject' } })
    expect(result.decision).toBe('reject')
    expect(result.ok).toBe(true)
  }, 60_000)

  it('fails closed when a verdict restates the wrong SHA', async () => {
    const result = await runPipeline({ modes: { claude: 'wrong-sha' } })
    expect(result.decision).toBe('invalid')
    expect(result.ok).toBe(false)
    expect(result.reasons.join('\n')).toMatch(/does not match the reviewed head/)
    // The failed run is still recorded honestly in the receipt.
    expect(result.receipt.decision).toBe('invalid')
  }, 60_000)

  it('fails closed when a reviewer crashes (exit-1)', async () => {
    const result = await runPipeline({ modes: { grok: 'exit-1' } })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/exited with code 1/)
  }, 60_000)

  it('fails closed on malformed reviewer output', async () => {
    const result = await runPipeline({ modes: { claude: 'malformed' } })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/not valid JSON/)
  }, 60_000)
})

describe('executeReview — complex panel', () => {
  it('runs all three reviewers including codex and approves', async () => {
    const result = await runPipeline({ complex: true })
    expect(result.decision).toBe('approve')
    expect(result.receipt.reviewers.map((r) => r.reviewer)).toEqual(['claude', 'codex', 'grok'])
    expect(result.receipt.panel.note).toMatch(/explicit --complex/)
  }, 90_000)

  it('fails closed when codex reports the wrong model', async () => {
    const result = await runPipeline({ complex: true, modes: { codex: 'wrong-model' } })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/codex model identity mismatch/)
  }, 90_000)
})

describe('receipt contents from the pipeline', () => {
  it('carries diff digest, verify attestation claim, and reviewer identities', async () => {
    const result = await runPipeline({ verifyCommit: 'c'.repeat(40) })
    expect(result.receipt.diffDigest).toBe(await import('./lib/prInfo.mjs').then((m) => m.diffDigest(DIFF)))
    expect(result.receipt.deterministicVerification.verifiedAtCommit).toBe('c'.repeat(40))
    for (const reviewer of result.receipt.reviewers) {
      expect(reviewer.providerReportedModels.length).toBeGreaterThan(0)
      expect(reviewer.command).toBe(process.execPath)
    }
  }, 60_000)
})

describe('no live network or model access from review tooling', () => {
  const sourceFiles = listSources(join(process.cwd(), 'scripts', 'review'))

  it('review modules never contain direct network calls (gh subprocess is the only egress)', () => {
    expect(sourceFiles.length).toBeGreaterThan(10)
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\bfetch\s*\(/)
      expect(text, file).not.toMatch(/XMLHttpRequest/)
      expect(text, file).not.toMatch(/sendBeacon/)
      expect(text, file).not.toMatch(/https?\.request/)
      expect(text, file).not.toMatch(/axios/)
      expect(text, file).not.toMatch(/node:https/)
    }
  })

  it('the fake reviewer fixture documents its offline contract', () => {
    const text = readFileSync(FIXTURE, 'utf8')
    expect(text).toMatch(/NEVER contacts a model or the network/)
  })
})

function listSources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === 'test-fixtures' || name === 'node_modules') continue
      out.push(...listSources(path))
    } else if (/\.(mjs|ts)$/.test(name) && !name.endsWith('.test.mjs')) {
      out.push(path)
    }
  }
  return out
}

describe('source policy constant', () => {
  it('stays in sync with the documented report policy', () => {
    expect(DEFAULT_POLICY.captureStaleAfterMonths).toBe(6)
    expect(DEFAULT_POLICY.reviewStaleAfterMonths).toBe(6)
  })
})
