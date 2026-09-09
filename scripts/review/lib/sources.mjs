// Source-freshness logic: parsing research-doc headers, assembling the
// catalog, assessing staleness, rendering the deterministic report.
//
// Two distinct dates per source:
//   lastCaptured — when evidence was last taken FROM the source (captured
//                  values, researched facts, targeted updates).
//   lastReviewed — when a human/agent last REVIEWED the source against the
//                  implementation. Unknown review dates stay null: "we have
//                  no record" must never masquerade as "recently reviewed".
//
// A reachable link is never treated as legal approval, and neither is a
// recent capture date. The report says so on every render.
//
// Dates are validated as real calendar dates (not just YYYY-MM-DD shaped) and
// measured against the injected clock: an impossible date renders as
// `invalid-date` and a date in the future as `future-dated`. Neither is ever
// `fresh`, and both need attention.

export const DEFAULT_POLICY = {
  captureStaleAfterMonths: 6,
  reviewStaleAfterMonths: 6,
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// A shape check is not a date check: "2026-02-31" matches the regex, and
// `new Date('2026-02-31')` silently rolls over to 2026-03-03 — a date that
// would then be measured, and possibly labelled fresh, as if it existed.
// Round-tripping through UTC is the cheap way to reject it: the parsed
// components must come back out unchanged.
export function isRealCalendarDate(value) {
  const match = typeof value === 'string' ? value.match(ISO_DATE) : null
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  )
}

// Header vocabulary used across the root *_RESEARCH.md / LEGAL_*.md docs.
// "Last researched" and "Targeted update" count as CAPTURE activity;
// "Last reviewed" / "Last audited" / "Last structured review" count as
// REVIEW activity.
const CAPTURE_HEADER_PATTERNS = [
  /^Last researched:\s*(\d{4}-\d{2}-\d{2})/im,
  /^Targeted update:\s*(\d{4}-\d{2}-\d{2})/im,
]
const REVIEW_HEADER_PATTERNS = [
  /^Last reviewed:\s*(\d{4}-\d{2}-\d{2})/im,
  /^Last audited:\s*(\d{4}-\d{2}-\d{2})/im,
  /^Last structured review:\s*(\d{4}-\d{2}-\d{2})/im,
]

function latestDate(dates) {
  const valid = dates.filter((d) => d !== null)
  if (valid.length === 0) return null
  return valid.sort().at(-1)
}

export function parseResearchDocHeaders(text) {
  const pick = (patterns) =>
    latestDate(
      // A header carrying an impossible date (typo) is treated as NO date:
      // the doc then renders as "no record" instead of contributing a date
      // that never existed. Parsed prose degrades; curated records below
      // fail loudly.
      patterns.map((pattern) => {
        const match = text.match(pattern)
        return match && isRealCalendarDate(match[1]) ? match[1] : null
      }),
    )
  return {
    lastCaptured: pick(CAPTURE_HEADER_PATTERNS),
    lastReviewed: pick(REVIEW_HEADER_PATTERNS),
  }
}

// goldenSources: [{ id, label, url, capturedAt }] (the validationSources
// entries from src/test/externalGoldenFixtures.ts — reused, not duplicated).
// researchDocEntries: [{ path, label, areas, headers: { lastCaptured, lastReviewed } }]
// goldenAreas: { [validationSourceId]: string[] }
// goldenReviews: { [validationSourceId]: { lastReviewed, note? } } — explicit
// review records for golden sources, kept in sourceCatalog.mjs. Capture and
// review stay distinct: a fresh capture date never satisfies the review
// column, and an empty record set (the honest initial state) renders every
// golden source as "never-reviewed" instead of inventing dates.
export function buildCatalog({ goldenSources, researchDocEntries, goldenAreas, goldenReviews = {} }) {
  const knownIds = new Set(goldenSources.map((source) => source.id))
  for (const [id, record] of Object.entries(goldenReviews)) {
    if (!knownIds.has(id)) {
      throw new Error(`golden review record references unknown golden source id "${id}" — keys must match validationSources ids`)
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`golden review record for "${id}" must be an object with lastReviewed`)
    }
    if (typeof record.lastReviewed !== 'string' || !isRealCalendarDate(record.lastReviewed)) {
      throw new Error(
        `golden review record for "${id}" has an invalid lastReviewed date "${record.lastReviewed}" — ` +
          'use a real calendar date in YYYY-MM-DD form',
      )
    }
    if (record.note !== undefined && typeof record.note !== 'string') {
      throw new Error(`golden review record for "${id}" has a non-string note`)
    }
  }

  const entries = []

  for (const source of goldenSources) {
    const review = goldenReviews[source.id]
    entries.push({
      id: source.id,
      kind: 'golden-source',
      label: source.label,
      areas: goldenAreas[source.id] ?? [],
      location: source.url,
      lastCaptured: source.capturedAt ?? null,
      lastReviewed: review?.lastReviewed ?? null,
      reviewNote: review?.note ?? null,
    })
  }

  for (const doc of researchDocEntries) {
    entries.push({
      id: doc.path,
      kind: 'research-doc',
      label: doc.label,
      areas: doc.areas,
      location: doc.path,
      lastCaptured: doc.headers.lastCaptured,
      lastReviewed: doc.headers.lastReviewed,
      reviewNote: null,
    })
  }

  return entries
}

function monthsBetween(fromIso, toDate) {
  const from = new Date(`${fromIso}T00:00:00Z`)
  if (Number.isNaN(from.getTime())) return Infinity
  return (toDate.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

// A date that is not a real calendar date, or that lies in the future
// relative to the report's clock, is never "fresh": nobody captured or
// reviewed anything on a day that has not happened (or does not exist). Both
// cases surface as their own status and need attention — silently treating
// them as fresh is exactly the failure mode the null-review-date rule exists
// to prevent.
function statusFor(dateIso, staleAfterMonths, now, missingStatus) {
  if (!dateIso) return missingStatus
  if (!isRealCalendarDate(dateIso)) return 'invalid-date'
  const months = monthsBetween(dateIso, now)
  if (months < 0) return 'future-dated'
  return months >= staleAfterMonths ? 'stale' : 'fresh'
}

export function assessFreshness(entries, { now, policy = DEFAULT_POLICY } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('assessFreshness requires a concrete now Date (report must stay deterministic)')
  }

  return entries.map((entry) => {
    const captureStatus = statusFor(entry.lastCaptured, policy.captureStaleAfterMonths, now, 'unknown')
    const reviewStatus = statusFor(entry.lastReviewed, policy.reviewStaleAfterMonths, now, 'never-reviewed')
    const needsAttention = captureStatus !== 'fresh' || reviewStatus !== 'fresh'
    return { ...entry, captureStatus, reviewStatus, needsAttention }
  })
}

const AREA_LABELS = {
  'tax-payroll': 'tax/payroll',
  'kv-pv': 'KV/PV',
  'funding-eligibility': 'funding/eligibility',
  'investment-insurance': 'investment/insurance',
  'household-interactions': 'household interactions',
}

function renderTable(rows) {
  const header = ['| Source | Areas | Last captured | Last reviewed | Status | Link |', '|---|---|---|---|---|---|']
  const body = rows.map((entry) => {
    const status =
      entry.captureStatus === 'fresh' && entry.reviewStatus === 'fresh'
        ? 'fresh'
        : [
            entry.captureStatus === 'fresh' ? null : `capture ${entry.captureStatus}`,
            entry.reviewStatus === 'fresh' ? null : `review ${entry.reviewStatus}`,
          ]
            .filter(Boolean)
            .join('; ')
    const link =
      entry.kind === 'golden-source' ? entry.location : `${entry.location} (repo doc)`
    return `| ${entry.label} | ${
      entry.areas.map((area) => AREA_LABELS[area] ?? area).join(', ') || '—'
    } | ${entry.lastCaptured ?? '—'} | ${entry.lastReviewed ?? 'null (no record)'} | ${status} | ${link} |`
  })
  return [...header, ...body].join('\n')
}

export function renderFreshnessReport(assessment, { now, policy = DEFAULT_POLICY } = {}) {
  const attention = assessment.filter((entry) => entry.needsAttention)
  const current = assessment.filter((entry) => !entry.needsAttention)

  const lines = []
  lines.push('# Source freshness report')
  lines.push('')
  lines.push(`Generated ${now.toISOString().slice(0, 10)}. ` +
    `Policy: captures go stale after ${policy.captureStaleAfterMonths} months, ` +
    `reviews after ${policy.reviewStaleAfterMonths} months.`)
  lines.push('')
  lines.push(
    `${assessment.length} sources tracked: ${attention.length} need attention, ${current.length} current. ` +
      `${assessment.filter((e) => e.lastReviewed === null).length} have no review record at all.`,
  )
  lines.push('')

  if (attention.length > 0) {
    lines.push('## Needs attention (stale or never reviewed)')
    lines.push('')
    lines.push(renderTable(attention))
    lines.push('')
  }

  if (current.length > 0) {
    lines.push('## Current')
    lines.push('')
    lines.push(renderTable(current))
    lines.push('')
  }

  lines.push(
    '> Dates record activity, not validity. A reachable link or a recent capture never approves an ' +
      'interpretation of the law. Re-verify against the official sources via the monthly audit ' +
      'procedure (docs/automation/calculation-review-toolchain.md).',
  )
  lines.push('')
  return lines.join('\n')
}
