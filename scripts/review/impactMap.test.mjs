import { describe, expect, it } from 'vitest'

import {
  REVIEW_DOMAINS,
  contextFilesForImpact,
  isUntrustedContextPath,
  mapImpact,
} from './lib/impactMap.mjs'

describe('mapImpact — conservative mapping', () => {
  it('maps shared engine changes to broad scope across all domains', () => {
    const impact = mapImpact(['src/engine/salary.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.focusDomains).toEqual(['tax-payroll', 'kv-pv'])
  })

  it('maps rules changes to broad scope with no narrowing', () => {
    const impact = mapImpact(['src/rules/de2026.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.focusDomains).toContain('tax-payroll')
  })

  it('combine-mode files focus household interactions but stay broad', () => {
    const impact = mapImpact(['src/engine/portfolioCombine.ts', 'src/engine/combineContext.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.focusDomains).toEqual(['household-interactions'])
  })

  it('falls back to broad for unclassified paths (never silently narrow)', () => {
    const impact = mapImpact(['src/someNewDirectory/mystery.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.rationale).toMatch(/conservative fallback/)
  })

  it('treats cosmetic-only changes as narrow', () => {
    const impact = mapImpact(['src/features/results/PrintReport.css', 'docs/context/ui.md'])
    expect(impact.breadth).toBe('narrow')
    expect(impact.domains).toEqual([])
  })

  it('one calculation-bearing file forces the whole change broad', () => {
    const impact = mapImpact(['src/features/results/PrintReport.css', 'src/engine/tax.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
  })

  it('tooling and docs are narrow even when they live in scripts/', () => {
    expect(mapImpact(['scripts/review/review-run.mjs']).breadth).toBe('narrow')
    expect(mapImpact(['README.md']).breadth).toBe('narrow')
  })

  it('requires at least one changed file', () => {
    expect(() => mapImpact([])).toThrow(/at least one changed file/)
  })
})

describe('approval-shaped files in the diff', () => {
  it('flags receipt/approval paths as untrusted context', () => {
    expect(isUntrustedContextPath('review-receipts/pr-7-aaa.json')).toBe(true)
    expect(isUntrustedContextPath('APPROVAL.md')).toBe(true)
    expect(isUntrustedContextPath('.review/verdict.json')).toBe(true)
    expect(isUntrustedContextPath('src/engine/tax.ts')).toBe(false)
  })

  it('reports untrusted paths without letting them shrink scope', () => {
    const impact = mapImpact(['APPROVAL.md', 'src/engine/tax.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.untrustedContextPaths).toEqual(['APPROVAL.md'])
  })
})

describe('contextFilesForImpact', () => {
  it('always includes the review bar, adds mapped domain context, drops missing files', () => {
    const impact = mapImpact(['src/engine/salary.ts'])
    const files = contextFilesForImpact(impact, (path) => path === 'AGENTS.md' || path === 'src/engine/tax.ts')
    expect(files).toContain('AGENTS.md')
    expect(files).toContain('src/engine/tax.ts')
    expect(files).not.toContain('docs/validation.md') // excluded by the exists() probe
    expect(new Set(files).size).toBe(files.length) // no duplicates
  })

  it('never includes approval-shaped paths even if they exist', () => {
    const impact = mapImpact(['src/engine/tax.ts'])
    const files = contextFilesForImpact(impact, (path) => isUntrustedContextPath(path) || path === 'AGENTS.md')
    expect(files).toEqual(['AGENTS.md'])
  })
})
