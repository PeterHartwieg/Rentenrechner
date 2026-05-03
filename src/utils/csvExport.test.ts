/**
 * Tests for buildExportCsv (Group G issue 09 N5).
 *
 * Coverage:
 *   - Section 0 (Disclaimer) is unchanged — first 4 data lines match known German wording.
 *   - Section 1 header contains a "Confidence" column.
 *   - "Confidence" is the 10th column (0-indexed: index 9) in Section 1 data rows.
 */

import { describe, it, expect } from 'vitest'
import { buildExportCsv } from './csvExport'
import { de2026Rules } from '../rules/de2026'
import { defaultProfile } from '../data/defaultScenario'
import type { ProductResult } from '../domain'

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
}

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

  it('Section 1 header contains a "Confidence" column', () => {
    const csv = buildExportCsv(BASE_OPTS)
    const lines = csv.split('\n')
    const headerLineIdx = lines.findIndex((l) => l.startsWith('Detailvergleich'))
    expect(headerLineIdx).toBeGreaterThanOrEqual(0)
    const headerRow = lines[headerLineIdx + 1]
    expect(headerRow).toContain('Confidence')
  })

  it('"Confidence" is the 10th column (index 9) in Section 1 header and data rows', () => {
    const csv = buildExportCsv(BASE_OPTS)
    const lines = csv.split('\n')
    const headerLineIdx = lines.findIndex((l) => l.startsWith('Detailvergleich'))
    const headerRow = lines[headerLineIdx + 1]
    const headerCols = headerRow.split(',')
    expect(headerCols[9]).toBe('Confidence')

    // Data row immediately after header
    const dataRow = lines[headerLineIdx + 2]
    const dataCols = dataRow.split(',')
    // inputConfidence = 'model_estimate'
    expect(dataCols[9]).toBe('model_estimate')
  })
})
