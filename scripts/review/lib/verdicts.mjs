// Verdict extraction + validation + panel adjudication.
//
// The gate is fail-closed in every direction: a verdict counts only when the
// reviewer actually completed, reported the requested model, and restated the
// exact head SHA. Truncated, malformed, contradictory, or missing output
// fails the whole panel — it never downgrades to "approve by default".

export const VERDICT_VALUES = ['approve', 'reject', 'needs-human']
export const SEVERITY_VALUES = ['blocker', 'major', 'minor', 'info']
export const CONFIDENCE_VALUES = ['high', 'medium', 'low']

const FINDING_REQUIRED_FIELDS = [
  'title',
  'severity',
  'source',
  'applicableDate',
  'interpretation',
  'counterexampleOrTest',
  'uncertainty',
]

const SHA_PATTERN = /^[0-9a-f]{40}$/

// Pulls the verdict JSON out of a reviewer's reply text. Preference order:
// 1. the LAST fenced ```json block (reviewers are instructed to end with it),
// 2. the LAST balanced JSON object in the text that carries a string "verdict".
// Returns { ok: true, verdict } or { ok: false, reason }.
export function extractVerdictBlock(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: 'reviewer text is empty' }
  }

  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  for (let i = fenced.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(fenced[i])
      if (isVerdictShaped(parsed)) return { ok: true, verdict: parsed }
    } catch {
      // fall through to the balanced-brace scan
    }
  }

  const balanced = findBalancedJsonObjects(text)
  for (let i = balanced.length - 1; i >= 0; i--) {
    const candidate = balanced[i]
    if (isVerdictShaped(candidate)) return { ok: true, verdict: candidate }
  }

  return { ok: false, reason: 'no parseable verdict JSON block found in reviewer text' }
}

function isVerdictShaped(node) {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && typeof node.verdict === 'string'
}

// Extracts balanced top-level-ish JSON objects from free text, respecting
// string escapes. Bounded: stops after 64 objects.
export function findBalancedJsonObjects(text) {
  const objects = []
  for (let start = text.indexOf('{'); start !== -1 && objects.length < 64; start = text.indexOf('{', start + 1)) {
    const end = matchBrace(text, start)
    if (end === -1) continue
    try {
      objects.push(JSON.parse(text.slice(start, end + 1)))
    } catch {
      // not JSON — keep scanning
    }
  }
  return objects
}

function matchBrace(text, start) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Validates one parsed verdict against the review anchor.
// Returns { ok: true, verdict: normalized } or { ok: false, reason }.
export function validateVerdict({ verdict, pr, headSha }) {
  if (verdict === null || typeof verdict !== 'object' || Array.isArray(verdict)) {
    return { ok: false, reason: 'verdict is not a JSON object' }
  }
  if (!VERDICT_VALUES.includes(verdict.verdict)) {
    return { ok: false, reason: `verdict "${verdict.verdict}" is not one of ${VERDICT_VALUES.join(', ')}` }
  }
  if (typeof verdict.headSha !== 'string' || !SHA_PATTERN.test(verdict.headSha)) {
    return { ok: false, reason: `verdict headSha "${verdict.headSha}" is not a 40-char SHA` }
  }
  if (verdict.headSha !== headSha) {
    return { ok: false, reason: `verdict headSha does not match the reviewed head ${headSha}` }
  }
  if (verdict.pr !== pr) {
    return { ok: false, reason: `verdict pr ${JSON.stringify(verdict.pr)} does not match PR #${pr}` }
  }
  if (!CONFIDENCE_VALUES.includes(verdict.confidence)) {
    return { ok: false, reason: `confidence "${verdict.confidence}" is not one of ${CONFIDENCE_VALUES.join(', ')}` }
  }
  if (!Array.isArray(verdict.findings)) {
    return { ok: false, reason: 'findings is not an array' }
  }
  if (!Array.isArray(verdict.unresolved)) {
    return { ok: false, reason: 'unresolved is not an array' }
  }

  for (const [index, finding] of verdict.findings.entries()) {
    if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
      return { ok: false, reason: `finding ${index} is not an object` }
    }
    for (const field of FINDING_REQUIRED_FIELDS) {
      const value = finding[field]
      if (typeof value !== 'string' || value.trim().length === 0) {
        return { ok: false, reason: `finding ${index} ("${finding.title ?? '?'}") is missing field "${field}"` }
      }
    }
    if (!SEVERITY_VALUES.includes(finding.severity)) {
      return { ok: false, reason: `finding ${index} severity "${finding.severity}" is not one of ${SEVERITY_VALUES.join(', ')}` }
    }
  }

  if (verdict.verdict === 'approve' && verdict.findings.some((f) => f.severity === 'blocker')) {
    return { ok: false, reason: 'contradictory verdict: approve with a blocker finding' }
  }

  return { ok: true, verdict }
}

// Combines per-reviewer parse + validation results into one panel decision.
// Inputs: [{ reviewer, model, parse: {ok, text?, reason?}, verdict?: {ok, ...} }]
// Decision order: invalid > reject > needs-human > approve.
export function adjudicatePanel(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { decision: 'invalid', ok: false, reasons: ['no reviewer results supplied'] }
  }

  const reasons = []
  for (const review of reviews) {
    if (!review.parse || review.parse.ok !== true) {
      reasons.push(`${review.reviewer}: ${review.parse?.reason ?? 'no parse result'}`)
      continue
    }
    if (!review.verdict || review.verdict.ok !== true) {
      reasons.push(`${review.reviewer}: ${review.verdict?.reason ?? 'verdict missing'}`)
    }
  }
  if (reasons.length > 0) {
    return { decision: 'invalid', ok: false, reasons }
  }

  // review.verdict is { ok, verdict: <validated verdict object> }; the
  // decision string lives one level deeper.
  const verdicts = reviews.map((review) => review.verdict.verdict.verdict)
  if (verdicts.includes('reject')) return { decision: 'reject', ok: true, reasons: [] }
  if (verdicts.includes('needs-human')) return { decision: 'needs-human', ok: true, reasons: [] }
  return { decision: 'approve', ok: true, reasons: [] }
}
