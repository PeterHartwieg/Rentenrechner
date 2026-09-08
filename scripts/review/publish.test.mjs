import { describe, expect, it } from 'vitest'

import {
  COMMIT_STATUS_CONTEXT,
  REQUIRED_VERIFY_CHECK,
  assertReceiptMatchesRun,
  ownerRepoFromUrl,
  publishRunStatus,
  renderReceiptComment,
  verifyCheckOnSha,
} from './lib/publish.mjs'
import { adjudicatePanel } from './lib/verdicts.mjs'
import { buildReceipt } from './lib/receipts.mjs'
import { mapImpact } from './lib/impactMap.mjs'
import { selectPanel } from './lib/panels.mjs'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const DIGEST = 'c'.repeat(64)
const PR_URL = 'https://github.com/PeterHartwieg/Rentenrechner/pull/42'

const PR_INFO = {
  pr: 42,
  headSha: HEAD,
  baseSha: BASE,
  baseRefName: 'main',
  url: PR_URL,
  diffDigest: DIGEST,
}

function finding(overrides = {}) {
  return {
    title: 'BBG cap applied to the wrong year',
    severity: 'blocker',
    source: '§34d EStG, https://www.gesetze-im-internet.de/estg/__34d.html',
    applicableDate: '2026-01-01',
    interpretation: 'The 2026 BBG applies; the code still uses the 2025 value.',
    counterexampleOrTest: 'Salary 90000, age 60 -> expect cap X, engine returns Y. Test: bav-cap.test.ts',
    uncertainty: 'none',
    ...overrides,
  }
}

// Two fully validated reviewer records (the routine panel).
function validatedReviews(overrides = {}) {
  const make = (reviewer, model, verdictValue = 'approve', extra = {}) => ({
    reviewer,
    model,
    command: `/bin/${reviewer}`,
    parse: {
      ok: true,
      text: 'verdict text',
      reportedModels: [model === 'opus' ? 'claude-opus-5' : model],
      meta: { identityEvidence: 'native-model-usage-keys' },
    },
    verdict: {
      ok: true,
      verdict: {
        pr: 42,
        headSha: HEAD,
        verdict: verdictValue,
        confidence: 'high',
        findings: extra.findings ?? [],
        unresolved: extra.unresolved ?? [],
      },
    },
  })
  return [
    make('grok', 'grok-4.6', overrides.grokVerdict ?? 'approve', overrides),
    make('claude', 'opus', overrides.claudeVerdict ?? 'approve', overrides),
  ]
}

function makeReceipt(reviews, decision) {
  return buildReceipt({
    prInfo: { pr: 42, title: 'Fix BBG cap', url: PR_URL, headSha: HEAD, baseRefName: 'main', diffDigest: DIGEST, files: ['src/engine/tax.ts'] },
    impact: mapImpact(['src/engine/tax.ts']),
    panel: selectPanel({ complex: false }),
    reviews,
    decision,
    options: {},
    generatedAt: new Date('2026-09-08T12:00:00Z'),
  })
}

function fakeGh({ headRefOid = HEAD, baseRefOid = BASE, checkRuns = [], comment = true } = {}) {
  const log = []
  const run = async (command, args) => {
    log.push([command, ...args])
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({ number: 42, headRefOid, baseRefOid, headRefName: 'x', baseRefName: 'main', title: 't' })
    }
    if (command === 'gh' && args[0] === 'api' && args[1]?.includes('/check-runs')) {
      return JSON.stringify({ total_count: checkRuns.length, check_runs: checkRuns })
    }
    return ''
  }
  return { run, log, commentCalls: () => log.filter((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'comment') }
}

const VERIFY_SUCCESS = {
  name: REQUIRED_VERIFY_CHECK,
  status: 'completed',
  conclusion: 'success',
  head_sha: HEAD,
  app: { id: 15368 },
}

describe('ownerRepoFromUrl', () => {
  it('derives owner/repo from the PR URL', () => {
    expect(ownerRepoFromUrl(PR_URL)).toBe('PeterHartwieg/Rentenrechner')
    expect(() => ownerRepoFromUrl('https://gitlab.com/x/y/pull/1')).toThrow(/owner\/repo/)
  })
})

describe('assertReceiptMatchesRun — a receipt file cannot forge a decision', () => {
  it('accepts a receipt that matches its in-memory run and returns the re-derived decision', () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    const rederived = assertReceiptMatchesRun({ receipt, prInfo: PR_INFO, reviews })
    expect(rederived.decision).toBe('approve')
  })

  it('rejects a receipt whose decision was tampered with', () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    receipt.decision = 'approve'
    const doctoredReviews = validatedReviews({ grokVerdict: 'reject' })
    // Same receipt, different panel: re-derivation must win over the receipt.
    expect(() => assertReceiptMatchesRun({ receipt, prInfo: PR_INFO, reviews: doctoredReviews })).toThrow(
      /does not match the decision re-derived/,
    )
  })

  it('rejects receipts with missing fields, wrong PR, wrong head, wrong digest, or wrong panel', () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    expect(() => assertReceiptMatchesRun({ receipt: { ...receipt, schema: 'other/1' }, prInfo: PR_INFO, reviews })).toThrow(/schema/)
    expect(() => assertReceiptMatchesRun({ receipt: { ...receipt, generatedAt: '' }, prInfo: PR_INFO, reviews })).toThrow(
      /generatedAt/,
    )
    expect(() => assertReceiptMatchesRun({ receipt: { ...receipt, pr: 7 }, prInfo: PR_INFO, reviews })).toThrow(/receipt PR/)
    expect(() =>
      assertReceiptMatchesRun({ receipt: { ...receipt, headSha: 'f'.repeat(40) }, prInfo: PR_INFO, reviews }),
    ).toThrow(/does not match the run head/)
    expect(() =>
      assertReceiptMatchesRun({ receipt: { ...receipt, diffDigest: '0'.repeat(64) }, prInfo: PR_INFO, reviews }),
    ).toThrow(/diff digest/)
    expect(() => assertReceiptMatchesRun({ receipt, prInfo: PR_INFO, reviews: reviews.slice(0, 1) })).toThrow(
      /reviewer records/,
    )
  })

  it('refuses when the supplied records are not the requested panel (a reviewer is missing or swapped)', () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    // Same count, wrong identity: the claude record replaced by a stranger.
    const swapped = [
      reviews[0],
      { ...reviews[1], reviewer: 'stranger', model: 'opus' },
    ]
    expect(() => assertReceiptMatchesRun({ receipt, prInfo: PR_INFO, reviews: swapped })).toThrow(
      /do not constitute the requested panel/,
    )
  })
})

describe('verifyCheckOnSha — skipped is not success', () => {
  it('accepts the latest completed verify run concluding success on the exact SHA', async () => {
    const { run } = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
    const result = await verifyCheckOnSha({ run, ownerRepo: 'PeterHartwieg/Rentenrechner', sha: HEAD })
    expect(result.conclusion).toBe('success')
    expect(result.evidenceKind).toBe('actions-check-run')
  })

  it('fails closed when the check is missing, queued, or skipped', async () => {
    const cases = [
      [],
      [{ name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'skipped', head_sha: HEAD, app: { id: 15368 } }],
      [{ name: 'other-check', status: 'completed', conclusion: 'success', head_sha: HEAD, app: { id: 15368 } }],
      // A third-party check named "verify" is not OUR deterministic verification.
      [{ name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'success', head_sha: HEAD, app: { id: 999999 } }],
      [{ name: REQUIRED_VERIFY_CHECK, status: 'in_progress', conclusion: null, head_sha: HEAD, app: { id: 15368 } }],
      [{ name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'failure', head_sha: HEAD, app: { id: 15368 } }],
      [{ name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'success', head_sha: 'e'.repeat(40), app: { id: 15368 } }],
    ]
    for (const checkRuns of cases) {
      const { run } = fakeGh({ checkRuns })
      await expect(
        verifyCheckOnSha({ run, ownerRepo: 'PeterHartwieg/Rentenrechner', sha: HEAD }),
      ).rejects.toMatchObject({ code: 'VERIFY_NOT_SUCCESSFUL' })
    }
  })

  it('blocks on a newer pending run even when an older run succeeded', async () => {
    const { run } = fakeGh({
      checkRuns: [
        { name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'success', head_sha: HEAD, app: { id: 15368 }, started_at: '2026-09-08T10:00:00Z' },
        { name: REQUIRED_VERIFY_CHECK, status: 'queued', conclusion: null, head_sha: HEAD, app: { id: 15368 }, started_at: '2026-09-08T11:00:00Z' },
      ],
    })
    await expect(
      verifyCheckOnSha({ run, ownerRepo: 'PeterHartwieg/Rentenrechner', sha: HEAD }),
    ).rejects.toThrow(/is still queued.*older successful run cannot back an approval/s)
  })

  it('judges by the MOST RECENT completed run (a re-run heals an older failure)', async () => {
    const { run } = fakeGh({
      checkRuns: [
        { name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'failure', head_sha: HEAD, app: { id: 15368 }, started_at: '2026-09-08T10:00:00Z' },
        { name: REQUIRED_VERIFY_CHECK, status: 'completed', conclusion: 'success', head_sha: HEAD, app: { id: 15368 }, started_at: '2026-09-08T11:00:00Z' },
      ],
    })
    const result = await verifyCheckOnSha({ run, ownerRepo: 'PeterHartwieg/Rentenrechner', sha: HEAD })
    expect(result.conclusion).toBe('success')
  })
})

describe('publishRunStatus', () => {
  it('publishes an approving run only after the verify check succeeds, and writes the status first-class', async () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, adjudicatePanel(reviews).decision)
    const { run, log } = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
    const result = await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt })

    expect(result.state).toBe('success')
    expect(result.decision).toBe('approve')
    const statusCall = log.find((c) => c[0] === 'gh' && c[1] === 'api' && c[2]?.includes('/statuses/'))
    const verifyCall = log.find((c) => c[0] === 'gh' && c[1] === 'api' && c[2]?.includes('/check-runs'))
    expect(statusCall).toBeDefined()
    expect(verifyCall).toBeDefined()
    // Verify gate runs BEFORE the status is written.
    expect(log.indexOf(verifyCall)).toBeLessThan(log.indexOf(statusCall))
    expect(statusCall).toContain('-f')
    expect(statusCall).toContain('state=success')
    expect(statusCall).toContain(`context=${COMMIT_STATUS_CONTEXT}`)
    expect(statusCall[2]).toContain(`statuses/${HEAD}`)
  })

  it('maps needs-human to failure — GitHub has no neutral and the gate must fail closed', async () => {
    const reviews = validatedReviews({ grokVerdict: 'needs-human', claudeVerdict: 'needs-human' })
    const receipt = makeReceipt(reviews, adjudicatePanel(reviews).decision)
    const { run, log } = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
    const result = await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt })
    expect(result.state).toBe('failure')
    const statusCall = log.find((c) => c[2]?.includes('/statuses/'))
    expect(statusCall).toContain('state=failure')
  })

  it('writes failure for reject and error for an invalid panel without needing the verify gate', async () => {
    const rejectReviews = validatedReviews({ grokVerdict: 'reject' })
    const rejectReceipt = makeReceipt(rejectReviews, adjudicatePanel(rejectReviews).decision)
    const rejectRun = fakeGh()
    expect((await publishRunStatus({ run: rejectRun.run, prInfo: PR_INFO, reviews: rejectReviews, receipt: rejectReceipt })).state).toBe('failure')
    expect(rejectRun.log.some((c) => c[2]?.includes('/check-runs'))).toBe(false)

    const invalidReviews = [
      ...validatedReviews(),
      {
        reviewer: 'extra',
        model: 'x',
        command: '/bin/x',
        parse: { ok: false, reason: 'boom' },
        verdict: null,
      },
    ]
    // The receipt must be built from a panel that actually requested all three
    // records — otherwise the panel-completeness check (correctly) fires
    // before the invalid→error mapping is reached.
    const routinePanel = selectPanel({ complex: false })
    const invalidReceipt = buildReceipt({
      prInfo: { pr: 42, title: 'Fix BBG cap', url: PR_URL, headSha: HEAD, baseRefName: 'main', diffDigest: DIGEST, files: ['src/engine/tax.ts'] },
      impact: mapImpact(['src/engine/tax.ts']),
      panel: {
        ...routinePanel,
        reviewers: [...routinePanel.reviewers, { reviewer: 'extra', model: 'x' }],
      },
      reviews: invalidReviews,
      decision: adjudicatePanel(invalidReviews).decision,
      options: {},
      generatedAt: new Date('2026-09-08T12:00:00Z'),
    })
    const invalidRun = fakeGh()
    expect(
      (await publishRunStatus({ run: invalidRun.run, prInfo: PR_INFO, reviews: invalidReviews, receipt: invalidReceipt })).state,
    ).toBe('error')
  })

  it('refuses to publish when the PR head moved (STALE_HEAD) and writes nothing', async () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    const { run, log } = fakeGh({ headRefOid: 'd'.repeat(40), checkRuns: [VERIFY_SUCCESS] })
    const error = await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt }).catch((e) => e)
    expect(error.code).toBe('STALE_HEAD')
    expect(log.some((c) => c[2]?.includes('/statuses/'))).toBe(false)
  })

  it('refuses to publish when the PR BASE moved (PR_MOVED) and writes nothing', async () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    const { run, log } = fakeGh({ baseRefOid: 'e'.repeat(40), checkRuns: [VERIFY_SUCCESS] })
    const error = await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(log.some((c) => c[2]?.includes('/statuses/'))).toBe(false)
  })

  it('refuses to publish an approve when the verify check did not succeed on the same SHA', async () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    const { run, log } = fakeGh({ checkRuns: [] })
    const error = await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt }).catch((e) => e)
    expect(error.code).toBe('VERIFY_NOT_SUCCESSFUL')
    expect(log.some((c) => c[2]?.includes('/statuses/'))).toBe(false)
  })

  it('posts a comment carrying findings and uncertainties, without claiming certification', async () => {
    const reviews = validatedReviews({
      findings: [
        finding(),
        finding({ title: 'Minor copy nit', severity: 'minor', uncertainty: 'Wording of the disclaimer link.' }),
      ],
      unresolved: ['Does the §10 Abs. 3 cap apply before or after the employer subsidy?'],
    })
    const receipt = makeReceipt(reviews, adjudicatePanel(reviews).decision)
    const { run, commentCalls } = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
    await publishRunStatus({ run, prInfo: PR_INFO, reviews, receipt, comment: true })

    expect(commentCalls()).toHaveLength(1)
    expect(commentCalls()[0]).toContain('--body-file')
  })
})

describe('renderReceiptComment — actionable, honest output', () => {
  it('includes blockers, counterexamples, unresolved questions, and the not-a-certification boundary', () => {
    const reviews = validatedReviews({
      findings: [finding(), finding({ title: 'Tiny', severity: 'minor' })],
      unresolved: ['Is the 2027 AVD cap final?'],
    })
    const receipt = makeReceipt(reviews, 'approve')
    const comment = renderReceiptComment(receipt, { verifyCheck: { name: 'verify', conclusion: 'success' } })
    expect(comment).toMatch(/\[blocker\] BBG cap applied to the wrong year/)
    expect(comment).toMatch(/Salary 90000, age 60/)
    expect(comment).toMatch(/Unresolved questions/)
    expect(comment).toMatch(/Is the 2027 AVD cap final\?/)
    expect(comment).toMatch(/verify` concluded `success`|verify.*success/)
    expect(comment).toMatch(/no expert or legal certification/)
    expect(comment).not.toMatch(/certified by|approved by a human/)
  })

  it('omits empty finding sections and still states the boundary', () => {
    const reviews = validatedReviews()
    const receipt = makeReceipt(reviews, 'approve')
    const comment = renderReceiptComment(receipt)
    expect(comment).not.toMatch(/Actionable findings/)
    expect(comment).toMatch(/not a human approval/)
  })
})
