// @vitest-environment jsdom
/**
 * Tests for issue #23: "Assumptions for unfilled products not visible".
 *
 * Coverage:
 *   - `isProductAllDefaults` returns true for every product id when all
 *     assumptions match the shipped defaults.
 *   - `isProductAllDefaults` returns false once a user changes any tracked
 *     field.
 *   - `buildProductDefaultsSummary` returns a non-empty string for every
 *     product id (smoke: covers the label/value formatting).
 *   - `ProductEditCards` renders "Standardwert" provenance label on every
 *     card when assumptions are at defaults.
 *   - `ProductEditCards` renders "Einstellungen anpassen" button when
 *     `onOpenInputsForProduct` is provided and product is at defaults.
 *   - The "Einstellungen anpassen" button is absent when the product has
 *     been edited (not all defaults).
 *   - Clicking "Einstellungen anpassen" calls `onOpenInputsForProduct`
 *     with the correct product id.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { defaultAssumptions } from '../../data/defaultScenario'
import { isProductAllDefaults, buildProductDefaultsSummary } from './productDefaultsHelpers'
import { ProductEditCards } from './ProductEditCards'
import type { ProductResult, ScenarioAssumptions } from '../../domain'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('isProductAllDefaults', () => {
  it('returns true for etf at factory defaults', () => {
    expect(isProductAllDefaults('etf', defaultAssumptions)).toBe(true)
  })

  it('returns true for bav at factory defaults', () => {
    expect(isProductAllDefaults('bav', defaultAssumptions)).toBe(true)
  })

  it('returns true for versicherung at factory defaults', () => {
    expect(isProductAllDefaults('versicherung', defaultAssumptions)).toBe(true)
  })

  it('returns true for basisrente at factory defaults', () => {
    expect(isProductAllDefaults('basisrente', defaultAssumptions)).toBe(true)
  })

  it('returns true for altersvorsorgedepot at factory defaults', () => {
    expect(isProductAllDefaults('altersvorsorgedepot', defaultAssumptions)).toBe(true)
  })

  it('returns true for riester at factory defaults', () => {
    expect(isProductAllDefaults('riester', defaultAssumptions)).toBe(true)
  })

  it('returns false when etf annualAssetFee is changed', () => {
    const modified: ScenarioAssumptions = {
      ...defaultAssumptions,
      etf: { ...defaultAssumptions.etf, annualAssetFee: 0.005 },
    }
    expect(isProductAllDefaults('etf', modified)).toBe(false)
  })

  it('returns false when bav monthlyGrossConversion is changed', () => {
    const modified: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 500 },
    }
    expect(isProductAllDefaults('bav', modified)).toBe(false)
  })

  it('returns false when basisrente totalFee is changed', () => {
    const modified: ScenarioAssumptions = {
      ...defaultAssumptions,
      basisrente: {
        ...defaultAssumptions.basisrente,
        fees: { ...defaultAssumptions.basisrente.fees, wrapperAssetFee: 0.02 },
      },
    }
    expect(isProductAllDefaults('basisrente', modified)).toBe(false)
  })
})

describe('buildProductDefaultsSummary', () => {
  const productIds = [
    'etf',
    'bav',
    'versicherung',
    'basisrente',
    'altersvorsorgedepot',
    'riester',
  ] as const

  for (const id of productIds) {
    it(`returns a non-empty summary for ${id}`, () => {
      const summary = buildProductDefaultsSummary(id, defaultAssumptions)
      expect(typeof summary).toBe('string')
      expect(summary.length).toBeGreaterThan(0)
    })
  }
})

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

/** Minimal `ProductResult` stub sufficient for `ProductEditCards` rendering. */
function makeResult(productId: ProductResult['productId']): ProductResult {
  return {
    productId,
    label: productId,
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 48_000,
    totalProductContributions: 48_000,
    totalEmployerContributions: 0,
    totalFees: 1_000,
    capitalAtRetirement: 120_000,
    realCapitalAtRetirement: 90_000,
    afterTaxLumpSum: 110_000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 450,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 2.5,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.008,
    inputConfidence: 'user_confirmed',
    rows: [],
    etfPayoutRows: [],
  } as unknown as ProductResult
}

describe('ProductEditCards – defaults notice', () => {
  it('shows "Standardwert" provenance label on an all-default etf card', () => {
    const { getAllByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('etf')]}
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
      />,
    )
    // ProvLabel renders "Standardwert" for kind='default'
    expect(getAllByText('Standardwert').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Einstellungen anpassen" button when onOpenInputsForProduct is provided', () => {
    const { getByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('etf')]}
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onOpenInputsForProduct={vi.fn()}
      />,
    )
    expect(getByText('Einstellungen anpassen')).not.toBeNull()
  })

  it('does NOT show "Einstellungen anpassen" when onOpenInputsForProduct is absent', () => {
    const { queryByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('etf')]}
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
      />,
    )
    expect(queryByText('Einstellungen anpassen')).toBeNull()
  })

  it('does NOT show "Einstellungen anpassen" when the product has been edited', () => {
    const editedAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      etf: { ...defaultAssumptions.etf, annualAssetFee: 0.005 },
    }
    const { queryByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('etf')]}
        assumptions={editedAssumptions}
        onAssumptionsChange={vi.fn()}
        onOpenInputsForProduct={vi.fn()}
      />,
    )
    expect(queryByText('Einstellungen anpassen')).toBeNull()
  })

  it('calls onOpenInputsForProduct with the correct product id on click', () => {
    const handler = vi.fn()
    const { getByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('bav')]}
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onOpenInputsForProduct={handler}
      />,
    )
    fireEvent.click(getByText('Einstellungen anpassen'))
    expect(handler).toHaveBeenCalledWith('bav')
  })

  it('shows notice on each card when multiple products are all at defaults', () => {
    const { getAllByText } = render(
      <ProductEditCards
        selectedResults={[makeResult('etf'), makeResult('bav')]}
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onOpenInputsForProduct={vi.fn()}
      />,
    )
    expect(getAllByText('Einstellungen anpassen').length).toBe(2)
  })
})
