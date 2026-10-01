// Machine-readable local review receipts.
//
// A receipt is the durable record of one review run: what was reviewed
// (exact SHA + diff digest), who reviewed it (command model AND the
// provider-reported identity), what each reviewer decided, and the state of
// deterministic verification. Receipts live in .review-receipts/ (gitignored)
// on the operator's machine.
//
// Receipts found inside a PR diff are never trusted — impactMap.mjs filters
// approval-shaped paths out of reviewer context, and publish never reads a
// receipt from the repo.

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RECEIPT_SCHEMA = 'rentenwiki.review-receipt/1'
export const RECEIPTS_DIR = '.review-receipts'

export function buildReceipt({ prInfo, impact, panel, reviews, decision, options = {}, generatedAt }) {
  if (!generatedAt) throw new Error('receipt requires an explicit generatedAt timestamp')

  return {
    schema: RECEIPT_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    pr: prInfo.pr,
    prTitle: prInfo.title,
    prUrl: prInfo.url,
    headSha: prInfo.headSha,
    baseRefName: prInfo.baseRefName,
    // The LIVE base commit the review was pinned against (branch ref target),
    // plus what the PR record itself reported — kept distinct so a stale PR
    // snapshot is visible in the receipt instead of silently standing in for
    // the branch.
    baseSha: prInfo.baseSha ?? null,
    baseSnapshotSha: prInfo.baseSnapshotSha ?? null,
    diffDigest: prInfo.diffDigest,
    diffFiles: prInfo.files,
    impact: {
      breadth: impact.breadth,
      domains: impact.domains,
      focusDomains: impact.focusDomains,
      rationale: impact.rationale,
    },
    // reviewers are carried in the receipt so a later publisher can prove the
    // records it was handed ARE the requested panel (no dropped reviewer).
    panel: { kind: panel.kind, note: panel.note, reviewers: panel.reviewers ?? [] },
    reviewers: reviews.map((review) => ({
      reviewer: review.reviewer,
      requestedModel: review.model,
      providerReportedModels: review.parse?.reportedModels ?? [],
      // Models that appear in the provider's usage metadata but did NOT
      // produce the review (e.g. a CLI's auxiliary model handling side
      // requests). Bookkeeping only — never identity evidence.
      auxiliaryUsageModels: review.parse?.auxiliaryModels ?? review.parse?.meta?.auxiliaryModels ?? [],
      // Honest provenance of the identity claim:
      // "native-assistant-message-models" (claude stream-json assistant
      // messages), "native-model-usage-keys" (grok envelope keys), or
      // "cli-session-turn-context" (codex rollout session file). Never a
      // server-side attestation.
      identityEvidence: review.parse?.meta?.identityEvidence ?? null,
      command: review.command ?? null,
      // Per-reviewer invocation window (from the injected clock) — distinct
      // from the receipt's panel-level generatedAt. This is what makes the
      // timing reproducible: a long first reviewer must not push a later
      // reviewer's identity evidence outside its own window.
      startedAt: review.startedAt ?? null,
      completedAt: review.completedAt ?? null,
      verdict: review.verdict?.ok ? review.verdict.verdict.verdict : null,
      confidence: review.verdict?.ok ? review.verdict.verdict.confidence ?? null : null,
      findings: review.verdict?.ok ? review.verdict.verdict.findings ?? [] : [],
      unresolved: review.verdict?.ok ? review.verdict.verdict.unresolved ?? [] : [],
      accepted: review.parse?.ok === true && review.verdict?.ok === true,
      failureReason: review.parse?.ok === true ? review.verdict?.reason ?? null : review.parse?.reason ?? null,
      meta: review.meta ?? {},
    })),
    decision,
    deterministicVerification: {
      command: 'npm run verify',
      // The review tool never runs tests itself; the caller may attest the
      // commit it verified. Recorded as a claim, not evidence produced here.
      verifiedAtCommit: options.verifyCommit ?? null,
      note: options.verifyCommit
        ? 'caller attested npm run verify passed at this commit'
        : 'no verify attestation supplied with this run; deterministic verify remains separately required',
    },
    published: null,
  }
}

export function receiptFilename({ pr, headSha, generatedAt }) {
  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-')
  return `pr-${pr}-${headSha.slice(0, 8)}-${stamp}.json`
}

export function saveReceipt({ receipt, repoRoot, receiptsDir = RECEIPTS_DIR }) {
  const dir = join(repoRoot, receiptsDir)
  mkdirSync(dir, { recursive: true })
  const name = receiptFilename({ pr: receipt.pr, headSha: receipt.headSha, generatedAt: new Date(receipt.generatedAt) })
  const path = join(dir, name)
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return path
}

// Convenience for receipts + logs: short digest of arbitrary prompt text.
export function textDigest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
