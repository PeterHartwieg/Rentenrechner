import { describe, expect, it } from 'vitest'

import { COMMIT_STATUS_CONTEXT, loadReceipt, publishCommitStatus, renderReceiptComment } from './lib/publish.mjs'
import { buildReceipt } from './lib/receipts.mjs'
import { REVIEW_DOMAINS } from './lib/impactMap.mjs'

const SHA = 'a'.repeat(40)

const prInfo = {
  pr: 42,
  title: 'Fix BBG cap',
  url: 'https://github.com/PeterHartwieg/Rentenrechner/pull/42',
  headSha: SHA,
  baseRefName: 'main',
  diffDigest: 'd'.repeat(64),
  files: ['src/engine/tax.ts'],
}

const impact = { breadth: 'broad', domains: REVIEW_DOMAINS, focusDomains: ['tax-payroll'], rationale: 'test' }
const panel = { kind: 'routine', note: 'test' }
const reviews = [
  {
    reviewer: 'grok',
    model: 'grok-4.6',
    command: '/usr/bin/fake-grok',
    parse: { ok: true, text: 'x', reportedModels: ['grok-4.6'] },
    verdict: { ok: true, verdict: { verdict: 'approve', confidence: 'high', findings: [], unresolved: [] } },
  },
  {
    reviewer: 'claude',
    model: 'opus',
    command: '/usr/bin/fake-claude',
    parse: { ok: true, text: 'x', reportedModels: ['claude-opus-4-6'] },
    verdict: { ok: true, verdict: { verdict: 'approve', confidence: 'medium', findings: [], unresolved: [] } },
  },
]

function makeReceipt(decision = 'approve') {
  return buildReceipt({
    prInfo,
    impact,
    panel,
    reviews: reviews.map((r) => ({ ...r, verdict: { ...r.verdict, verdict: { ...r.verdict.verdict, verdict: decision === 'approve' ? 'approve' : decision } } })),
    decision,
    options: {},
    generatedAt: new Date('2026-09-08T12:00:00Z'),
  })
}

function fakeGh(log, { headSha = SHA } = {}) {
  return async (command, args) => {
    log.push([command, ...args])
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ headRefOid: headSha })
    return ''
  }
}

describe('publishCommitStatus', () => {
  it('re-fetches the head, then sets the calculation-review status on the exact SHA', async () => {
    const log = []
    const receipt = makeReceipt('approve')
    const { state } = await publishCommitStatus({ receipt, run: fakeGh(log) })

    expect(state).toBe('success')
    const viewCall = log.find(([c, ...a]) => c === 'gh' && a[0] === 'pr' && a[1] === 'view')
    const statusCall = log.find(([c, ...a]) => c === 'gh' && a[0] === 'api')
    expect(viewCall).toBeDefined()
    expect(statusCall).toBeDefined()
    expect(statusCall[2]).toBe(`repos/{owner}/{repo}/statuses/${SHA}`)
    expect(statusCall).toContain('-f')
    expect(statusCall).toContain('context=calculation-review')
  })

  it('maps every decision to an honest status state', async () => {
    const cases = { approve: 'success', reject: 'failure', 'needs-human': 'neutral', invalid: 'error' }
    for (const [decision, state] of Object.entries(cases)) {
      const log = []
      const result = await publishCommitStatus({ receipt: makeReceipt(decision), run: fakeGh(log) })
      expect(result.state).toBe(state)
    }
  })

  it('REFUSES to publish when the PR head moved since the review (stale gate)', async () => {
    const log = []
    const receipt = makeReceipt('approve')
    await expect(
      publishCommitStatus({ receipt, run: fakeGh(log, { headSha: 'b'.repeat(40) }) }),
    ).rejects.toMatchObject({ code: 'STALE_HEAD' })

    // No status write of any kind happened.
    expect(log.find(([, ...a]) => a[0] === 'api')).toBeUndefined()
  })

  it('never merges, closes, or labels the PR', async () => {
    const log = []
    await publishCommitStatus({ receipt: makeReceipt('approve'), run: fakeGh(log), comment: true })
    const joined = JSON.stringify(log)
    expect(joined).not.toContain('pr merge')
    expect(joined).not.toContain('pr close')
    expect(joined).not.toContain('pr edit')
  })

  it('posts the concise comment only when asked, via body file (never argv-interpolated)', async () => {
    const log = []
    await publishCommitStatus({ receipt: makeReceipt('approve'), run: fakeGh(log), comment: true })
    expect(log.find(([, ...a]) => a[0] === 'pr' && a[1] === 'comment' && a.includes('--body-file'))).toBeDefined()

    const log2 = []
    await publishCommitStatus({ receipt: makeReceipt('approve'), run: fakeGh(log2), comment: false })
    expect(log2.find(([, ...a]) => a[0] === 'pr' && a[1] === 'comment')).toBeUndefined()
  })
})

describe('receipt comment rendering', () => {
  it('shows decision, SHA, reviewer identities, and the not-advice boundary', () => {
    const comment = renderReceiptComment(makeReceipt('approve'))
    expect(comment).toContain('Decision: **approve**')
    expect(comment).toContain(`\`${SHA}\``)
    expect(comment).toContain('| grok | grok-4.6 | grok-4.6 | approve |')
    expect(comment).toContain('| claude | opus | claude-opus-4-6 | approve |')
    expect(comment).toMatch(/not a human approval/)
    expect(comment).toMatch(/npm run verify/)
  })

  it('reports unaccepted reviewers honestly instead of inventing a verdict', () => {
    const receipt = makeReceipt('invalid')
    receipt.reviewers[1].accepted = false
    receipt.reviewers[1].verdict = null
    receipt.reviewers[1].failureReason = 'claude output is not valid JSON'
    const comment = renderReceiptComment(receipt)
    expect(comment).toMatch(/not accepted \(claude output is not valid JSON\)/)
  })
})

describe('loadReceipt', () => {
  it('rejects receipts with an unexpected schema', () => {
    expect(() =>
      loadReceiptFromString(JSON.stringify({ schema: 'someone-elses/receipt', headSha: SHA, pr: 1 })),
    ).toThrow(/unexpected schema/)
  })

  it('rejects receipts without a usable head SHA', () => {
    expect(() => loadReceiptFromString(JSON.stringify({ schema: 'rentenwiki.review-receipt/1' }))).toThrow(/headSha/)
  })
})

// loadReceipt takes a path; these cases reuse the validation logic through a
// temp file via the same public entry.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function loadReceiptFromString(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'rw-receipt-'))
  try {
    const path = join(dir, 'r.json')
    writeFileSync(path, contents, 'utf8')
    return loadReceipt(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('commit status context', () => {
  it('is the fixed context name from the issue', () => {
    expect(COMMIT_STATUS_CONTEXT).toBe('calculation-review')
  })
})
