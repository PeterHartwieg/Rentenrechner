// @vitest-environment jsdom

/**
 * `ProdukteEingabenPanel` (PR 3) — Sober D compare-mode body for
 * `/eingaben/produkte`. Tests pin the live-data wiring (§ 1 DRV card
 * sources values from `simulation.statutoryPension` + `activeRules`),
 * the visible-products partition (§ 2 enabled rows vs § 3 quick-add
 * tiles), and the toggle interactions (§ 2 Entfernen, § 2 Bearbeiten,
 * § 3 Sparform click) so a future engine/registry change can be caught
 * here before it ships.
 *
 * The tests rely on `defaultAssumptions.visibleProducts === ['etf', 'bav']`
 * (compare-mode default — see `data/defaultScenario.ts` L119). When that
 * default changes, update the partition assertions below.
 */

import type { Dispatch, SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ScenarioAssumptions } from '../../domain'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { simulateRetirementComparison } from '../../engine/simulate'
import { ProdukteEingabenPanel, type ProdukteEingabenPanelProps } from './ProdukteEingabenPanel'

afterEach(() => cleanup())

function makeSimulation(assumptions: ScenarioAssumptions = defaultAssumptions) {
  return simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
}

function defaultProps(overrides: Partial<{
  visibleProducts: ScenarioAssumptions['visibleProducts']
  onAssumptionsChange: Dispatch<SetStateAction<ScenarioAssumptions>>
}> = {}): ProdukteEingabenPanelProps {
  const visibleProducts = overrides.visibleProducts ?? defaultAssumptions.visibleProducts
  const assumptions: ScenarioAssumptions = {
    ...defaultAssumptions,
    visibleProducts: [...visibleProducts],
  }
  const simulation = makeSimulation(assumptions)
  const selectedResults = simulation.products.filter(
    (r) => r.scenarioId === 'basis' && visibleProducts.includes(r.productId),
  )
  const onAssumptionsChange: Dispatch<SetStateAction<ScenarioAssumptions>> =
    overrides.onAssumptionsChange ?? vi.fn()
  return {
    mode: 'compare',
    profile: defaultProfile,
    assumptions,
    onProfileChange: vi.fn(),
    onAssumptionsChange,
    simulation,
    selectedResults,
    kvdrMember: true,
    bavLumpSumTaxMode: 'voll_versorgungsbezug',
    insuranceTaxMode: 'halbeinkuenfte',
    tarifgebunden: false,
    onTarifgebundenChange: vi.fn(),
    onSyncMonthlyContribution: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// § 1 — DRV card. Live values, no hardcoded statutory numbers.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — § 1 DRV card (live data)', () => {
  it('renders the DRV section legend and the row title', () => {
    const { getByText } = render(<ProdukteEingabenPanel {...defaultProps()} />)
    expect(getByText('§ 1 · Gesetzliche Rente')).toBeTruthy()
    expect(
      getByText('Rentenauskunft der Deutschen Rentenversicherung'),
    ).toBeTruthy()
  })

  it('renders the "Stand", "Bisherige Entgeltpunkte" and "Heutiger Rentenwert (West)" rows with live values', () => {
    const { getByText, container } = render(
      <ProdukteEingabenPanel {...defaultProps()} />,
    )
    expect(getByText('Stand')).toBeTruthy()
    expect(getByText('Bisherige Entgeltpunkte')).toBeTruthy()
    expect(getByText('Heutiger Rentenwert (West)')).toBeTruthy()
    expect(getByText('Brutto-Rente, geschätzt')).toBeTruthy()
    expect(getByText('Steuerlich erfasst ab')).toBeTruthy()

    // The "Voraussichtlich mit <retirementAge>" label uses the current
    // profile's retirement age — currently 67 in defaultProfile. Don't hard-
    // assert "67" so a future profile default change doesn't break the test.
    const retirementAgeKey = `Voraussichtlich mit ${defaultProfile.retirementAge}`
    expect(getByText(retirementAgeKey)).toBeTruthy()

    // P0 invariant: no hardcoded statutory numbers — the Rentenwert (West)
    // value cell renders the live `activeRules.socialSecurity.aktuellerRentenwert`
    // = 42.52 EUR for 2026. We assert the string contains "42,52" (German
    // decimal comma) so we catch a regression to "40,79" or another stale
    // figure quickly.
    expect(container.textContent ?? '').toContain('42,52')
  })

  it('toggles the GRV override disclosure when "Manuell überschreiben" is clicked', () => {
    const { getByRole, queryByTestId } = render(
      <ProdukteEingabenPanel {...defaultProps()} />,
    )
    expect(queryByTestId('produkte-grv-disclosure')).toBeNull()
    fireEvent.click(getByRole('button', { name: 'Manuell überschreiben' }))
    expect(queryByTestId('produkte-grv-disclosure')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § 2 — Eigene Verträge. Iterates visibleProducts.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — § 2 contract rows', () => {
  it('renders one row per visible product (defaults: etf, bav)', () => {
    const { container, getByText } = render(
      <ProdukteEingabenPanel {...defaultProps()} />,
    )
    // The kicker carries the Schicht number derived from the product id.
    // Both ETF and bAV rows must mount; their secondary "Entfernen" buttons
    // appear once each (per row).
    const entfernenButtons = container.querySelectorAll(
      'button.d-produkt-row__btn--destructive',
    )
    // 2 contract rows (etf, bav). The DRV row has no destructive secondary.
    expect(entfernenButtons.length).toBe(2)
    // PRODUCT_REGISTRY labels for the two enabled products are visible.
    expect(getByText('ETF-Depot')).toBeTruthy()
    expect(getByText('Betriebliche Altersvorsorge (bAV)')).toBeTruthy()
  })

  it('does NOT render a row for a product NOT in visibleProducts', () => {
    const { container } = render(
      <ProdukteEingabenPanel
        {...defaultProps({ visibleProducts: ['etf'] })}
      />,
    )
    // bAV is disabled → it shows up as a § 3 sparform tile (not a § 2 row).
    // The § 2 row count drops to 1.
    const rowGroups = container.querySelectorAll(
      '.produkte-eingaben-panel__row-group',
    )
    expect(rowGroups.length).toBe(1)
  })

  it('clicking "Entfernen" removes the product from visibleProducts', () => {
    const onAssumptionsChange = vi.fn()
    const { getAllByRole } = render(
      <ProdukteEingabenPanel
        {...defaultProps({ onAssumptionsChange })}
      />,
    )
    const removeButtons = getAllByRole('button', { name: 'Entfernen' })
    // Click the first (etf) Entfernen.
    fireEvent.click(removeButtons[0]!)
    expect(onAssumptionsChange).toHaveBeenCalledOnce()
    // The setter was called with a functional updater. Apply it to the
    // current assumptions to inspect the result.
    const updater = onAssumptionsChange.mock.calls[0]![0] as (
      prev: ScenarioAssumptions,
    ) => ScenarioAssumptions
    const next = updater({
      ...defaultAssumptions,
      visibleProducts: ['etf', 'bav'],
    })
    expect(next.visibleProducts).toEqual(['bav'])
  })

  it('clicking "Bearbeiten" opens the inline disclosure for the row', () => {
    const { getAllByRole, queryByTestId } = render(
      <ProdukteEingabenPanel {...defaultProps()} />,
    )
    // No disclosure visible to start.
    expect(queryByTestId('produkte-edit-disclosure-etf')).toBeNull()
    const editButtons = getAllByRole('button', { name: 'Bearbeiten' })
    fireEvent.click(editButtons[0]!)
    expect(queryByTestId('produkte-edit-disclosure-etf')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § 3 — Sparformen quick-add tiles.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — § 3 quick-add tiles', () => {
  it('renders tiles for every product NOT in visibleProducts', () => {
    const { container } = render(<ProdukteEingabenPanel {...defaultProps()} />)
    // Defaults: etf + bav enabled → 4 tiles remain (versicherung, basisrente,
    // altersvorsorgedepot, riester). § 3 section is rendered because at
    // least one tile is present.
    const tiles = container.querySelectorAll('.d-sparform-option')
    expect(tiles.length).toBe(4)
  })

  it('clicking a § 3 tile adds the product to visibleProducts', () => {
    const onAssumptionsChange = vi.fn()
    const { container } = render(
      <ProdukteEingabenPanel
        {...defaultProps({ onAssumptionsChange })}
      />,
    )
    const tile = container.querySelector(
      'button.d-sparform-option',
    ) as HTMLButtonElement
    expect(tile).not.toBeNull()
    fireEvent.click(tile)
    expect(onAssumptionsChange).toHaveBeenCalledOnce()
    const updater = onAssumptionsChange.mock.calls[0]![0] as (
      prev: ScenarioAssumptions,
    ) => ScenarioAssumptions
    const next = updater({
      ...defaultAssumptions,
      visibleProducts: ['etf', 'bav'],
    })
    // The first quick-add tile in the canonical sort order (PRIMARY first)
    // is `versicherung` (since etf + bav are already enabled).
    expect(next.visibleProducts.length).toBe(3)
    expect(next.visibleProducts).toContain('versicherung')
  })

  it('does NOT render the § 3 section when every product is already enabled', () => {
    const allProducts: ScenarioAssumptions['visibleProducts'] = [
      'etf',
      'bav',
      'versicherung',
      'basisrente',
      'altersvorsorgedepot',
      'riester',
    ]
    const { queryByText } = render(
      <ProdukteEingabenPanel
        {...defaultProps({ visibleProducts: allProducts })}
      />,
    )
    expect(queryByText(/Sparformen, die du noch hinzufügen kannst/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Empty / edge cases.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — empty state', () => {
  it('shows an empty-state copy when visibleProducts is empty', () => {
    const { getByText } = render(
      <ProdukteEingabenPanel {...defaultProps({ visibleProducts: [] })} />,
    )
    expect(
      getByText(/Du hast aktuell keine Verträge ausgewählt/),
    ).toBeTruthy()
  })

  it('mounts the test-id root for the test harness', () => {
    const { getByTestId } = render(<ProdukteEingabenPanel {...defaultProps()} />)
    expect(getByTestId('produkte-eingaben-panel')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// CX-PR3-1 regression — PKV label on bAV row for PKV users.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — CX-PR3-1 PKV label regression', () => {
  it('renders "PKV" in the bAV KV-in-Rente field when publicHealthInsurance is false', () => {
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const assumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      visibleProducts: ['bav'],
    }
    const simulation = simulateRetirementComparison(pkvProfile, assumptions, de2026Rules)
    const selectedResults = simulation.products.filter(
      (r) => r.scenarioId === 'basis' && r.productId === 'bav',
    )
    const props = {
      mode: 'compare' as const,
      profile: pkvProfile,
      assumptions,
      onProfileChange: vi.fn(),
      onAssumptionsChange: vi.fn(),
      simulation,
      selectedResults,
      kvdrMember: true, // even when kvdrMember is true, PKV must take priority
      bavLumpSumTaxMode: 'voll_versorgungsbezug' as const,
      insuranceTaxMode: 'halbeinkuenfte' as const,
      tarifgebunden: false,
      onTarifgebundenChange: vi.fn(),
      onSyncMonthlyContribution: vi.fn(),
    }
    const { container } = render(<ProdukteEingabenPanel {...props} />)
    // The bAV row's "KV in Rente" field must display "PKV" for PKV users,
    // not "KVdR" or "freiwillig GKV".
    const text = container.textContent ?? ''
    expect(text).toContain('PKV')
    expect(text).not.toContain('KVdR')
    expect(text).not.toContain('freiwillig GKV')
  })

  it('renders "KVdR" for GKV users with kvdrMember=true', () => {
    const gkvProfile = { ...defaultProfile, publicHealthInsurance: true }
    const assumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      visibleProducts: ['bav'],
    }
    const simulation = simulateRetirementComparison(gkvProfile, assumptions, de2026Rules)
    const selectedResults = simulation.products.filter(
      (r) => r.scenarioId === 'basis' && r.productId === 'bav',
    )
    const props = {
      mode: 'compare' as const,
      profile: gkvProfile,
      assumptions,
      onProfileChange: vi.fn(),
      onAssumptionsChange: vi.fn(),
      simulation,
      selectedResults,
      kvdrMember: true,
      bavLumpSumTaxMode: 'voll_versorgungsbezug' as const,
      insuranceTaxMode: 'halbeinkuenfte' as const,
      tarifgebunden: false,
      onTarifgebundenChange: vi.fn(),
      onSyncMonthlyContribution: vi.fn(),
    }
    const { container } = render(<ProdukteEingabenPanel {...props} />)
    expect(container.textContent ?? '').toContain('KVdR')
  })

  it('renders "freiwillig GKV" for GKV users with kvdrMember=false', () => {
    const gkvProfile = { ...defaultProfile, publicHealthInsurance: true }
    // The bAV field builder reads assumptions.bav.kvdrMember directly, so we
    // must set it to false here (the kvdrMember prop only flows to the inputs
    // disclosure, not to the summary row).
    const assumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      visibleProducts: ['bav'],
      bav: { ...defaultAssumptions.bav, kvdrMember: false },
    }
    const simulation = simulateRetirementComparison(gkvProfile, assumptions, de2026Rules)
    const selectedResults = simulation.products.filter(
      (r) => r.scenarioId === 'basis' && r.productId === 'bav',
    )
    const props = {
      mode: 'compare' as const,
      profile: gkvProfile,
      assumptions,
      onProfileChange: vi.fn(),
      onAssumptionsChange: vi.fn(),
      simulation,
      selectedResults,
      kvdrMember: false,
      bavLumpSumTaxMode: 'voll_versorgungsbezug' as const,
      insuranceTaxMode: 'halbeinkuenfte' as const,
      tarifgebunden: false,
      onTarifgebundenChange: vi.fn(),
      onSyncMonthlyContribution: vi.fn(),
    }
    const { container } = render(<ProdukteEingabenPanel {...props} />)
    expect(container.textContent ?? '').toContain('freiwillig GKV')
  })
})
