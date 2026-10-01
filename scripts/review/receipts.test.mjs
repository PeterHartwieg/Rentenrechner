import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RECEIPTS_DIR, RECEIPT_SCHEMA, buildReceipt, receiptFilename, saveReceipt, textDigest } from './lib/receipts.mjs'
import { REVIEW_DOMAINS } from './lib/impactMap.mjs'

const prInfo = {
  pr: 42,
  title: 'Fix BBG cap',
  url: 'https://github.com/PeterHartwieg/Rentenrechner/pull/42',
  headSha: 'a'.repeat(40),
  baseRefName: 'main',
  diffDigest: 'd'.repeat(64),
  files: ['src/engine/tax.ts'],
}
const impact = { breadth: 'broad', domains: REVIEW_DOMAINS, focusDomains: ['tax-payroll'], rationale: 'test' }
const panel = { kind: 'routine', note: 'routine panel (default)' }
const reviews = [
  {
    reviewer: 'grok',
    model: 'grok-4.6',
    command: '/usr/bin/fake-grok',
    parse: { ok: true, text: 'x', reportedModels: ['grok-4.6'] },
    verdict: {
      ok: true,
      verdict: {
        verdict: 'approve',
        confidence: 'high',
        findings: [],
        unresolved: ['Question about § 34d interpretation'],
      },
    },
  },
]

function makeReceipt(options) {
  return buildReceipt({
    prInfo,
    impact,
    panel,
    reviews,
    decision: 'approve',
    options,
    generatedAt: new Date('2026-09-08T12:00:00Z'),
  })
}

describe('buildReceipt', () => {
  it('records anchor, scope, reviewer identity (requested AND provider-reported), and verdicts', () => {
    const receipt = makeReceipt({})
    expect(receipt.schema).toBe(RECEIPT_SCHEMA)
    expect(receipt.headSha).toBe(prInfo.headSha)
    expect(receipt.diffDigest).toBe(prInfo.diffDigest)
    expect(receipt.impact.breadth).toBe('broad')
    expect(receipt.reviewers).toHaveLength(1)
    expect(receipt.reviewers[0]).toMatchObject({
      reviewer: 'grok',
      requestedModel: 'grok-4.6',
      providerReportedModels: ['grok-4.6'],
      verdict: 'approve',
      accepted: true,
    })
    expect(receipt.reviewers[0].unresolved).toEqual(['Question about § 34d interpretation'])
  })

  it('records verify attestation as a claim, not as evidence produced by the tool', () => {
    const attested = makeReceipt({ verifyCommit: 'c'.repeat(40) })
    expect(attested.deterministicVerification).toMatchObject({
      command: 'npm run verify',
      verifiedAtCommit: 'c'.repeat(40),
    })
    expect(attested.deterministicVerification.note).toMatch(/caller attested/)

    const unattested = makeReceipt({})
    expect(unattested.deterministicVerification.verifiedAtCommit).toBeNull()
    expect(unattested.deterministicVerification.note).toMatch(/separately required/)
  })

  it('keeps failed reviewers with their failure reason instead of dropping them', () => {
    const receipt = buildReceipt({
      prInfo,
      impact,
      panel,
      reviews: [
        {
          reviewer: 'claude',
          model: 'opus',
          command: '/usr/bin/fake-claude',
          parse: { ok: false, reason: 'claude did not complete successfully (subtype: error_max_turns)' },
          verdict: null,
        },
      ],
      decision: 'invalid',
      options: {},
      generatedAt: new Date('2026-09-08T12:00:00Z'),
    })
    expect(receipt.reviewers[0]).toMatchObject({
      accepted: false,
      verdict: null,
      failureReason: expect.stringMatching(/error_max_turns/),
    })
    expect(receipt.decision).toBe('invalid')
  })

  it('requires an explicit timestamp (no hidden clock)', () => {
    expect(() =>
      buildReceipt({ prInfo, impact, panel, reviews, decision: 'approve', options: {}, generatedAt: undefined }),
    ).toThrow(/explicit generatedAt/)
  })
})

describe('receipt storage', () => {
  it('names receipts by PR, short SHA, and timestamp', () => {
    expect(receiptFilename({ pr: 42, headSha: prInfo.headSha, generatedAt: new Date('2026-09-08T12:00:00Z') })).toBe(
      'pr-42-aaaaaaaa-2026-09-08T12-00-00-000Z.json',
    )
  })

  it('saves into a gitignored local directory', () => {
    const dirPath = mkdtempSync(join(tmpdir(), 'rw-save-'))
    try {
      const path = saveReceipt({ receipt: makeReceipt({}), repoRoot: dirPath })
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      expect(saved.schema).toBe(RECEIPT_SCHEMA)

      const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8')
      expect(gitignore).toMatch(/\.review-receipts\//)
      expect(RECEIPTS_DIR).toBe('.review-receipts')
    } finally {
      rmSync(dirPath, { recursive: true, force: true })
    }
  })
})

describe('textDigest', () => {
  it('is a stable sha256', () => {
    expect(textDigest('abc')).toBe(textDigest('abc'))
    expect(textDigest('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(textDigest('abc')).not.toBe(textDigest('abd'))
  })
})
