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
import {
  buildPrintMethodeBullets,
  buildPrintProContraRows,
  type PrintMethodeBullet,
} from './printReportRows'
import { defaultAssumptions } from '../../data/defaultScenario'
import { PRODUCT_IDS } from '../../engine/productRegistry'
import type { ProductId, ScenarioAssumptions } from '../../domain'

/** The Renditeannahmen bullet for a given live scenario set. */
function renditeBullet(
  returnScenarios: ScenarioAssumptions['returnScenarios'],
): PrintMethodeBullet | undefined {
  return buildPrintMethodeBullets(returnScenarios).find(
    (entry) => entry.label === 'Renditeannahmen',
  )
}

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
  it('names the three standard scenarios without a derivation claim (#408)', () => {
    const bullet = renditeBullet(defaultAssumptions.returnScenarios)
    // #408: the bullet must word the defaults as the standard set, not as
    // the live list — the Rentenszenarien table already lists that.
    expect(bullet?.body).toContain('Drei Standardszenarien (')
    expect(bullet?.body).toContain('konservativ')
    expect(bullet?.body).toContain('basis')
    expect(bullet?.body).toContain('optimistisch')
    // Default set has no `custom` scenario → no own-scenario clause.
    expect(bullet?.body).not.toContain('eigenes Szenario')
  })

  it('describes return scenarios as nominal modelling assumptions without an external derivation', () => {
    const bullet = renditeBullet(defaultAssumptions.returnScenarios)
    expect(bullet?.body).toContain('nominal')
    expect(bullet?.body).toContain('nicht extern validiert')
    expect(bullet?.body).not.toContain('MSCI')
    expect(bullet?.body).not.toContain('Hergeleitet')
  })

  it('appends the own-scenario clause only when the live set contains a custom scenario (#408)', () => {
    const withCustom: ScenarioAssumptions['returnScenarios'] = [
      ...defaultAssumptions.returnScenarios,
      { id: 'custom', label: 'Eigenes', annualReturn: 0.06 },
    ]
    const bullet = renditeBullet(withCustom)
    expect(bullet?.body).toContain(', ergänzt um ein eigenes Szenario')
    // The clause sits inside the lead-in, before the nominal framing.
    const body = bullet!.body
    expect(body.indexOf('ergänzt um ein eigenes Szenario')).toBeLessThan(
      body.indexOf('nominal'),
    )
    // The bullet still lists only the three standard rates, not the live set.
    expect(body).not.toContain('Eigenes 6')
  })

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

describe('buildPrintProContraRows registry-order invariant (CR1)', () => {
  // PR R3 R1 fix (CR1): the printed pro/contra grid mirrors the web layout
  // (`VergleichProContraGrid`), which iterates products in
  // `PRODUCT_REGISTRY.order` regardless of payout sort. The compare-mode
  // caller (`PrintReport.tsx`) passes payout-sorted ids derived from the
  // Vergleich comparison table — without an internal sort the printed grid
  // would reshuffle with scenario results instead of staying stable.

  it('returns rows in PRODUCT_REGISTRY order regardless of caller input order', () => {
    // Build a deliberately scrambled input (reverse + rotate so no canonical
    // order is preserved by accident). The output ids must match
    // `PRODUCT_IDS` (which iterates `PRODUCT_REGISTRY` in metadata.order).
    const scrambledInput: ReadonlyArray<ProductId> = [
      'riester',
      'etf',
      'altersvorsorgedepot',
      'bav',
      'basisrente',
      'versicherung',
    ]
    const rows = buildPrintProContraRows({ productIds: scrambledInput })
    const outputIds = rows.map((r) => r.productId)
    expect(outputIds).toEqual([...PRODUCT_IDS])
  })

  it('returns rows in PRODUCT_REGISTRY order when caller passes payout-sorted ids (real call-site shape)', () => {
    // The actual PrintReport call site passes ids in netMonthlyPayout-desc
    // order, which varies by scenario / profile. We simulate that with an
    // arbitrary non-registry order and assert the builder restores registry
    // order.
    const payoutSorted: ReadonlyArray<ProductId> = [
      'bav',
      'versicherung',
      'altersvorsorgedepot',
      'basisrente',
      'riester',
      'etf',
    ]
    const rows = buildPrintProContraRows({ productIds: payoutSorted })
    const outputIds = rows.map((r) => r.productId)
    expect(outputIds).toEqual([...PRODUCT_IDS])
  })

  it('does not mutate the caller-provided productIds array', () => {
    const callerInput: ProductId[] = [
      'riester',
      'etf',
      'altersvorsorgedepot',
      'bav',
      'basisrente',
      'versicherung',
    ]
    const snapshot = [...callerInput]
    buildPrintProContraRows({ productIds: callerInput })
    expect(callerInput).toEqual(snapshot)
  })
})
