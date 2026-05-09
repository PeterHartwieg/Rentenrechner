/**
 * Tests for buildExportCsv (Group G issue 09 N5).
 *
 * Coverage:
 *   - Section 0 (Disclaimer) is unchanged — first 4 data lines match known German wording.
 *   - Section 1 header contains a "Confidence" column.
 *   - "Confidence" is the 10th column (0-indexed: index 9) in Section 1 data rows.
 *   - csvCell formula-injection neutralization (gh#62).
 */

import { describe, it, expect } from 'vitest'
import { buildCombinePortfolioCsv, buildExportCsv } from './csvExport'
import { de2026Rules } from '../rules/de2026'
import { defaultProfile } from '../data/defaultScenario'
import type { EtfProductResult, ProductResult, YearlyProjection } from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'

// Minimal ProductResult fixture — only the fields csvExport reads.
const FIXTURE_PRODUCT: ProductResult = {
  productId: 'etf',
  label: 'ETF',
  scenarioId: 'basis',
  scenarioLabel: 'Basis',
  annualReturn: 0.06,
  monthlyUserCost: 200,
  monthlyProductContribution: 200,
  monthlyEmployerContribution: 0,
  totalUserCost: 48000,
  totalProductContributions: 48000,
  totalEmployerContributions: 0,
  totalFees: 1000,
  capitalAtRetirement: 120000,
  realCapitalAtRetirement: 90000,
  afterTaxLumpSum: 110000,
  grossMonthlyPayout: 500,
  netMonthlyPayout: 450,
  taxAndSvSavings: 0,
  valueMultipleOnUserCost: 2.5,
  capitalMultipleAnnualized: 1.05,
  accumulationRiy: 0.008,
  inputConfidence: 'model_estimate',
  rows: [],
  etfPayoutRows: [],
} as unknown as ProductResult

const BASE_OPTS = {
  products: [FIXTURE_PRODUCT],
  bavAnnualTaxSvSavings: 0,
  bavProfile: defaultProfile,
  bavKvdrMember: true,
  bavOtherAnnualIncome: 0,
  insuranceTaxMode: 'halbeinkuenfte' as const,
  equityPartialExemption: 0.3,
  insuranceOtherAnnualIncome: 0,
  rules: de2026Rules,
  inflationRate: 0.02,
}

// ---------------------------------------------------------------------------
// csvCell — formula injection neutralization (gh#62)
// ---------------------------------------------------------------------------
// csvCell is not exported; we test it indirectly through buildExportCsv by
// injecting formula-prefixed labels into a product fixture.

function csvCellViaExport(label: string): string {
  // Build a minimal CSV and extract the label cell from the first data row of
  // Section 1 (Detailvergleich). The label is always the first column.
  const fixture = {
    ...BASE_OPTS,
    products: [
      {
        ...FIXTURE_PRODUCT,
        label,
      } as typeof FIXTURE_PRODUCT,
    ],
  }
  const csv = buildExportCsv(fixture)
  const lines = csv.split('\n')
  const headerLineIdx = lines.findIndex((l) => l.startsWith('Detailvergleich'))
  const dataRow = lines[headerLineIdx + 2] // skip section header + column header
  // Return the raw first cell (may be quoted or prefixed).
  // Split carefully: the label may itself be quoted.
  const firstComma = dataRow.indexOf(',')
  return firstComma === -1 ? dataRow : dataRow.slice(0, firstComma)
}

describe('csvCell — formula injection neutralization (gh#62)', () => {
  it('neutralizes = prefix', () => {
    expect(csvCellViaExport('=SUM(A1)')).toBe("'=SUM(A1)")
  })

  it('neutralizes + prefix', () => {
    expect(csvCellViaExport('+foo')).toBe("'+foo")
  })

  it('neutralizes - prefix', () => {
    expect(csvCellViaExport('-bar')).toBe("'-bar")
  })

  it('neutralizes @ prefix', () => {
    expect(csvCellViaExport('@user')).toBe("'@user")
  })

  it('neutralizes tab prefix', () => {
    expect(csvCellViaExport('\tfoo')).toBe("'\tfoo")
  })

  it('neutralizes CR prefix', () => {
    expect(csvCellViaExport('\rfoo')).toBe("'\rfoo")
  })

  it('leaves normal strings unchanged', () => {
    expect(csvCellViaExport('Mein ETF')).toBe('Mein ETF')
  })

  it('leaves number strings unchanged', () => {
    expect(csvCellViaExport('12345')).toBe('12345')
  })
})

describe('buildExportCsv', () => {
  it('Section 0 contains the German disclaimer wording unchanged', () => {
    const csv = buildExportCsv(BASE_OPTS)
    const lines = csv.split('\n')
    // Line 0: 'Hinweis'
    expect(lines[0]).toBe('Hinweis')
    // Lines 1-4 are the four disclaimer sentences.
    expect(lines[1]).toContain('Modellrechnung')
    expect(lines[2]).toContain('Modellrechnung mit Stand 2026')
    expect(lines[3]).toContain('Steuers')
    expect(lines[4]).toContain('Annahmen')
  })

  it('Section 1 header contains a "Datenqualität" column (German, not raw English)', () => {
    const csv = buildExportCsv(BASE_OPTS)
    const lines = csv.split('\n')
    const headerLineIdx = lines.findIndex((l) => l.startsWith('Detailvergleich'))
    expect(headerLineIdx).toBeGreaterThanOrEqual(0)
    const headerRow = lines[headerLineIdx + 1]
    expect(headerRow).toContain('Datenqualität')
  })

  it('discloses the active inflation assumption', () => {
    const csv = buildExportCsv(BASE_OPTS)
    expect(csv).toContain('Aktive Annahmen')
    expect(csv).toContain('Inflation p.a. (%)')
    expect(csv).toContain('2.00')
  })

  it('"Datenqualität" is the 10th column (index 9); data rows show German label not raw domain value', () => {
    const csv = buildExportCsv(BASE_OPTS)
    const lines = csv.split('\n')
    const headerLineIdx = lines.findIndex((l) => l.startsWith('Detailvergleich'))
    const headerRow = lines[headerLineIdx + 1]
    const headerCols = headerRow.split(',')
    expect(headerCols[9]).toBe('Datenqualität')

    // Data row immediately after header
    const dataRow = lines[headerLineIdx + 2]
    const dataCols = dataRow.split(',')
    // inputConfidence = 'model_estimate' → formatted as 'Schätzwert' (not raw English)
    expect(dataCols[9]).toBe('Schätzwert')
    expect(dataCols[9]).not.toBe('model_estimate')
  })
})

// ---------------------------------------------------------------------------
// gh#61 — Kapital n. St. column: Basisrente / AVD / Riester product rows.
// ---------------------------------------------------------------------------

// Yearly cashflow row fixture used by the §22 Nr. 5 / Basisrente tests.
// Balance is set to a positive amount so after-tax logic runs.
const FIXTURE_YEARLY_ROW: YearlyProjection = {
  year: 20,
  age: 60,
  productId: 'etf', // overridden per fixture below
  scenarioId: 'basis',
  balance: 50000,
  realBalance: 40000,
  yearlyUserCost: 1200,
  yearlyProductContribution: 1200,
  yearlyEmployerContribution: 0,
  yearlyFees: 60,
  cumulativeFees: 600,
  cumulativeProductContributions: 24000,
  cumulativeVorabpauschale: 100,
}

function makeProductWithRow(productId: ProductResult['productId'], label: string): ProductResult {
  return {
    ...FIXTURE_PRODUCT,
    productId,
    label,
    rows: [{ ...FIXTURE_YEARLY_ROW, productId }],
  } as unknown as ProductResult
}

function extractKapitalNachSteuerFromCashflows(csv: string, label: string): string {
  // Find the "Jahres-Cashflows" section, then locate the data row for this product.
  const lines = csv.split('\n')
  const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows')
  if (sectionIdx < 0) throw new Error('Jahres-Cashflows section not found')
  // Header row: Produkt(0), Szenario(1), Alter(2), Nettoaufwand(3), Beitrag(4),
  //             AG-Anteil(5), Steuer-/SV-Ersparnis(6), Gebühren(7), Kum.Gebühren(8),
  //             Kapital(9), Kapital n. St.(10), Reales Kapital(11), Real n. St.(12)
  const dataRows = lines.slice(sectionIdx + 2) // skip section header + column header
  const row = dataRows.find((l) => l.startsWith(label + ','))
  if (!row) throw new Error(`Row for label "${label}" not found`)
  const cols = row.split(',')
  return cols[10] // Kapital n. St. (EUR) — index 10
}

describe('buildExportCsv — gh#61 Kapital n. St. column correctness', () => {
  const baseOptsNoBav = {
    ...BASE_OPTS,
    bavAnnualTaxSvSavings: 0,
  }

  it('Basisrente row exports blank for Kapital n. St. (capital payout legally prohibited)', () => {
    const product = makeProductWithRow('basisrente', 'Basisrente')
    const csv = buildExportCsv({ ...baseOptsNoBav, products: [product] })
    const cell = extractKapitalNachSteuerFromCashflows(csv, 'Basisrente')
    expect(cell).toBe('')
  })

  it('AVD row exports §22 Nr. 5 after-tax capital (non-blank, positive)', () => {
    const product = makeProductWithRow('altersvorsorgedepot', 'Altersvorsorgedepot')
    const csv = buildExportCsv({ ...baseOptsNoBav, products: [product] })
    const cell = extractKapitalNachSteuerFromCashflows(csv, 'Altersvorsorgedepot')
    expect(cell).not.toBe('')
    expect(Number(cell)).toBeGreaterThan(0)
    // Must be less than gross balance (tax was deducted).
    expect(Number(cell)).toBeLessThan(FIXTURE_YEARLY_ROW.balance)
  })

  it('Riester row exports §22 Nr. 5 after-tax capital (non-blank, positive)', () => {
    const product = makeProductWithRow('riester', 'Riester')
    const csv = buildExportCsv({ ...baseOptsNoBav, products: [product] })
    const cell = extractKapitalNachSteuerFromCashflows(csv, 'Riester')
    expect(cell).not.toBe('')
    expect(Number(cell)).toBeGreaterThan(0)
    expect(Number(cell)).toBeLessThan(FIXTURE_YEARLY_ROW.balance)
  })

  it('AVD and Riester rows produce the same after-tax capital when both other-income values are equal (same §22 Nr. 5 path)', () => {
    const avdProduct = makeProductWithRow('altersvorsorgedepot', 'Altersvorsorgedepot')
    const riesterProduct = makeProductWithRow('riester', 'Riester')
    const csvAvd = buildExportCsv({ ...baseOptsNoBav, products: [avdProduct], avdOtherAnnualIncome: 0, riesterOtherAnnualIncome: 0 })
    const csvRiester = buildExportCsv({ ...baseOptsNoBav, products: [riesterProduct], avdOtherAnnualIncome: 0, riesterOtherAnnualIncome: 0 })
    const avdCell = extractKapitalNachSteuerFromCashflows(csvAvd, 'Altersvorsorgedepot')
    const riesterCell = extractKapitalNachSteuerFromCashflows(csvRiester, 'Riester')
    expect(Number(avdCell)).toBeCloseTo(Number(riesterCell), 2)
  })

  it('AVD and Riester rows respect product-specific other-income (no cross-contamination)', () => {
    const avdProduct = makeProductWithRow('altersvorsorgedepot', 'Altersvorsorgedepot')
    const riesterProduct = makeProductWithRow('riester', 'Riester')
    // Both products in same export, but different other-income values.
    const csv = buildExportCsv({
      ...baseOptsNoBav,
      products: [avdProduct, riesterProduct],
      avdOtherAnnualIncome: 12000,
      riesterOtherAnnualIncome: 0,
    })
    const avdCell = extractKapitalNachSteuerFromCashflows(csv, 'Altersvorsorgedepot')
    const riesterCell = extractKapitalNachSteuerFromCashflows(csv, 'Riester')
    // With higher other-income, AVD has higher marginal tax → lower after-tax.
    expect(Number(avdCell)).toBeLessThan(Number(riesterCell))
  })

  it('bAV row still produces after-tax capital via bAV lump-sum path (unchanged)', () => {
    const product = makeProductWithRow('bav', 'bAV')
    const csv = buildExportCsv({ ...baseOptsNoBav, products: [product] })
    const cell = extractKapitalNachSteuerFromCashflows(csv, 'bAV')
    expect(cell).not.toBe('')
    expect(Number(cell)).toBeGreaterThan(0)
  })

  it('private-insurance row still uses insurance lump-sum path (fallthrough unchanged)', () => {
    const product = makeProductWithRow('versicherung', 'Versicherung')
    const csv = buildExportCsv({ ...baseOptsNoBav, products: [product] })
    const cell = extractKapitalNachSteuerFromCashflows(csv, 'Versicherung')
    expect(cell).not.toBe('')
    expect(Number(cell)).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Combine-mode CSV builder (Group G issue 11).
// ---------------------------------------------------------------------------

const FIXTURE_BAV_INSTANCE_RESULT: ProductResult = {
  ...FIXTURE_PRODUCT,
  productId: 'bav' as ProductResult['productId'],
  label: 'bAV Vertrag A',
  instanceId: 'bav-1',
} as unknown as ProductResult

const FIXTURE_COMBINED: CombinedResult = {
  monthlyNetIncome: 2345.67,
  monthlyGrossPayouts: {
    statutoryPension: 1200,
    bav: 500,
    privateInsurance: 0,
    basisrente: 0,
    altersvorsorgedepot: 0,
    riester: 0,
    etf: 0,
  },
  aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
  aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
  byInstance: {},
  statutoryPensionMonthlyNet: 1100,
  notes: [],
}

// Minimal YearlyProjection row fixture.
const FIXTURE_ROW: YearlyProjection = {
  year: 1,
  age: 40,
  productId: 'bav',
  scenarioId: 'basis',
  balance: 5000,
  realBalance: 4800,
  yearlyUserCost: 1800,
  yearlyProductContribution: 1800,
  yearlyEmployerContribution: 600,
  yearlyFees: 30,
  cumulativeFees: 30,
  cumulativeProductContributions: 1800,
  cumulativeVorabpauschale: 0,
}

const FIXTURE_ETF_ROW: YearlyProjection = {
  ...FIXTURE_ROW,
  productId: 'etf',
  yearlyEmployerContribution: 0,
}

const FIXTURE_ETF_INSTANCE_RESULT: EtfProductResult = {
  ...FIXTURE_PRODUCT,
  productId: 'etf',
  label: 'ETF Depot B',
  instanceId: 'etf-1',
  rows: [FIXTURE_ETF_ROW],
  etfPayoutRows: [
    {
      year: 1,
      age: 67,
      capitalAtStart: 120000,
      grossAnnualPayout: 6000,
      taxableGain: 3000,
      saverAllowanceUsed: 1000,
      taxDue: 500,
      netAnnualPayout: 5500,
      netMonthlyPayout: 458.33,
      capitalAtEnd: 114000,
      remainingCostBasis: 60000,
    },
  ],
} as unknown as EtfProductResult

const FIXTURE_BAV_WITH_ROWS: ProductResult = {
  ...FIXTURE_BAV_INSTANCE_RESULT,
  rows: [FIXTURE_ROW],
} as unknown as ProductResult

// Two-instance workspace: bAV + ETF.
const TWO_INSTANCE_OPTS = {
  perInstance: {
    'bav-1': [FIXTURE_BAV_WITH_ROWS],
    'etf-1': [FIXTURE_ETF_INSTANCE_RESULT],
  },
  combinedByScenarioId: { basis: FIXTURE_COMBINED },
  scenarioLabels: { basis: 'Basis' },
}

describe('buildCombinePortfolioCsv', () => {
  it('Section 0 (Hinweis) is the literal first block — disclaimer-as-first-block invariant', () => {
    const csv = buildCombinePortfolioCsv({
      perInstance: { 'bav-1': [FIXTURE_BAV_INSTANCE_RESULT] },
      combinedByScenarioId: { basis: FIXTURE_COMBINED },
      scenarioLabels: { basis: 'Basis' },
    })
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Hinweis')
    expect(lines[1]).toContain('Modellrechnung')
  })

  it('disclaimer-first invariant holds even in two-instance workspace', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Hinweis')
    expect(lines[1]).toContain('Modellrechnung')
  })

  it('contains the combined-income section with the aggregated monthly net', () => {
    const csv = buildCombinePortfolioCsv({
      perInstance: { 'bav-1': [FIXTURE_BAV_INSTANCE_RESULT] },
      combinedByScenarioId: { basis: FIXTURE_COMBINED },
      scenarioLabels: { basis: 'Basis' },
    })
    expect(csv).toContain('Kombiniertes Renteneinkommen')
    // 2345.67 → "2345.67" via toFixed(2)
    expect(csv).toContain('2345.67')
  })

  it('contains the per-instance detail section keyed by instanceId', () => {
    const csv = buildCombinePortfolioCsv({
      perInstance: { 'bav-1': [FIXTURE_BAV_INSTANCE_RESULT] },
      combinedByScenarioId: { basis: FIXTURE_COMBINED },
      scenarioLabels: { basis: 'Basis' },
    })
    expect(csv).toContain('Mein Plan — Detail je Instanz')
    expect(csv).toContain('bav-1')
    expect(csv).toContain('bAV Vertrag A')
  })

  it('Section 3 — Jahres-Cashflows je Instanz: header present and per-instance per-year rows emitted', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    expect(csv).toContain('Jahres-Cashflows je Instanz')
    // Both instance ids appear in the cashflow rows.
    const lines = csv.split('\n')
    const cashflowSectionStart = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    expect(cashflowSectionStart).toBeGreaterThanOrEqual(0)
    const cashflowBlock = lines.slice(cashflowSectionStart).join('\n')
    expect(cashflowBlock).toContain('bav-1')
    expect(cashflowBlock).toContain('etf-1')
    // Age column from FIXTURE_ROW (age=40) is present.
    expect(cashflowBlock).toContain('40')
    // Balance value from FIXTURE_ROW (5000.00) is present.
    expect(cashflowBlock).toContain('5000.00')
  })

  it('Section 3 — header column set matches compare-mode Jahres-Cashflows (including after-tax capital columns)', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    const headerRow = lines[sectionIdx + 1]
    expect(headerRow).toContain('Instanz')
    expect(headerRow).toContain('Alter')
    expect(headerRow).toContain('Nettoaufwand p.a. (EUR)')
    expect(headerRow).toContain('Beitrag p.a. (EUR)')
    expect(headerRow).toContain('AG-Anteil p.a. (EUR)')
    expect(headerRow).toContain('Gebühren p.a. (EUR)')
    expect(headerRow).toContain('Kapital (EUR)')
    expect(headerRow).toContain('Kapital n. St. (EUR)')
    expect(headerRow).toContain('Reales Kapital (EUR)')
    expect(headerRow).toContain('Real n. St. (EUR)')
  })

  it('Section 4 — Rentenphase (ETF-Entnahme) je ETF-Instanz: present only when ETF instance has payout rows', () => {
    // Without ETF instance: section absent.
    const csvNoEtf = buildCombinePortfolioCsv({
      perInstance: { 'bav-1': [FIXTURE_BAV_WITH_ROWS] },
      combinedByScenarioId: { basis: FIXTURE_COMBINED },
      scenarioLabels: { basis: 'Basis' },
    })
    expect(csvNoEtf).not.toContain('Rentenphase (ETF-Entnahme) je ETF-Instanz')

    // With ETF instance: section present.
    const csvWithEtf = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    expect(csvWithEtf).toContain('Rentenphase (ETF-Entnahme) je ETF-Instanz')
  })

  it('Section 4 — ETF payout rows contain instanceId, age, and payout figures', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Rentenphase (ETF-Entnahme) je ETF-Instanz')
    expect(sectionIdx).toBeGreaterThanOrEqual(0)
    const sectionBlock = lines.slice(sectionIdx).join('\n')
    // instanceId
    expect(sectionBlock).toContain('etf-1')
    // Age from payout row (67)
    expect(sectionBlock).toContain('67')
    // Capital at start (120000.00)
    expect(sectionBlock).toContain('120000.00')
    // Net monthly (458.33)
    expect(sectionBlock).toContain('458.33')
  })

  it('Section 4 — ETF payout header column set matches compare-mode section', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Rentenphase (ETF-Entnahme) je ETF-Instanz')
    const headerRow = lines[sectionIdx + 1]
    expect(headerRow).toContain('Instanz')
    expect(headerRow).toContain('Alter')
    expect(headerRow).toContain('Kapital Anfang (EUR)')
    expect(headerRow).toContain('Brutto p.a. (EUR)')
    expect(headerRow).toContain('Steuer (EUR)')
    expect(headerRow).toContain('Netto mtl. (EUR)')
    expect(headerRow).toContain('Kapital Ende (EUR)')
  })

  // -------------------------------------------------------------------------
  // Section 3 after-tax columns (#24 follow-up)
  // -------------------------------------------------------------------------

  it('Section 3 — after-tax columns always present in header; blank in data when perInstanceTaxModes omitted', () => {
    const csv = buildCombinePortfolioCsv(TWO_INSTANCE_OPTS)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    const headerRow = lines[sectionIdx + 1]
    // Header always includes after-tax columns (parity with compare-mode).
    expect(headerRow).toContain('Kapital n. St. (EUR)')
    expect(headerRow).toContain('Real n. St. (EUR)')
    // Data rows have blank after-tax cells (empty string) when tax modes not supplied.
    const dataRow = lines[sectionIdx + 2]
    const cols = dataRow.split(',')
    // Header: Instanz, Produkt, Szenario, Alter, Nettoaufwand, Beitrag, AG, Gebühren, Kum.Gebühren, Kapital, n.St., Reales Kapital, Real n.St.
    // Index 10 = Kapital n. St., index 12 = Real n. St. — should be blank.
    expect(cols[10]).toBe('')
    expect(cols[12]).toBe('')
  })

  it('Section 3 — after-tax columns present for ETF instance when perInstanceTaxModes supplied', () => {
    const optsWithTax = {
      ...TWO_INSTANCE_OPTS,
      perInstanceTaxModes: {
        'etf-1': { equityPartialExemption: 0.3 },
        'bav-1': { bavTaxMode: 'voll_versorgungsbezug' as const },
      },
      rules: de2026Rules,
      profile: defaultProfile,
    }
    const csv = buildCombinePortfolioCsv(optsWithTax)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    const headerRow = lines[sectionIdx + 1]
    // After-tax columns now present in header.
    expect(headerRow).toContain('Kapital n. St. (EUR)')
    expect(headerRow).toContain('Real n. St. (EUR)')
    // Locate the ETF data row (etf-1 instance) and confirm after-tax value is non-blank.
    const sectionBlock = lines.slice(sectionIdx + 2)
    const etfRow = sectionBlock.find((l) => l.startsWith('etf-1,'))
    expect(etfRow).toBeDefined()
    const etfCols = etfRow!.split(',')
    // Column 10 = Kapital n. St. — should be a non-empty number string.
    expect(etfCols[10]).not.toBe('')
    expect(Number(etfCols[10])).toBeGreaterThan(0)
  })

  it('Section 3 — after-tax columns present for bAV instance when perInstanceTaxModes supplied', () => {
    const optsWithTax = {
      ...TWO_INSTANCE_OPTS,
      perInstanceTaxModes: {
        'bav-1': { bavTaxMode: 'fuenftelregelung' as const },
        'etf-1': { equityPartialExemption: 0.3 },
      },
      rules: de2026Rules,
      profile: defaultProfile,
    }
    const csv = buildCombinePortfolioCsv(optsWithTax)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    const sectionBlock = lines.slice(sectionIdx + 2)
    const bavRow = sectionBlock.find((l) => l.startsWith('bav-1,'))
    expect(bavRow).toBeDefined()
    const bavCols = bavRow!.split(',')
    // Column 10 = Kapital n. St. — should be a non-empty number for bAV.
    expect(bavCols[10]).not.toBe('')
    expect(Number(bavCols[10])).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Regression: gh#59 — combine-mode Section 2 "Netto-Rente mtl." must use
// CombinedResult.byInstance[instanceId].monthlyNet, not r.netMonthlyPayout.
//
// Multi-product households see diverging values because the aggregate pipeline
// (progressive income tax + KV/PV across all sources) redistributes the tax
// burden after summing; the per-instance simulator only knows its own source.
// ---------------------------------------------------------------------------

describe('buildCombinePortfolioCsv — gh#59 byInstance net regression', () => {
  // Build a two-instance scenario where the aggregate-allocated net
  // (byInstance.monthlyNet) differs from the per-instance netMonthlyPayout.
  // The bAV instance has netMonthlyPayout=400 but the aggregate pipeline
  // apportions a higher tax burden (multi-source progressive bracket), so
  // byInstance.monthlyNet=350.  The ETF instance passes through unchanged.
  const BAV_PER_INSTANCE_NET = 400
  const BAV_AGGREGATE_NET = 350
  const ETF_PER_INSTANCE_NET = 450

  const bavResult: ProductResult = {
    ...FIXTURE_PRODUCT,
    productId: 'bav' as ProductResult['productId'],
    label: 'bAV Hauptvertrag',
    instanceId: 'bav-reg-1',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    grossMonthlyPayout: 500,
    netMonthlyPayout: BAV_PER_INSTANCE_NET, // isolated value
    rows: [],
  } as unknown as ProductResult

  const etfResult: ProductResult = {
    ...FIXTURE_PRODUCT,
    productId: 'etf' as ProductResult['productId'],
    label: 'ETF Depot',
    instanceId: 'etf-reg-1',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    grossMonthlyPayout: 500,
    netMonthlyPayout: ETF_PER_INSTANCE_NET,
    rows: [],
    etfPayoutRows: [],
  } as unknown as ProductResult

  const combinedWithByInstance: CombinedResult = {
    monthlyNetIncome: BAV_AGGREGATE_NET + ETF_PER_INSTANCE_NET + 1100,
    monthlyGrossPayouts: {
      statutoryPension: 1200,
      bav: 500,
      privateInsurance: 0,
      basisrente: 0,
      altersvorsorgedepot: 0,
      riester: 0,
      etf: 500,
    },
    aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
    aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
    byInstance: {
      'bav-reg-1': {
        instanceId: 'bav-reg-1',
        productId: 'bav',
        monthlyGross: 500,
        monthlyNet: BAV_AGGREGATE_NET, // aggregate-adjusted (lower due to progressive tax)
        taxShareAnnual: 600,
        kvPvShare: 50,
      },
      'etf-reg-1': {
        instanceId: 'etf-reg-1',
        productId: 'etf',
        monthlyGross: 500,
        monthlyNet: ETF_PER_INSTANCE_NET,
        taxShareAnnual: 600,
        kvPvShare: 0,
      },
    },
    statutoryPensionMonthlyNet: 1100,
    notes: [],
  }

  const opts = {
    perInstance: {
      'bav-reg-1': [bavResult],
      'etf-reg-1': [etfResult],
    },
    combinedByScenarioId: { basis: combinedWithByInstance },
    scenarioLabels: { basis: 'Basis' },
  }

  it('Section 2 Netto-Rente uses byInstance.monthlyNet, not per-instance netMonthlyPayout, for bAV', () => {
    const csv = buildCombinePortfolioCsv(opts)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Mein Plan — Detail je Instanz')
    expect(sectionIdx).toBeGreaterThanOrEqual(0)
    const sectionBlock = lines.slice(sectionIdx + 2) // skip header row
    const bavRow = sectionBlock.find((l) => l.startsWith('bav-reg-1,'))
    expect(bavRow).toBeDefined()
    const cols = bavRow!.split(',')
    // Column layout: Instanz(0), Produkt(1), Szenario(2), Nettoaufwand(3),
    // Beitrag(4), Kapital(5), Brutto-Rente(6), Netto-Rente(7), Kosten(8), Datenqualität(9)
    const nettoRente = Number(cols[7])
    // Must use the aggregate-allocated value (350), not the isolated value (400).
    expect(nettoRente).toBeCloseTo(BAV_AGGREGATE_NET, 1)
    expect(nettoRente).not.toBeCloseTo(BAV_PER_INSTANCE_NET, 1)
  })

  it('Section 2 Netto-Rente falls back to per-instance netMonthlyPayout when byInstance is absent', () => {
    // combinedByScenarioId has an empty byInstance — simulates the case where
    // the aggregate pipeline hasn't produced an entry for this instance.
    const combinedEmpty: CombinedResult = {
      ...combinedWithByInstance,
      byInstance: {},
    }
    const optsNoCombined = {
      ...opts,
      combinedByScenarioId: { basis: combinedEmpty },
    }
    const csv = buildCombinePortfolioCsv(optsNoCombined)
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Mein Plan — Detail je Instanz')
    const sectionBlock = lines.slice(sectionIdx + 2)
    const bavRow = sectionBlock.find((l) => l.startsWith('bav-reg-1,'))
    expect(bavRow).toBeDefined()
    const cols = bavRow!.split(',')
    const nettoRente = Number(cols[7])
    // Falls back to per-instance value (400) when byInstance has no entry.
    expect(nettoRente).toBeCloseTo(BAV_PER_INSTANCE_NET, 1)
  })
})
