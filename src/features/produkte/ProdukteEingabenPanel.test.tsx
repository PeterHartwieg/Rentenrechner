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
import type { Scenario, Workspace } from '../../domain/workspace'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { simulateRetirementComparison } from '../../engine/simulate'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { INVENTORY_PRODUCT_REGISTRY } from '../inventory/inventoryProductRegistry'
import { defaultWorkspace } from '../../storage'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { ProdukteEingabenPanel, type ProdukteEingabenPanelProps } from './ProdukteEingabenPanel'

afterEach(() => cleanup())

function makeSimulation(assumptions: ScenarioAssumptions = defaultAssumptions) {
  return simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
}

interface DefaultPropsOverrides {
  visibleProducts?: ScenarioAssumptions['visibleProducts']
  onAssumptionsChange?: Dispatch<SetStateAction<ScenarioAssumptions>>
}

function defaultProps(
  overrides: DefaultPropsOverrides = {},
): ProdukteEingabenPanelProps {
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

// ---------------------------------------------------------------------------
// PR 4 — combine-mode body. The panel now accepts a discriminated union over
// `mode`; the combine branch reads workspace `baseline.assumptions` per-
// instance arrays and routes Bearbeiten / Entfernen / Weitere Optionen
// affordances back to the page-level mutators.
// ---------------------------------------------------------------------------

/**
 * CR-PR4-R1-3: derive the canonical first multi-instance product id and the
 * total tile count from PRODUCT_REGISTRY instead of hardcoding `'etf'` / `6`.
 * Adding or reordering a product in the registry then automatically flows
 * through to these assertions.
 */
const REGISTRY_MULTI_INSTANCE_IDS = PRODUCT_REGISTRY
  .map((e) => e.metadata.id)
  .filter(
    (id): id is keyof typeof INVENTORY_PRODUCT_REGISTRY =>
      id in INVENTORY_PRODUCT_REGISTRY,
  )
const FIRST_COMBINE_PRODUCT_ID = REGISTRY_MULTI_INSTANCE_IDS[0]!
const COMBINE_TILE_COUNT = REGISTRY_MULTI_INSTANCE_IDS.length

/**
 * Look up the per-instance array for a multi-instance product id on a
 * workspace assumptions block. `versicherung` maps to the `insurance` key
 * (engine convention); all other ids map 1:1. Mirrors the same private
 * helper in `ProdukteEingabenPanel.tsx`.
 */
function instancesForProduct(
  assumptions: Workspace['baseline']['assumptions'],
  productId: keyof typeof INVENTORY_PRODUCT_REGISTRY,
) {
  switch (productId) {
    case 'bav':
      return assumptions.bav
    case 'etf':
      return assumptions.etf
    case 'versicherung':
      return assumptions.insurance
    case 'basisrente':
      return assumptions.basisrente
    case 'altersvorsorgedepot':
      return assumptions.altersvorsorgedepot
    case 'riester':
      return assumptions.riester
  }
}

function buildCombineWorkspaceWithInstances(): Workspace {
  let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  ws = { ...ws, mode: 'combine' }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, FIRST_COMBINE_PRODUCT_ID)
  return ws
}

function makeCombineProps(
  overrides: Partial<Extract<ProdukteEingabenPanelProps, { mode: 'combine' }>> = {},
): Extract<ProdukteEingabenPanelProps, { mode: 'combine' }> {
  const ws = overrides.baseline?.assumptions
    ? ({
        ...defaultWorkspace,
        mode: 'combine',
        baseline: { ...defaultWorkspace.baseline, assumptions: overrides.baseline.assumptions },
      } as Workspace)
    : buildCombineWorkspaceWithInstances()
  const baseline: Scenario = overrides.baseline ?? ws.baseline
  return {
    mode: 'combine' as const,
    baseline,
    assumptions: overrides.assumptions ?? baseline.assumptions,
    addInstance: overrides.addInstance ?? vi.fn(),
    removeInstance: overrides.removeInstance ?? vi.fn(),
    onEditInstance: overrides.onEditInstance ?? vi.fn(),
    onOpenDecisionMenu: overrides.onOpenDecisionMenu ?? vi.fn(),
    onPatchBaseline: overrides.onPatchBaseline,
    statutoryPensionResult: overrides.statutoryPensionResult,
  }
}

describe('ProdukteEingabenPanel — § 2 combine-mode contract rows', () => {
  it('renders one row per workspace instance across all multi-instance products', () => {
    const ws = buildCombineWorkspaceWithInstances()
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps({ baseline: ws.baseline, assumptions: ws.baseline.assumptions })} />,
    )
    const rowGroups = container.querySelectorAll(
      '.produkte-eingaben-panel__row-group',
    )
    // 2 bAV + 1 ETF = 3 rows
    expect(rowGroups.length).toBe(3)
  })

  it('tags the panel root with data-mode="combine"', () => {
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps()} />,
    )
    const panel = container.querySelector('[data-testid="produkte-eingaben-panel"]')
    expect(panel).not.toBeNull()
    expect(panel!.getAttribute('data-mode')).toBe('combine')
  })

  it('clicking "Bearbeiten" opens the inline instance editor disclosure', () => {
    // CX-PR4-2 R1: "Bearbeiten" no longer navigates — it toggles an inline
    // disclosure that mounts PRODUCT_UI_REGISTRY[productId].renderInstanceInputs.
    // Editing inside the disclosure dispatches via onPatchBaseline; navigation
    // is now a separate "Details ansehen ›" affordance (covered in its own
    // test below).
    const onEditInstance = vi.fn()
    const ws = buildCombineWorkspaceWithInstances()
    const firstInstanceId =
      instancesForProduct(ws.baseline.assumptions, FIRST_COMBINE_PRODUCT_ID)[0]!.instanceId
    const { getAllByRole, queryByTestId } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
          onEditInstance,
        })}
      />,
    )
    expect(
      queryByTestId(`produkte-instance-disclosure-${firstInstanceId}`),
    ).toBeNull()
    const editButtons = getAllByRole('button', { name: 'Bearbeiten' })
    fireEvent.click(editButtons[0]!)
    // Disclosure mounts.
    expect(
      queryByTestId(`produkte-instance-disclosure-${firstInstanceId}`),
    ).not.toBeNull()
    // Navigation does NOT fire on Bearbeiten.
    expect(onEditInstance).not.toHaveBeenCalled()
  })

  it('clicking "Details ansehen ›" calls onEditInstance(productId, instanceId)', () => {
    // CX-PR4-2 R1: the read-only /vertrag/:id detail page is still reachable
    // from the row via the new "Details ansehen ›" secondary affordance.
    const onEditInstance = vi.fn()
    const ws = buildCombineWorkspaceWithInstances()
    const firstInstanceId =
      instancesForProduct(ws.baseline.assumptions, FIRST_COMBINE_PRODUCT_ID)[0]!.instanceId
    const { getAllByRole } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
          onEditInstance,
        })}
      />,
    )
    const detailButtons = getAllByRole('button', { name: /Details ansehen/ })
    fireEvent.click(detailButtons[0]!)
    expect(onEditInstance).toHaveBeenCalledOnce()
    expect(onEditInstance).toHaveBeenCalledWith(
      FIRST_COMBINE_PRODUCT_ID,
      firstInstanceId,
    )
  })

  it('toggling "Bearbeiten" twice unmounts the inline disclosure', () => {
    const ws = buildCombineWorkspaceWithInstances()
    const firstInstanceId =
      instancesForProduct(ws.baseline.assumptions, FIRST_COMBINE_PRODUCT_ID)[0]!.instanceId
    const { getAllByRole, queryByTestId } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
        })}
      />,
    )
    const editButtons = getAllByRole('button', { name: 'Bearbeiten' })
    fireEvent.click(editButtons[0]!)
    expect(
      queryByTestId(`produkte-instance-disclosure-${firstInstanceId}`),
    ).not.toBeNull()
    // The button label flips to "Schließen" when the disclosure is open;
    // clicking it again collapses the disclosure.
    const closeButtons = getAllByRole('button', { name: 'Schließen' })
    fireEvent.click(closeButtons[0]!)
    expect(
      queryByTestId(`produkte-instance-disclosure-${firstInstanceId}`),
    ).toBeNull()
  })

  it('editing a field inside the disclosure calls onPatchBaseline with the patched instance', () => {
    // CX-PR4-2 R1: smoke-test that the inline editor wires the patch callback
    // back through `onPatchBaseline`. We seed a single bAV instance and bump
    // its monthlyGrossConversion via the editor — the panel must dispatch a
    // workspace patch that contains the updated value on the right instance.
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = { ...seed, mode: 'combine' }
    seed = addInstanceToWorkspace(seed, 'bav')
    const onPatchBaseline = vi.fn()
    const bavInstanceId = seed.baseline.assumptions.bav[0]!.instanceId
    const { getAllByRole, getByTestId } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: seed.baseline,
          assumptions: seed.baseline.assumptions,
          onPatchBaseline,
        })}
      />,
    )
    // Open the bAV editor.
    fireEvent.click(getAllByRole('button', { name: 'Bearbeiten' })[0]!)
    // Find the disclosure host and the monthlyGrossConversion <input> inside
    // it. The editor uses a labelled `Brutto-Umwandlung` field for bAV.
    const disclosure = getByTestId(
      `produkte-instance-disclosure-${bavInstanceId}`,
    )
    // The numeric fields now render through `<NumberField>`, which wraps its
    // <input> inside the <label> (no htmlFor association). Locate the
    // bAV-specific Brutto-Umwandlung field by label text, then read the nested
    // input directly. Assert the label was found rather than silently falling
    // back to the wrong input (CR-PR4-R3).
    let target: HTMLInputElement | undefined
    const labels = disclosure.querySelectorAll('label')
    labels.forEach((labelEl) => {
      if (labelEl.textContent?.includes('Brutto-Umwandlung')) {
        const el = labelEl.querySelector(
          'input[type="number"]',
        ) as HTMLInputElement | null
        if (el) target = el
      }
    })
    expect(target).toBeDefined()
    const input = target as HTMLInputElement
    fireEvent.change(input, { target: { value: '321' } })
    fireEvent.blur(input)
    expect(onPatchBaseline).toHaveBeenCalled()
    // The first call argument is a partial Scenario; we check that
    // `assumptions.bav` carries the patched instance id and value.
    const lastCall =
      onPatchBaseline.mock.calls[onPatchBaseline.mock.calls.length - 1]!
    const patch = lastCall[0] as {
      assumptions?: { bav?: Array<{ instanceId: string; monthlyGrossConversion: number }> }
    }
    expect(patch.assumptions?.bav).toBeDefined()
    const patched = patch.assumptions!.bav!.find(
      (i) => i.instanceId === bavInstanceId,
    )
    expect(patched).toBeDefined()
    expect(patched!.monthlyGrossConversion).toBe(321)
  })

  it('clicking "Entfernen" calls removeInstance(productId, instanceId)', () => {
    const removeInstance = vi.fn()
    const ws = buildCombineWorkspaceWithInstances()
    // Sort order matches PRODUCT_REGISTRY; first row's product id comes from
    // the derived REGISTRY_MULTI_INSTANCE_IDS[0].
    const firstInstanceId =
      instancesForProduct(ws.baseline.assumptions, FIRST_COMBINE_PRODUCT_ID)[0]!.instanceId
    const { getAllByRole } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
          removeInstance,
        })}
      />,
    )
    const removeButtons = getAllByRole('button', { name: 'Entfernen' })
    fireEvent.click(removeButtons[0]!)
    expect(removeInstance).toHaveBeenCalledOnce()
    expect(removeInstance).toHaveBeenCalledWith(
      FIRST_COMBINE_PRODUCT_ID,
      firstInstanceId,
    )
  })

  it('clicking "Weitere Optionen" calls onOpenDecisionMenu(instanceId)', () => {
    const onOpenDecisionMenu = vi.fn()
    const ws = buildCombineWorkspaceWithInstances()
    const firstBavInstanceId = ws.baseline.assumptions.bav[0]!.instanceId
    const { getByTestId } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
          onOpenDecisionMenu,
        })}
      />,
    )
    const menuBtn = getByTestId(`produkte-menu-btn-${firstBavInstanceId}`)
    fireEvent.click(menuBtn)
    expect(onOpenDecisionMenu).toHaveBeenCalledOnce()
    expect(onOpenDecisionMenu).toHaveBeenCalledWith(firstBavInstanceId)
  })

  it('renders status badge "aktiv" for active instances', () => {
    const ws = buildCombineWorkspaceWithInstances()
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps({ baseline: ws.baseline, assumptions: ws.baseline.assumptions })} />,
    )
    const statusBadges = container.querySelectorAll('.d-produkt-row__status')
    // First badge is DRV "übernommen"; subsequent badges are per-instance "aktiv".
    const allLabels = Array.from(statusBadges).map((b) => b.textContent ?? '')
    expect(allLabels.filter((s) => s === 'aktiv').length).toBeGreaterThanOrEqual(3)
  })
})

describe('ProdukteEingabenPanel — § 3 combine-mode quick-add tiles', () => {
  it('renders every multi-instance product as a tile (combine allows N instances per product)', () => {
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps()} />,
    )
    const tiles = container.querySelectorAll('.d-sparform-option')
    // CR-PR4-R1-3: derive the expected tile count from the registry so adding
    // or removing a multi-instance product flows through automatically.
    expect(tiles.length).toBe(COMBINE_TILE_COUNT)
  })

  it('clicking a § 3 tile calls addInstance(productId) with the correct id', () => {
    const addInstance = vi.fn()
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps({ addInstance })} />,
    )
    // The first tile id matches the first entry of REGISTRY_MULTI_INSTANCE_IDS.
    const firstTile = container.querySelector(
      'button.d-sparform-option',
    ) as HTMLButtonElement
    expect(firstTile).not.toBeNull()
    fireEvent.click(firstTile)
    expect(addInstance).toHaveBeenCalledOnce()
    expect(addInstance).toHaveBeenCalledWith(FIRST_COMBINE_PRODUCT_ID)
  })

  it('mounts the DAddVertragButton CTA in combine-mode (compare-mode omits it)', () => {
    const addInstance = vi.fn()
    const { container } = render(
      <ProdukteEingabenPanel {...makeCombineProps({ addInstance })} />,
    )
    const cta = container.querySelector('.d-add-vertrag-button') as HTMLButtonElement | null
    expect(cta).not.toBeNull()
    fireEvent.click(cta!)
    // CTA seeds the registry-canonical first multi-instance product id.
    expect(addInstance).toHaveBeenCalledOnce()
    expect(addInstance).toHaveBeenCalledWith(FIRST_COMBINE_PRODUCT_ID)
  })
})

describe('ProdukteEingabenPanel — § 1 combine-mode DRV card', () => {
  it('renders inputs-only when no statutoryPensionResult is provided', () => {
    const { getByText, container } = render(
      <ProdukteEingabenPanel {...makeCombineProps()} />,
    )
    expect(getByText('§ 1 · Gesetzliche Rente')).toBeTruthy()
    expect(
      getByText('Rentenauskunft der Deutschen Rentenversicherung'),
    ).toBeTruthy()
    // Without a simulation result the projected EP / gross monthly cells show
    // an em-dash placeholder.
    const fieldValues = Array.from(
      container.querySelectorAll('.d-produkt-row__field-val'),
    ).map((el) => el.textContent ?? '')
    // At least the gross monthly is rendered as "—" when statutoryPensionResult is absent.
    expect(fieldValues).toContain('—')
  })

  it('renders projected EP and gross monthly when statutoryPensionResult is provided', () => {
    const statutoryPensionResult = {
      projectedEntgeltpunkte: 50.25,
      grossMonthlyPension: 2100,
    } as unknown as Parameters<typeof ProdukteEingabenPanel>[0] extends infer P
      ? P extends { mode: 'combine'; statutoryPensionResult?: infer R }
        ? R
        : never
      : never
    const { container } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({ statutoryPensionResult })}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('50,25')
    expect(text).toContain('2.100')
  })
})

describe('ProdukteEingabenPanel — combine-mode empty state', () => {
  it('shows an empty-state copy when the workspace has zero instances', () => {
    const ws: Workspace = {
      ...defaultWorkspace,
      mode: 'combine',
    }
    const { container } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
        })}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Du hast noch keinen Vertrag erfasst')
  })
})

// ---------------------------------------------------------------------------
// CX-PR4-1 regression — § 2 row order is registry-derived, not hardcoded.
// The derived constant ALL_MULTI_INSTANCE_PRODUCT_IDS must equal
// PRODUCT_REGISTRY.map(e => id).filter(id in INVENTORY_PRODUCT_REGISTRY),
// meaning: add/reorder a product in PRODUCT_REGISTRY → order updates here
// automatically. This test catches any drift.
// ---------------------------------------------------------------------------

describe('ProdukteEingabenPanel — CX-PR4-1 registry-derived order (R0)', () => {
  it('§ 2 rows render in PRODUCT_REGISTRY order even when instances are seeded in reverse registry order', () => {
    // Derive the canonical multi-instance order from the registry (mirrors the
    // fix in ALL_MULTI_INSTANCE_PRODUCT_IDS).
    const registryOrder = PRODUCT_REGISTRY
      .map((e) => e.metadata.id)
      .filter((id): id is keyof typeof INVENTORY_PRODUCT_REGISTRY => id in INVENTORY_PRODUCT_REGISTRY)

    // Seed instances in reverse registry order: riester → avd → basisrente →
    // versicherung → bav → etf. The panel must render them in forward order.
    let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    ws = { ...ws, mode: 'combine' }
    const reversed = [...registryOrder].reverse()
    for (const productId of reversed) {
      ws = addInstanceToWorkspace(ws, productId)
    }

    const { container } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
        })}
      />,
    )

    // Collect rendered row data-product-id attributes in DOM order.
    const rowGroups = Array.from(
      container.querySelectorAll<HTMLElement>(
        '.produkte-eingaben-panel__row-group[data-product-id]',
      ),
    )
    const renderedOrder = rowGroups.map((el) => el.getAttribute('data-product-id'))

    // Each product should appear once (one instance seeded per product).
    expect(renderedOrder).toEqual(registryOrder)
  })

  it('§ 3 tiles cover exactly the set of multi-instance product ids from PRODUCT_REGISTRY', () => {
    // With an empty workspace every product tile is present.
    const ws: Workspace = { ...defaultWorkspace, mode: 'combine' }
    const registryOrder = PRODUCT_REGISTRY
      .map((e) => e.metadata.id)
      .filter((id): id is keyof typeof INVENTORY_PRODUCT_REGISTRY => id in INVENTORY_PRODUCT_REGISTRY)

    const { container } = render(
      <ProdukteEingabenPanel
        {...makeCombineProps({
          baseline: ws.baseline,
          assumptions: ws.baseline.assumptions,
        })}
      />,
    )

    const tiles = container.querySelectorAll('.d-sparform-option')
    // The tile count must equal the registry-derived multi-instance product count.
    expect(tiles.length).toBe(registryOrder.length)
  })
})
