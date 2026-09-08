// Optional publish step: commit status + concise PR comment.
//
// Publish is explicit (--publish), never automatic, and never merges. Before
// any write it re-fetches the PR's current head SHA and rejects if the PR
// moved since the receipt was written — a stale receipt must not be able to
// label a different commit as reviewed.
//
// Status description wording stays truthful: this tooling is a local
// multi-model review, not a human approval and not a legal sign-off.

import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RECEIPT_SCHEMA } from './receipts.mjs'
import { fetchCurrentHeadSha } from './prInfo.mjs'

export const COMMIT_STATUS_CONTEXT = 'calculation-review'

const DECISION_TO_STATUS_STATE = {
  approve: 'success',
  reject: 'failure',
  'needs-human': 'neutral',
  invalid: 'error',
}

const DECISION_DESCRIPTIONS = {
  approve: 'local multi-model calculation review: approve',
  reject: 'local multi-model calculation review: reject',
  'needs-human': 'local multi-model calculation review: needs human judgement',
  invalid: 'local multi-model calculation review: incomplete/failed run',
}

export function loadReceipt(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`cannot read receipt at ${path}: ${error.message}`)
  }
  let receipt
  try {
    receipt = JSON.parse(raw)
  } catch {
    throw new Error(`receipt at ${path} is not valid JSON`)
  }
  if (receipt?.schema !== RECEIPT_SCHEMA) {
    throw new Error(`receipt at ${path} has unexpected schema ${JSON.stringify(receipt?.schema)}`)
  }
  if (typeof receipt.headSha !== 'string' || !/^[0-9a-f]{40}$/.test(receipt.headSha)) {
    throw new Error(`receipt at ${path} carries no usable headSha`)
  }
  return receipt
}

// Publishes the receipt's decision as a commit status. Throws (without
// writing anything) when the PR head moved past the reviewed SHA.
export async function publishCommitStatus({ receipt, run, repoRoot = process.cwd(), comment = false }) {
  const currentHead = await fetchCurrentHeadSha({ pr: receipt.pr, run })
  if (currentHead !== receipt.headSha) {
    const error = new Error(
      `stale receipt: PR #${receipt.pr} head moved since the review ` +
        `(reviewed ${receipt.headSha}, current ${currentHead}). Re-run the review on the new head.`,
    )
    error.code = 'STALE_HEAD'
    throw error
  }

  const state = DECISION_TO_STATUS_STATE[receipt.decision]
  if (!state) {
    throw new Error(`receipt decision "${receipt.decision}" has no commit-status mapping`)
  }

  await run('gh', [
    'api',
    `repos/{owner}/{repo}/statuses/${receipt.headSha}`,
    '-f',
    `state=${state}`,
    '-f',
    `context=${COMMIT_STATUS_CONTEXT}`,
    '-f',
    `description=${DECISION_DESCRIPTIONS[receipt.decision]}`,
    '-f',
    `target_url=${receipt.prUrl ?? ''}`,
  ])

  if (comment) {
    await publishReceiptComment({ receipt, run })
  }

  return { state, headSha: currentHead }
}

async function publishReceiptComment({ receipt, run }) {
  const dir = mkdtempSync(join(tmpdir(), 'rentenwiki-review-comment-'))
  const bodyFile = join(dir, 'comment.md')
  try {
    writeFileSync(bodyFile, renderReceiptComment(receipt), 'utf8')
    await run('gh', ['pr', 'comment', String(receipt.pr), '--body-file', bodyFile])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Concise, honest summary. Full findings stay in the local receipt; the PR
// gets the decision, the reviewed SHA, and reviewer identities only.
export function renderReceiptComment(receipt) {
  const lines = []
  lines.push(`## Calculation review (local multi-model tooling)`)
  lines.push('')
  lines.push(`- Decision: **${receipt.decision}**`)
  lines.push(`- Reviewed head: \`${receipt.headSha}\``)
  lines.push(`- Diff digest: \`${receipt.diffDigest.slice(0, 16)}…\``)
  lines.push(`- Scope: ${receipt.impact.breadth} (${receipt.impact.focusDomains.join(', ') || 'cosmetic-only'})`)
  lines.push('')
  lines.push('| Reviewer | Requested model | Provider reported | Verdict |')
  lines.push('|---|---|---|---|')
  for (const reviewer of receipt.reviewers) {
    lines.push(
      `| ${reviewer.reviewer} | ${reviewer.requestedModel} | ${
        reviewer.providerReportedModels.join(', ') || '—'
      } | ${reviewer.accepted ? reviewer.verdict : `not accepted (${reviewer.failureReason ?? 'unknown'})`} |`,
    )
  }
  lines.push('')
  lines.push(
    '_Machine-assisted review of calculations. Not investment, tax, or legal advice; not a human approval. ' +
      'Deterministic `npm run verify` remains separately required._',
  )
  return lines.join('\n')
}
