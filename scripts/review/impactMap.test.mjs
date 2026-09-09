import { describe, expect, it } from 'vitest'

import {
  REVIEW_DOMAINS,
  classifyPath,
  contextFilesForImpact,
  isUntrustedContextPath,
  mapImpact,
} from './lib/impactMap.mjs'

describe('classifyPath — meaningful rules beat the cosmetic extension allowlist', () => {
  it('executable/worker/API surfaces are meaningful regardless of extension', () => {
    // These were previously narrowed away by their extensions; they carry
    // executable logic, defaults, oracle baselines, or review gates.
    expect(classifyPath('workers/simulate/src/index.mjs')).toBe('meaningful')
    expect(classifyPath('workers/qa-submit/package.json')).toBe('meaningful')
    expect(classifyPath('scripts/review/review-run.mjs')).toBe('meaningful')
    expect(classifyPath('.github/workflows/pr-verify.yml')).toBe('meaningful')
    expect(classifyPath('package.json')).toBe('meaningful')
    expect(classifyPath('public/_redirects')).toBe('meaningful')
    expect(classifyPath('src/content/recommendationCopy.ts')).toBe('meaningful')
    expect(classifyPath('src/engine/tax.ts')).toBe('meaningful')
  })

  it('assurance and review-bar files are meaningful even though they are prose', () => {
    expect(classifyPath('AGENTS.md')).toBe('meaningful')
    expect(classifyPath('CLAUDE.md')).toBe('meaningful')
    expect(classifyPath('docs/validation.md')).toBe('meaningful')
    expect(classifyPath('docs/automation/calculation-review-toolchain.md')).toBe('meaningful')
    expect(classifyPath('docs/adr/0004-local-calculation-review-toolchain.md')).toBe('meaningful')
    expect(classifyPath('README.md')).toBe('meaningful')
  })

  it('pure prose docs, styling, and static assets stay cosmetic', () => {
    expect(classifyPath('docs/context/ui.md')).toBe('cosmetic')
    expect(classifyPath('src/features/results/PrintReport.css')).toBe('cosmetic')
    expect(classifyPath('notes/architecture.md')).toBe('cosmetic')
    expect(classifyPath('docs/architecture/diagram.svg')).toBe('cosmetic')
  })

  it('the styling carve-out never reaches executable extensions', () => {
    // The narrow case is styling only — a .css rule must not swallow the
    // .mjs/.json/.yml/src-content files the meaningful rules exist for.
    expect(classifyPath('workers/simulate/styles.css')).toBe('cosmetic')
    expect(classifyPath('scripts/review/PrintReport.css')).toBe('cosmetic')
  })

  it('anything unclassified falls back to full review scope', () => {
    expect(classifyPath('weird-config.toml')).toBe('unclassified')
    expect(classifyPath('src/someNewDirectory/mystery.ts')).toBe('meaningful') // src/ is a known meaningful prefix
  })
})

describe('mapImpact — conservative mapping', () => {
  it('maps shared engine changes to broad scope across all domains', () => {
    const impact = mapImpact(['src/engine/salary.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.focusDomains).toEqual(['tax-payroll', 'kv-pv'])
    expect(impact.meaningfulCategories).toContain('engine/rules/statutory values')
  })

  it('combine-mode files focus household interactions but stay broad', () => {
    const impact = mapImpact(['src/engine/portfolioCombine.ts', 'src/engine/combineContext.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.focusDomains).toEqual(['household-interactions'])
  })

  it('falls back to broad for unclassified paths and says so explicitly', () => {
    const impact = mapImpact(['weird-config.toml'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.rationale).toMatch(/unclassified path\(s\) fall back to full scope/)
  })

  it('treats presentational-only changes as narrow', () => {
    const impact = mapImpact(['src/features/results/PrintReport.css', 'docs/context/ui.md'])
    expect(impact.breadth).toBe('narrow')
    expect(impact.domains).toEqual([])
    expect(impact.rationale).toMatch(/presentational/)
  })

  it('one calculation-bearing file forces the whole change broad', () => {
    const impact = mapImpact(['src/features/results/PrintReport.css', 'src/engine/tax.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
  })

  it('worker, tooling, CI, and security/config scopes are meaningful, never labelled cosmetic', () => {
    for (const files of [
      ['workers/simulate/src/index.mjs'],
      ['scripts/review/review-run.mjs'],
      ['.github/workflows/pr-verify.yml'],
      ['public/_redirects'],
      ['wrangler.jsonc'],
      ['AGENTS.md'],
    ]) {
      const impact = mapImpact(files)
      expect(impact.breadth).toBe('broad')
      expect(impact.rationale).not.toMatch(/cosmetic|presentational/)
      expect(impact.meaningfulCategories.length).toBeGreaterThan(0)
    }
  })

  it('a mixed change (cosmetic file + meaningful file) stays broad with both facts in the rationale', () => {
    const impact = mapImpact(['docs/context/ui.md', '.github/workflows/review-loop.yml'])
    expect(impact.breadth).toBe('broad')
    expect(impact.rationale).toMatch(/tooling \/ review gates/)
  })

  it('maps engine-root payout channels to investment/insurance focus (live gap #382)', () => {
    // These sit OUTSIDE src/engine/products/ and were unmapped, so a
    // payout-tax change surfaced with no focus domains at all.
    for (const path of [
      'src/engine/etfPayout.ts',
      'src/engine/insurancePayout.ts',
      'src/engine/bavPayout.ts',
      'src/engine/certifiedPensionPayout.ts',
      'src/engine/payoutMath.ts',
    ]) {
      const impact = mapImpact([path])
      expect(impact.breadth, path).toBe('broad')
      expect(impact.focusDomains, path).toContain('investment-insurance')
      expect(impact.rationale, path).toMatch(/calculation focus/)
    }
  })

  it('maps the captured statutory oracle fixtures to every domain', () => {
    // Golden fixtures are the oracle baselines: moving one can shift what
    // "correct" means in all five domains at once.
    const impact = mapImpact(['src/test/externalGoldenFixtures.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.focusDomains).toEqual(REVIEW_DOMAINS)
  })

  it('keeps a broad change with no mapped focus broad, and never calls it cosmetic', () => {
    // Unmapped-but-meaningful: the honest label is "broad, no focus hints",
    // not "presentational".
    const impact = mapImpact(['src/engine/someUnmappedEngine.ts'])
    expect(impact.breadth).toBe('broad')
    expect(impact.domains).toEqual(REVIEW_DOMAINS)
    expect(impact.focusDomains).toEqual([])
    expect(impact.rationale).not.toMatch(/cosmetic|presentational/)
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
