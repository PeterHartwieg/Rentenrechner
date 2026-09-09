// Optional publish step: commit status + concise PR comment.
//
// Publish is explicit (--publish), never automatic, and never merges.
//
// Only the CURRENT in-memory run can be published — there is deliberately no
// way to load a receipt file from disk and label a PR with it. A JSON file
// claiming `{ decision: "approve" }` proves nothing: the decision written to
// GitHub is always re-derived here from the fully validated per-reviewer
// records of the run in progress. The receipt object itself must match that
// re-derivation field for field, or publish aborts.
//
// GitHub commit statuses have no "neutral" state, so `needs-human` maps to
// `failure` — fail closed, never passably. Before an `approve`/`success` is
// written, the deterministic `verify` check run on the exact head SHA must
// have concluded `success` (missing, queued, or `skipped` all refuse). The
// toolchain is a local multi-model review: not a human approval and not a
// legal or expert certification — the comment and the status description say
// so.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RECEIPT_SCHEMA } from './receipts.mjs'
import { adjudicatePanel } from './verdicts.mjs'
import { fetchCurrentPrRefs } from './prInfo.mjs'

export const COMMIT_STATUS_CONTEXT = 'calculation-review'
export const REQUIRED_VERIFY_CHECK = 'verify'
// The repo's `verify` check runs on GitHub Actions; app id 15368 identifies
// Actions-owned check runs so a foreign check named `verify` cannot stand in.
export const GITHUB_ACTIONS_APP_ID = 15368

// GitHub statuses only allow success/failure/error/pending — no neutral.
// needs-human and reject both fail closed.
const DECISION_TO_STATUS_STATE = {
  approve: 'success',
  reject: 'failure',
  'needs-human': 'failure',
  invalid: 'error',
}

const DECISION_DESCRIPTIONS = {
  approve: 'local multi-model calculation review: approve (not a human approval)',
  reject: 'local multi-model calculation review: reject',
  'needs-human': 'local multi-model calculation review: needs human judgement — not approved',
  invalid: 'local multi-model calculation review: incomplete/failed run — not approved',
}

export function ownerRepoFromUrl(url) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/|$)/.exec(String(url ?? ''))
  if (!match) {
    throw new Error(`cannot derive owner/repo from PR URL: ${url ?? '(none)'}`)
  }
  return `${match[1]}/${match[2]}`
}

// Re-derives the panel decision from the in-memory validated reviews and
// checks the receipt agrees. Throws on ANY mismatch — a forged or stale
// receipt cannot be laundered into a status through this path.
export function assertReceiptMatchesRun({ receipt, prInfo, reviews }) {
  if (!receipt || receipt.schema !== RECEIPT_SCHEMA) {
    throw new Error(`receipt has unexpected schema ${JSON.stringify(receipt?.schema)}`)
  }
  for (const field of ['generatedAt', 'headSha', 'diffDigest', 'decision']) {
    if (typeof receipt[field] !== 'string' || receipt[field].length === 0) {
      throw new Error(`receipt field "${field}" is missing — refusing to publish an incomplete receipt`)
    }
  }
  if (receipt.pr !== prInfo.pr) throw new Error(`receipt PR ${receipt.pr} does not match the run PR ${prInfo.pr}`)
  if (receipt.headSha !== prInfo.headSha) {
    throw new Error(`receipt head ${receipt.headSha.slice(0, 8)} does not match the run head ${prInfo.headSha.slice(0, 8)}`)
  }
  if (receipt.diffDigest !== prInfo.diffDigest) throw new Error('receipt diff digest does not match the run diff')

  const rederived = adjudicatePanel(reviews)
  if (receipt.decision !== rederived.decision) {
    throw new Error(
      `receipt decision "${receipt.decision}" does not match the decision re-derived from the validated ` +
        `panel ("${rederived.decision}") — refusing to publish`,
    )
  }
  if (!Array.isArray(receipt.reviewers) || receipt.reviewers.length !== reviews.length) {
    throw new Error('receipt reviewer records do not match the run panel — refusing to publish')
  }
  // The panel that decided must be the full requested panel: every requested
  // reviewer/model pair present, none extra, none swapped. A publication path
  // handed arbitrary records must not be able to drop a missing reviewer and
  // still call the remainder "the panel".
  const requested = (receipt.panel?.reviewers ?? []).map((entry) => `${entry.reviewer}:${entry.model}`)
  const supplied = reviews.map((review) => `${review.reviewer}:${review.model}`)
  if (
    requested.length === 0 ||
    requested.length !== supplied.length ||
    [...requested].sort().join('|') !== [...supplied].sort().join('|')
  ) {
    throw new Error(
      `run reviews [${supplied.join(', ')}] do not constitute the requested panel ` +
        `[${requested.join(', ')}] — refusing to publish`,
    )
  }
  return rederived
}

// Picks the check run that decides the SHA's verification state, or refuses.
//
// The old rule sorted by `started_at` descending and read element 0. A queued
// run has no `started_at` yet (the API returns null until it starts), so the
// empty-string fallback sorted it LAST and an older success was published
// while a newer re-run was still queued — the exact opposite of the contract.
//
// Ordering is therefore never inferred from evidence the API does not give
// us. Check-run `id` is NOT used as a clock: GitHub documents ids as
// identifiers, not as a monotonic ordering guarantee, and the array order of
// `check_runs` is not documented either. The rules below use only fields the
// REST API documents for a check run (`status`, `conclusion`, `started_at`,
// `head_sha`), and any situation where "which run is newest" cannot be
// established from those fails closed instead of guessing:
//
// 1. ANY run that is not `completed` blocks. Verification for this SHA is in
//    flight and its outcome is unknown, so no timestamp comparison is needed
//    or attempted — this is what fixes the null-`started_at` queued re-run.
// 2. A single completed run needs no ordering: it is decisive.
// 3. Several completed runs are ordered by `started_at`. A completed run
//    without a parseable `started_at` makes the order unknowable → refuse.
// 4. If the newest `started_at` is tied between runs that disagree about the
//    conclusion, the order is unknowable → refuse. A tie where every run
//    agrees is decided by that shared conclusion, because the order cannot
//    change the answer.
//
// Returns { ok: true, run } or { ok: false, reason }.
export function selectDecisiveVerifyRun(candidates) {
  const pending = candidates.filter((entry) => entry.status !== 'completed')
  if (pending.length > 0) {
    const statuses = [...new Set(pending.map((entry) => String(entry.status ?? 'unknown')))].join('/')
    return {
      ok: false,
      reason:
        `is still ${statuses} — an older successful run cannot back an approval while a newer ` +
        'verification is pending',
    }
  }

  if (candidates.length === 1) return { ok: true, run: candidates[0] }

  const timed = candidates.map((entry) => ({ entry, startedAt: epochOrNull(entry.started_at) }))
  const undated = timed.filter((item) => item.startedAt === null)
  if (undated.length > 0) {
    return {
      ok: false,
      reason:
        `has ${candidates.length} completed runs and ${undated.length} of them carry no usable "started_at" ` +
        '— which run is newest cannot be established, so the evidence is refused rather than assumed',
    }
  }

  const newest = Math.max(...timed.map((item) => item.startedAt))
  const tied = timed.filter((item) => item.startedAt === newest)
  if (tied.length > 1) {
    const conclusions = [...new Set(tied.map((item) => String(item.entry.conclusion)))]
    if (conclusions.length > 1) {
      return {
        ok: false,
        reason:
          `has ${tied.length} runs sharing the newest "started_at" with differing conclusions ` +
          `(${conclusions.join(', ')}) — which one is newest cannot be established, so the evidence is refused`,
      }
    }
  }
  return { ok: true, run: tied[0].entry }
}

function epochOrNull(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export const CHECK_RUNS_PER_PAGE = 100
// A single commit having more than 1 000 `verify` check runs is not a state
// this gate should try to reason about; it stops and refuses instead.
export const CHECK_RUNS_MAX_PAGES = 10

// Builds one page request for the check-runs endpoint.
//
// `filter=all` is EXPLICIT. GitHub's "List check runs for a Git reference"
// documents `filter` as defaulting to `latest`, which filters check runs by
// their `completed_at` timestamp — so exactly the run this gate must honour
// (a queued re-run, which has no `completed_at` and no `started_at` yet) is
// the one a default request is most likely to omit. Asking for `all` is what
// makes "a newer pending run blocks an older success" a property of the
// request, not only of the local selection rule.
//
// `check_name` narrows server-side to the deterministic check, so pagination
// cannot push a `verify` run off the end behind dozens of unrelated checks.
// The GitHub-Actions app-id filter stays local: a third-party check may carry
// the same name, and only our own Actions run is evidence.
export function checkRunsRequestPath({ ownerRepo, sha, page = 1 }) {
  const query = new URLSearchParams({
    filter: 'all',
    check_name: REQUIRED_VERIFY_CHECK,
    per_page: String(CHECK_RUNS_PER_PAGE),
    page: String(page),
  })
  return `repos/${ownerRepo}/commits/${sha}/check-runs?${query.toString()}`
}

// Collects EVERY `verify` check run on the SHA, page by page, and fails
// closed on any incompleteness rather than judging a partial list:
//
// - a malformed page, a missing/non-numeric `total_count`, or a `check_runs`
//   that is not an array → refuse,
// - a `total_count` that changes between pages (the set moved while we read
//   it) → refuse: the snapshot is not coherent,
// - fewer runs collected than `total_count` once the pages run dry or the
//   page cap is hit → refuse.
//
// Pagination is done with explicit `page=` requests rather than
// `gh api --paginate` so the completeness check is ours: `--paginate`
// concatenates one JSON object per page, and a truncated or short read would
// otherwise be indistinguishable from a complete one.
export async function fetchVerifyCheckRuns({ run, ownerRepo, sha }) {
  const collected = []
  let expectedTotal = null

  for (let page = 1; page <= CHECK_RUNS_MAX_PAGES; page++) {
    let raw
    try {
      raw = await run('gh', [
        'api',
        checkRunsRequestPath({ ownerRepo, sha, page }),
        '-H',
        'Accept: application/vnd.github+json',
      ])
    } catch (error) {
      throw new Error(`could not read check runs for ${sha.slice(0, 8)}: ${error.message}`)
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('check-runs API returned malformed JSON')
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('check-runs API returned an unexpected shape (not a result object)')
    }
    if (!Number.isInteger(parsed.total_count) || parsed.total_count < 0) {
      throw new Error('check-runs API returned no usable "total_count" — the run list cannot be proven complete')
    }
    if (!Array.isArray(parsed.check_runs)) {
      throw new Error('check-runs API returned no "check_runs" list — the run list cannot be proven complete')
    }
    if (expectedTotal === null) expectedTotal = parsed.total_count
    else if (parsed.total_count !== expectedTotal) {
      throw new Error(
        `check runs for ${sha.slice(0, 8)} changed while they were being read ` +
          `(total_count ${expectedTotal} → ${parsed.total_count}) — refusing to judge an incoherent snapshot`,
      )
    }

    collected.push(...parsed.check_runs)
    if (collected.length >= expectedTotal) break
    if (parsed.check_runs.length === 0) break // no further pages, yet the total says otherwise
  }

  if (expectedTotal === null || collected.length < expectedTotal) {
    throw new Error(
      `check runs for ${sha.slice(0, 8)} could not be read completely ` +
        `(${collected.length} of ${expectedTotal ?? 'unknown'} returned) — an incomplete list can hide a pending ` +
        'run, so the evidence is refused rather than judged',
    )
  }
  return collected
}

// Reads the deterministic verify check run for the exact head SHA and
// requires the run that decides that SHA — see selectDecisiveVerifyRun — to
// have concluded `success`. A queued/in_progress run blocks an older success:
// the SHA's verification state is not settled while a run is in flight. Only
// GitHub Actions runs count (app id 15368) — a third-party check that happens
// to be named `verify` proves nothing about `npm run verify`.
export async function verifyCheckOnSha({ run, ownerRepo, sha }) {
  const runs = await fetchVerifyCheckRuns({ run, ownerRepo, sha })
  const verifyRuns = runs.filter((r) => r?.name === REQUIRED_VERIFY_CHECK && r.app?.id === GITHUB_ACTIONS_APP_ID)

  if (verifyRuns.length === 0) {
    const error = new Error(
      `no completed "${REQUIRED_VERIFY_CHECK}" check run found on ${sha.slice(0, 8)} — ` +
        'deterministic verification must succeed on this exact SHA before a review can be published as approving',
    )
    error.code = 'VERIFY_NOT_SUCCESSFUL'
    throw error
  }

  // The endpoint is per-commit, so every run it returns must belong to this
  // SHA. One that does not is an anomaly, and an anomaly in the evidence is
  // not evidence — checked across ALL candidates, before any selection.
  const foreign = verifyRuns.find((entry) => entry.head_sha !== sha)
  if (foreign) {
    const error = new Error(`"${REQUIRED_VERIFY_CHECK}" check run head ${foreign.head_sha} does not match ${sha}`)
    error.code = 'VERIFY_NOT_SUCCESSFUL'
    throw error
  }

  const selection = selectDecisiveVerifyRun(verifyRuns)
  if (!selection.ok) {
    const error = new Error(`"${REQUIRED_VERIFY_CHECK}" check on ${sha.slice(0, 8)} ${selection.reason}`)
    error.code = 'VERIFY_NOT_SUCCESSFUL'
    throw error
  }
  const latest = selection.run
  if (latest.conclusion !== 'success') {
    const error = new Error(
      `"${REQUIRED_VERIFY_CHECK}" check on ${sha.slice(0, 8)} concluded "${latest.conclusion}" — ` +
        'only a successful verify run can back an approving review status',
    )
    error.code = 'VERIFY_NOT_SUCCESSFUL'
    throw error
  }
  return { name: latest.name, conclusion: latest.conclusion, evidenceKind: 'actions-check-run' }
}

// Publishes the current in-memory run's decision as a commit status.
// Throws WITHOUT writing anything when: the receipt does not match the run,
// the PR head or base moved since the review (STALE_HEAD / PR_MOVED), or an
// approving decision lacks a successful verify check (VERIFY_NOT_SUCCESSFUL).
export async function publishRunStatus({ run, prInfo, reviews, receipt, comment = false }) {
  const adjudication = assertReceiptMatchesRun({ receipt, prInfo, reviews })
  const decision = adjudication.decision

  const state = DECISION_TO_STATUS_STATE[decision]
  if (!state) throw new Error(`decision "${decision}" has no commit-status mapping`)

  const current = await fetchCurrentPrRefs({ pr: prInfo.pr, run })
  if (current.headRefOid !== prInfo.headSha) {
    const error = new Error(
      `PR #${prInfo.pr} head moved since the review ` +
        `(reviewed ${prInfo.headSha.slice(0, 8)}, current ${current.headRefOid.slice(0, 8)}). ` +
        'Re-run the review on the new head.',
    )
    error.code = 'STALE_HEAD'
    throw error
  }
  if (current.baseRefOid !== prInfo.baseSha) {
    const error = new Error(
      `PR #${prInfo.pr} base moved since the review ` +
        `(reviewed base ${prInfo.baseSha.slice(0, 8)}, current ${current.baseRefOid.slice(0, 8)}); ` +
        'the reviewed diff no longer matches the PR.',
    )
    error.code = 'PR_MOVED'
    throw error
  }

  let verifyCheck = null
  if (state === 'success') {
    verifyCheck = await verifyCheckOnSha({ run, ownerRepo: ownerRepoFromUrl(prInfo.url), sha: prInfo.headSha })
  }

  await run('gh', [
    'api',
    `repos/{owner}/{repo}/statuses/${prInfo.headSha}`,
    '-f',
    `state=${state}`,
    '-f',
    `context=${COMMIT_STATUS_CONTEXT}`,
    '-f',
    `description=${DECISION_DESCRIPTIONS[decision]}`,
    '-f',
    `target_url=${prInfo.url ?? ''}`,
  ])

  if (comment) {
    await publishRunComment({ receipt, run, verifyCheck })
  }

  return { state, decision, headSha: prInfo.headSha, verifyCheck }
}

async function publishRunComment({ receipt, run, verifyCheck }) {
  const dir = mkdtempSync(join(tmpdir(), 'rentenwiki-review-comment-'))
  const bodyFile = join(dir, 'comment.md')
  try {
    writeFileSync(bodyFile, renderReceiptComment(receipt, { verifyCheck }), 'utf8')
    await run('gh', ['pr', 'comment', String(receipt.pr), '--body-file', bodyFile])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Honest, actionable summary: the decision, per-reviewer identities, the
// findings a follow-up should act on (blockers and uncertainties first), and
// what this review does NOT claim to be.
export function renderReceiptComment(receipt, { verifyCheck = null } = {}) {
  const lines = []
  lines.push('## Calculation review (local multi-model tooling)')
  lines.push('')
  lines.push(`- Decision: **${receipt.decision}**`)
  lines.push(`- Reviewed head: \`${receipt.headSha}\``)
  lines.push(`- Diff digest: \`${receipt.diffDigest.slice(0, 16)}…\``)
  lines.push(`- Scope: ${receipt.impact.breadth} (${receipt.impact.focusDomains.join(', ') || 'no calculation focus'})`)
  if (verifyCheck) {
    lines.push(`- Backing verify check: \`${verifyCheck.name}\` concluded \`${verifyCheck.conclusion}\` on this SHA`)
  }
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

  const actionable = receipt.reviewers.flatMap((reviewer) =>
    (reviewer.findings ?? [])
      .filter((finding) => finding.severity === 'blocker' || finding.severity === 'major')
      .map((finding) => ({ reviewer: reviewer.reviewer, ...finding })),
  )
  if (actionable.length > 0) {
    lines.push('### Actionable findings')
    lines.push('')
    for (const finding of actionable) {
      lines.push(`- **[${finding.severity}] ${finding.title}** (${finding.reviewer})`)
      if (finding.counterexampleOrTest) lines.push(`  - Counterexample/test: ${finding.counterexampleOrTest}`)
      if (finding.uncertainty && finding.uncertainty !== 'none') lines.push(`  - Uncertainty: ${finding.uncertainty}`)
    }
    lines.push('')
  }

  const unresolved = receipt.reviewers.flatMap((reviewer) =>
    (reviewer.unresolved ?? []).map((question) => ({ reviewer: reviewer.reviewer, question })),
  )
  if (unresolved.length > 0) {
    lines.push('### Unresolved questions')
    lines.push('')
    for (const item of unresolved) {
      lines.push(`- ${item.question} _(${item.reviewer})_`)
    }
    lines.push('')
  }

  lines.push(
    '_Machine-assisted review of calculations. Not investment, tax, or legal advice; not a human approval; ' +
      'no expert or legal certification is claimed. Deterministic `npm run verify` remains separately required._',
  )
  return lines.join('\n')
}
