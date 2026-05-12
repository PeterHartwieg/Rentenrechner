// @vitest-environment jsdom
/**
 * Regression coverage for issue #184.
 *
 * The "Wohin geht das Geld?" waterfall should expose row-level explanations
 * for deduction/benefit lines whose source is not self-evident.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProductResult } from '../../domain'
import { QaFeedbackProvider } from '../qa-feedback/QaFeedbackProvider'
import { ResultWaterfall } from './ResultWaterfall'

afterEach(cleanup)

function makeResult(overrides: Partial<ProductResult> = {}): ProductResult {
  return {
    productId: 'altersvorsorgedepot',
    label: 'Altersvorsorgedepot',
    capitalAtRetirement: 100_000,
    afterTaxLumpSum: 92_000,
    lumpSumDeductions: {
      incomeTax: 6_000,
      kvPv: 2_000,
    },
    grossMonthlyPayout: 540,
    netMonthlyPayout: 500,
    monthlyUserCost: 200,
    monthlyProductContribution: 260,
    monthlyEmployerContribution: 0,
    accumulationRiy: 0.01,
    yearlyRows: [],
    monteCarlo: null,
    ...overrides,
  } as ProductResult
}

describe('ResultWaterfall row explanations (issue #184)', () => {
  it('adds accessible info buttons for ambiguous benefit and deduction rows', () => {
    render(
      <QaFeedbackProvider>
        <ResultWaterfall result={makeResult()} />
      </QaFeedbackProvider>,
    )

    expect(screen.getByRole('button', { name: 'Steuer-/SV-Vorteil erklären' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Arbeitgeber / Zulagen erklären' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Steuer & KV/PV erklären' })).toBeTruthy()
  })
})
