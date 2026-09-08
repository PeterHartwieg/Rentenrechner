import { describe, expect, it } from 'vitest'

import { adjudicatePanel, extractVerdictBlock, findBalancedJsonObjects, validateVerdict } from './lib/verdicts.mjs'

const SHA = 'a'.repeat(40)
const ANCHOR = { pr: 42, headSha: SHA }

function verdict(overrides = {}) {
  return {
    pr: ANCHOR.pr,
    headSha: SHA,
    verdict: 'approve',
    confidence: 'high',
    findings: [],
    unresolved: [],
    ...overrides,
  }
}

function finding(partial = {}) {
  return {
    title: 'Wrong BBG',
    severity: 'major',
    source: '§ 34d EStG',
    applicableDate: '2026-01-01',
    interpretation: 'statute says X',
    counterexampleOrTest: 'inputs -> wrong output',
    uncertainty: 'none',
    ...partial,
  }
}

describe('extractVerdictBlock', () => {
  it('parses the fenced json block', () => {
    const text = `Narrative.\n\n\`\`\`json\n${JSON.stringify(verdict())}\n\`\`\`\n`
    expect(extractVerdictBlock(text)).toMatchObject({ ok: true, verdict: { verdict: 'approve' } })
  })

  it('falls back to a balanced JSON object without fences', () => {
    const text = `The verdict follows: ${JSON.stringify(verdict())} — end of reply.`
    expect(extractVerdictBlock(text)).toMatchObject({ ok: true })
  })

  it('prefers the last block when several are present', () => {
    const text = [
      '```json',
      JSON.stringify(verdict({ verdict: 'reject' })),
      '```',
      'After more analysis:',
      '```json',
      JSON.stringify(verdict({ verdict: 'approve' })),
      '```',
    ].join('\n')
    expect(extractVerdictBlock(text)).toMatchObject({ verdict: { verdict: 'approve' } })
  })

  it('fails closed on text without a parseable verdict', () => {
    expect(extractVerdictBlock('no verdict here')).toMatchObject({ ok: false })
    expect(extractVerdictBlock('')).toMatchObject({ ok: false })
    expect(extractVerdictBlock('```json\n{"verdict": }\n```')).toMatchObject({ ok: false })
  })
})

describe('findBalancedJsonObjects', () => {
  it('respects strings and escapes while matching braces (outer and nested both parse)', () => {
    const objects = findBalancedJsonObjects('x {"a":"b}c","d":{"e":1}} y')
    expect(objects).toHaveLength(2)
    expect(objects[0]).toEqual({ a: 'b}c', d: { e: 1 } })
    expect(objects[1]).toEqual({ e: 1 })
  })
})

describe('validateVerdict', () => {
  it('accepts a well-formed verdict on the exact SHA', () => {
    expect(validateVerdict({ verdict: verdict(), ...ANCHOR }).ok).toBe(true)
  })

  it('rejects a verdict that restates a different SHA (exact-SHA gate)', () => {
    const result = validateVerdict({ verdict: verdict({ headSha: 'b'.repeat(40) }), ...ANCHOR })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/does not match the reviewed head/)
  })

  it('rejects non-SHA strings in the headSha field', () => {
    expect(validateVerdict({ verdict: verdict({ headSha: 'HEAD' }), ...ANCHOR }).ok).toBe(false)
    expect(validateVerdict({ verdict: verdict({ headSha: SHA.slice(0, 8) }), ...ANCHOR }).ok).toBe(false)
  })

  it('rejects a mismatched PR number', () => {
    expect(validateVerdict({ verdict: verdict({ pr: 43 }), ...ANCHOR }).ok).toBe(false)
  })

  it('rejects unknown verdict values and unknown confidence', () => {
    expect(validateVerdict({ verdict: verdict({ verdict: 'ship it' }), ...ANCHOR }).ok).toBe(false)
    expect(validateVerdict({ verdict: verdict({ confidence: 'absolute' }), ...ANCHOR }).ok).toBe(false)
  })

  it('rejects findings missing any required field', () => {
    const incomplete = finding()
    delete incomplete.counterexampleOrTest
    const result = validateVerdict({ verdict: verdict({ verdict: 'reject', findings: [incomplete] }), ...ANCHOR })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/counterexampleOrTest/)
  })

  it('rejects the contradiction: approve with a blocker finding', () => {
    const result = validateVerdict({ verdict: verdict({ findings: [finding({ severity: 'blocker' })] }), ...ANCHOR })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/contradictory/)
  })

  it('accepts reject/needs-human with complete findings', () => {
    expect(
      validateVerdict({ verdict: verdict({ verdict: 'reject', findings: [finding()] }), ...ANCHOR }).ok,
    ).toBe(true)
    expect(validateVerdict({ verdict: verdict({ verdict: 'needs-human' }), ...ANCHOR }).ok).toBe(true)
  })
})

describe('adjudicatePanel', () => {
  const accepted = (reviewer, verdictValue) => ({
    reviewer,
    parse: { ok: true, text: 'x' },
    verdict: { ok: true, verdict: verdict({ verdict: verdictValue }) },
  })

  it('approve from all reviewers approves', () => {
    expect(adjudicatePanel([accepted('grok', 'approve'), accepted('claude', 'approve')])).toMatchObject({
      decision: 'approve',
      ok: true,
    })
  })

  it('any reject decides reject', () => {
    expect(adjudicatePanel([accepted('grok', 'approve'), accepted('claude', 'reject')]).decision).toBe('reject')
  })

  it('needs-human without reject decides needs-human', () => {
    expect(adjudicatePanel([accepted('grok', 'needs-human'), accepted('claude', 'approve')]).decision).toBe(
      'needs-human',
    )
  })

  it('any unaccepted reviewer fails the whole panel (missing reviewer fail-closed)', () => {
    const result = adjudicatePanel([
      accepted('grok', 'approve'),
      { reviewer: 'claude', parse: { ok: false, reason: 'grok exited with code 1' } },
    ])
    expect(result).toMatchObject({ decision: 'invalid', ok: false })
    expect(result.reasons[0]).toMatch(/claude/)
  })

  it('invalid when a verdict fails validation', () => {
    const result = adjudicatePanel([
      { reviewer: 'grok', parse: { ok: true, text: 'x' }, verdict: { ok: false, reason: 'no parseable verdict JSON block found' } },
    ])
    expect(result.decision).toBe('invalid')
  })

  it('invalid when there are no reviewer results at all', () => {
    expect(adjudicatePanel([]).decision).toBe('invalid')
  })
})
