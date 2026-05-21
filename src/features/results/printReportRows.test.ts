/**
 * Static-content regression tests for `printReportRows.ts`.
 *
 * PR 4.1 (Sober D port, H4) invariant — the print row builder must NOT
 * duplicate the per-product tax-mode dispatch that lives in
 * `src/engine/exportProjection.ts`. These tests assert that as a string-
 * content guarantee: the source file declares no import of the four after-
 * tax lump-sum primitives, and no `productId === 'bav' / 'etf' / ...` branch
 * for tax routing.
 *
 * Tax routing is dispatched ONCE inside `exportProjection.ts` and consumed
 * by both `csvExport.ts` (CSV side) and the print path (PDF side). Adding
 * a tax-mode branch here is a regression of #209 / PR 12 + PR 4.1.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read the source file via a project-rooted relative path so the test
// works under vitest (which runs source as ESM, where `import.meta.url`
// is not a `file://` URL we can `fileURLToPath` on Windows).
const sourcePath = resolve(
  process.cwd(),
  'src/features/results/printReportRows.ts',
)
const SOURCE = readFileSync(sourcePath, 'utf8')

/**
 * Strip line / block comments from a TypeScript source so the static
 * content checks below match against CODE, not documentation. The doc
 * header in `printReportRows.ts` explicitly NAMES the forbidden symbols
 * (`afterTaxBavLumpSum` etc.) as anti-pattern callouts — without comment
 * stripping the regression test catches its own documentation.
 */
function stripComments(source: string): string {
  // Block comments (greedy) + line comments. JSX/regex literals are not a
  // concern in this file (no template literals containing `//`).
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const CODE = stripComments(SOURCE)

describe('printReportRows static content', () => {
  it('does not import per-product after-tax lump-sum helpers (no tax-mode dispatch)', () => {
    // These four helpers are the canonical compare-mode tax routing
    // primitives. They are dispatched once in `exportProjection.ts` and
    // must never be re-imported in the print row builder.
    expect(CODE).not.toContain('afterTaxBavLumpSum')
    expect(CODE).not.toContain('afterTaxInvestmentCapital')
    expect(CODE).not.toContain('afterTaxInsuranceLumpSum')
    expect(CODE).not.toContain('afterTaxCertifiedPensionLumpSum')
  })

  it('does not call any afterTax* helper (no tax-mode dispatch in code)', () => {
    // We allow `productId === 'etf'` and similar in the LAYOUT switch
    // helpers (`extractMonthlyContribution`, `fieldsFor`) — those route to
    // different per-product field NAMES, not to tax helpers. The regression
    // we guard against is bringing the tax-mode dispatch BACK into this
    // file. The lever that would surface that regression is calling one of
    // the four afterTax* helpers in code (an open paren); the broader
    // `productId === 'X'` rule would overreach (layout switches are
    // legitimate).
    expect(CODE).not.toMatch(/afterTax[A-Z][A-Za-z]+\(/)
  })

  it('continues to point at exportProjection.ts as the canonical tax-mode home', () => {
    // The header comment must keep the explicit reference so future
    // contributors land on the right module when they ask "where does the
    // bAV lump-sum tax dispatch live?". This is the lever from #209 / PR 12.
    // We assert on the full SOURCE (not CODE) since this lives in a comment.
    expect(SOURCE).toContain('exportProjection.ts')
  })
})
