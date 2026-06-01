import { describe, it, expect } from 'vitest'
import {
  looksLikeGermanCopy,
  normalizeCopy,
  scanSourceText,
  buildScanReport,
  filterReport,
  formatScanReport,
} from './scan'

/** Collect just the candidate texts for a single synthetic source file. */
function texts(file: string, src: string, isTracked?: (t: string) => boolean): string[] {
  return scanSourceText(file, src, isTracked ? { isTracked } : {}).candidates.map((c) => c.text)
}

describe('looksLikeGermanCopy', () => {
  it('accepts umlaut / ß / German-quote strings', () => {
    expect(looksLikeGermanCopy('Übersicht')).toBe(true)
    expect(looksLikeGermanCopy('Beiträge')).toBe(true)
    expect(looksLikeGermanCopy('„bestes“ Produkt')).toBe(true)
  })

  it('accepts umlaut-free German via the word list (recall)', () => {
    // The exact copy we shipped — no umlaut, must still be caught.
    expect(looksLikeGermanCopy('Du entscheidest informiert.')).toBe(true)
    expect(looksLikeGermanCopy('Vergleich starten')).toBe(true)
    expect(looksLikeGermanCopy('Mit 67 Jahren')).toBe(true)
  })

  it('rejects English and English-colliding tokens (precision)', () => {
    expect(looksLikeGermanCopy('Create my plan')).toBe(false)
    expect(looksLikeGermanCopy('Start comparison')).toBe(false)
    // "an"/"was"/"war"/"man" are German-adjacent but English words — excluded.
    expect(looksLikeGermanCopy('Modified an entry')).toBe(false)
    expect(looksLikeGermanCopy('There was a war')).toBe(false)
  })

  it('rejects single-token code identifiers containing a German word', () => {
    expect(looksLikeGermanCopy('pre2005_steuerfrei')).toBe(false)
    expect(looksLikeGermanCopy('RENTE_MAX')).toBe(false)
  })

  it('rejects too-short / non-letter strings', () => {
    expect(looksLikeGermanCopy('ok')).toBe(false)
    expect(looksLikeGermanCopy('12,5 %')).toBe(false)
    expect(looksLikeGermanCopy('  ')).toBe(false)
  })

  it('normalizeCopy collapses whitespace', () => {
    expect(normalizeCopy('  Du   entscheidest\n  informiert.  ')).toBe('Du entscheidest informiert.')
  })
})

describe('scanSourceText — context classification', () => {
  it('flags German JSX text but not English JSX text', () => {
    const found = texts(
      'src/features/demo/Demo.tsx',
      `export const X = () => <div><p>Du entscheidest informiert.</p><span>Hello world</span></div>`,
    )
    expect(found).toEqual(['Du entscheidest informiert.'])
  })

  it('skips className but flags an allow-listed aria-label', () => {
    const found = texts(
      'src/features/demo/Demo.tsx',
      `export const X = () => <nav className="übersicht-grid" aria-label="Übersicht der Renten">x</nav>`,
    )
    expect(found).toEqual(['Übersicht der Renten'])
  })

  it('skips import/export module specifiers even with umlauts', () => {
    const found = texts(
      'src/features/demo/Demo.tsx',
      `import x from './müll'\nexport { y } from './größe'\nexport const t = 'Deine Rente'`,
    )
    expect(found).toEqual(['Deine Rente'])
  })

  it('skips object keys but flags object values', () => {
    const found = texts('src/content/demo.ts', `export const m = { 'kühl': 'Sehr kühl heute' }`)
    expect(found).toEqual(['Sehr kühl heute'])
  })

  it('skips string-literal union types', () => {
    const found = texts('src/content/demo.ts', `type Mode = 'vergleich' | 'kombinieren'\nexport const a = 'Dein Vergleich'`)
    expect(found).toEqual(['Dein Vergleich'])
  })

  it('skips console.* arguments', () => {
    const found = texts('src/content/demo.ts', `console.warn('Etwas ist schiefgelaufen'); export const a = 'Deine Angaben'`)
    expect(found).toEqual(['Deine Angaben'])
  })

  it('flags template literals with interpolation and marks them', () => {
    const result = scanSourceText('src/content/demo.ts', 'export const f = (n: number) => `Mit ${n} Jahren bist du dabei`')
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].hasInterpolation).toBe(true)
    expect(result.candidates[0].context).toBe('template-expr')
  })

  it('skips strings already tracked in the catalog and counts them', () => {
    const result = scanSourceText(
      'src/features/demo/Demo.tsx',
      `export const X = () => <div><p>Vergleich starten</p><p>Plan erstellen</p></div>`,
      { isTracked: (t) => t === 'Vergleich starten' },
    )
    expect(result.candidates.map((c) => c.text)).toEqual(['Plan erstellen'])
    expect(result.tracked).toBe(1)
  })

  it('derives the surface from the path', () => {
    const fromFeature = scanSourceText('src/features/vergleich/X.tsx', `export const a = 'Deine Rente'`)
    expect(fromFeature.candidates[0].surface).toBe('vergleich')
    const fromContent = scanSourceText('src/content/terms.ts', `export const a = 'Deine Rente'`)
    expect(fromContent.candidates[0].surface).toBe('content')
  })
})

describe('buildScanReport + filterReport', () => {
  const files = [
    { file: 'src/features/vergleich/A.tsx', text: `export const a = () => <p>Dein Vergleich hier</p>` },
    { file: 'src/features/kapital/B.tsx', text: `export const b = () => <p>Deine Auszahlung</p>` },
    { file: 'src/content/terms.ts', text: `export const c = 'Gesetzliche Rente'` },
  ]

  it('aggregates totals and groups by file and surface', () => {
    const report = buildScanReport(files)
    expect(report.total).toBe(3)
    expect(report.filesScanned).toBe(3)
    expect(report.filesWithCandidates).toBe(3)
    expect(report.bySurface.map((g) => g.name).sort()).toEqual(['content', 'kapital', 'vergleich'])
  })

  it('filters by surface', () => {
    const report = filterReport(buildScanReport(files), { surface: 'vergleich' })
    expect(report.total).toBe(1)
    expect(report.candidates[0].surface).toBe('vergleich')
  })

  it('filters by path prefix', () => {
    const report = filterReport(buildScanReport(files), { pathPrefix: 'src/features/' })
    expect(report.total).toBe(2)
  })

  it('formats an empty report cleanly', () => {
    const report = buildScanReport([{ file: 'src/x.ts', text: `export const a = 'Hello world'` }])
    expect(report.total).toBe(0)
    expect(formatScanReport(report)).toContain('No un-tracked German copy found')
  })
})
