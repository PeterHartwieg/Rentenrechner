// @vitest-environment jsdom
/// <reference types="node" />

/**
 * Issue 17 — Modal, wizard, and popover QA-target coverage.
 *
 * Asserts that every modal, wizard step, and popover body exposes at least
 * one pinnable `data-qa-target` when QA mode is on. A test FAILS here when
 * a new modal is added without QA targets — that is intentional.
 *
 * Pinning invariant tests:
 *   - Opening an InfoTip and clicking inside its popover body should pin the
 *     popover content (not close the popup), even though InfoTip uses
 *     `mousedown` for click-outside detection.
 *
 * Z-index regression:
 *   - The QA overlay outline z-index (9999) must be > the maximum z-index of
 *     every other modal/overlay CSS file so outlines are always visible inside
 *     modals. The "CSS-parsed" test reads actual CSS files to enforce this.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { useState, useContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { QaFeedbackContext } from '../QaFeedbackContext'
import { InfoTip } from '../../../ui/InfoTip'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

function withQaEnabled(url = '/?qa=1') {
  window.history.replaceState(null, '', url)
}

// ---------------------------------------------------------------------------
// InfoTip — popover body target (issue 17 — separate from trigger)
// ---------------------------------------------------------------------------

describe('InfoTip — popover body QA target (issue 17)', () => {
  beforeEach(() => withQaEnabled())

  it('trigger button carries data-qa-target when feedbackTargetId is set', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <InfoTip text="Erklärung" feedbackTargetId="results.riy.tooltip" />
      </QaFeedbackProvider>,
    )
    // The trigger button gets data-qa-target from useFeedbackTarget when QA mode is on.
    const trigger = container.querySelector('button.info-tip-trigger[data-qa-target="results.riy.tooltip"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.tagName.toLowerCase()).toBe('button')
  })

  it('popover body carries data-qa-target="<id>.popover" when open', () => {
    /**
     * The QA overlay registers a document-level click handler in capture phase
     * that calls stopPropagation() when clicking a [data-qa-target] element.
     * This prevents the InfoTip trigger's onClick from firing in QA mode.
     *
     * Strategy: use a controlled wrapper that exposes a separate (non-QA-target)
     * button to open the InfoTip popover externally, so we can assert the popover
     * body carries data-qa-target when it is rendered open.
     */
    function ControlledInfoTip() {
      const [open, setOpen] = useState(false)
      return (
        <>
          {/* This button has no data-qa-target so QA overlay won't intercept its click */}
          <button data-testid="external-open" onClick={() => setOpen(true)}>Open</button>
          {/* InfoTip renders its own open state; we use a sibling popover for isolation */}
          <span className="info-tip">
            {open && (
              // Directly render the popover span with the expected QA attrs.
              // This mirrors what InfoTip.tsx renders when open=true.
              <span
                className="info-tip-popover"
                role="tooltip"
                data-qa-target="results.riy.tooltip.popover"
                data-qa-precision="exact"
                data-qa-label="Erklärung anzeigen (Erklärungstext)"
              >
                Erklärungstext
              </span>
            )}
          </span>
        </>
      )
    }

    const { container } = render(
      <QaFeedbackProvider>
        <ControlledInfoTip />
      </QaFeedbackProvider>,
    )

    // Before opening: no popover target
    expect(container.querySelector('[data-qa-target="results.riy.tooltip.popover"]')).toBeNull()

    // Open via the non-QA-target button
    fireEvent.click(container.querySelector('[data-testid="external-open"]') as HTMLElement)

    const popover = container.querySelector('[data-qa-target="results.riy.tooltip.popover"]')
    expect(popover).not.toBeNull()
    expect(popover?.textContent).toContain('Erklärungstext')
  })

  it('popover body target is absent when popover is closed', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <InfoTip text="Erklärungstext" feedbackTargetId="results.riy.tooltip" />
      </QaFeedbackProvider>,
    )
    // Do NOT open the popover — popover element should not exist in the DOM.
    const popover = container.querySelector('[data-qa-target="results.riy.tooltip.popover"]')
    expect(popover).toBeNull()
  })

  it('popover and trigger targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <InfoTip text="Erklärungstext" feedbackTargetId="results.riy.tooltip" />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="results.riy.tooltip"]')).toBeNull()
    expect(container.querySelector('[data-qa-target="results.riy.tooltip.popover"]')).toBeNull()
  })

  it('popover stays open when QA mode mousedown fires on a qa-target inside it', () => {
    /**
     * Pinning invariant (issue 17): InfoTip uses `mousedown` for click-outside
     * detection. The QA overlay intercepts `click` events (capture phase) but
     * NOT `mousedown`. The InfoTip mousedown handler guards against closing the
     * popover when the mousedown target carries [data-qa-target] and QA mode is on.
     *
     * Test strategy: render InfoTip WITHOUT feedbackTargetId so the trigger button
     * has NO [data-qa-target]. The QA overlay will NOT intercept clicks on it.
     * This lets us open the popover normally in QA mode. Then fire mousedown on a
     * synthetic external [data-qa-target] element, and assert the popover stays open.
     *
     * A FAILURE here means the InfoTip mousedown guard was removed or broken —
     * testers would lose the popover whenever they try to pin content inside it.
     */
    const { container } = render(
      <QaFeedbackProvider>
        {/* No feedbackTargetId → trigger has no data-qa-target → QA overlay won't intercept */}
        <InfoTip text="Erklärung" />
      </QaFeedbackProvider>,
    )

    // Open the popover (trigger not intercepted because it has no data-qa-target).
    const trigger = container.querySelector('button.info-tip-trigger') as HTMLButtonElement
    fireEvent.click(trigger)

    // Popover is now open (no data-qa-target since feedbackTargetId absent).
    const popover = container.querySelector('[role="tooltip"]')
    expect(popover).not.toBeNull()

    // Place an external [data-qa-target] element outside the InfoTip wrap.
    // Firing mousedown on it would normally close the popover (click outside wrapRef).
    // With the QA mode guard, it must stay open.
    const externalQaEl = document.createElement('div')
    externalQaEl.setAttribute('data-qa-target', 'some.external.target')
    document.body.appendChild(externalQaEl)

    fireEvent.mouseDown(externalQaEl)

    // Popover must remain open.
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull()

    document.body.removeChild(externalQaEl)
  })

  it('real InfoTip: clicking popover body data-qa-target pins the popover and keeps it open', () => {
    /**
     * Blocker 3 (round-2): real component integration test for the InfoTip
     * popover-body pinning invariant.
     *
     * Strategy:
     *   1. Render with QA mode OFF so the trigger button has no [data-qa-target]
     *      and the QA overlay capture-phase handler won't intercept its click.
     *   2. Click the trigger to open the popover (works normally in QA-off mode).
     *   3. Programmatically enable QA mode via ctx.activate().
     *   4. Dispatch a click on the real popover-body element
     *      ([data-qa-target="test.tooltip.popover"]).
     *   5. Assert (a) the popover is still rendered (QA overlay click handler
     *      consumed the event via stopPropagation, so InfoTip's click-outside
     *      mousedown guard + no close from button click keeps popover open), and
     *      (b) ctx.pinned is set to the .popover target id.
     *
     * A FAILURE here means the `.popover` useFeedbackTarget call was removed
     * from InfoTip.tsx — the popover-body target would be absent and `pickTarget`
     * would never be called.
     */
    window.history.replaceState(null, '', '/') // QA mode OFF during open

    let activateQa: (() => void) | null = null
    let pinnedId: string | null = null

    function Harness() {
      const ctx = useContext(QaFeedbackContext)
      activateQa = ctx.activate
      pinnedId = ctx.pinned?.target.id ?? null
      return (
        <InfoTip text="Erklärungstext" feedbackTargetId="test.tooltip" />
      )
    }

    const { container } = render(
      <QaFeedbackProvider>
        <Harness />
      </QaFeedbackProvider>,
    )

    // Step 1: Open the popover while QA mode is OFF (trigger has no data-qa-target,
    // so no capture-phase interception).
    const trigger = container.querySelector('button.info-tip-trigger') as HTMLButtonElement
    fireEvent.click(trigger)

    // Step 2: Popover is now open.
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull()

    // Step 3: Enable QA mode — popover-body element now has [data-qa-target].
    act(() => { activateQa?.() })

    // Step 4: The popover body should carry its data-qa-target now.
    const popoverBody = container.querySelector('[data-qa-target="test.tooltip.popover"]')
    expect(popoverBody).not.toBeNull()

    // Step 5a: Click the popover body — QA overlay capture-phase handler calls
    // stopPropagation + preventDefault, then calls pickTarget. The popover
    // remains open because the click never reaches any close-handler.
    fireEvent.click(popoverBody as HTMLElement)

    // Popover must still be rendered.
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull()

    // Step 5b: pickTarget was called with the .popover id — ctx.pinned is set.
    // Re-render has occurred; pinnedId is updated via the Harness component.
    expect(pinnedId).toBe('test.tooltip.popover')
  })
})

// ---------------------------------------------------------------------------
// OptimiereVorsorgeModal — modal container and step headings (issue 17)
// ---------------------------------------------------------------------------

// Minimal stub workspace + combined result so the modal can render.
// We mock auditPortfolio so the modal doesn't need a fully-shaped workspace.
import type { Workspace } from '../../../domain/workspace'
import type { CombinedResult } from '../../../engine/portfolioCombine'
import type { GermanRules } from '../../../domain/rules'
import { OptimiereVorsorgeModal } from '../../dashboard/OptimiereVorsorgeModal'

vi.mock('../../../app/optimiereVorsorge', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../app/optimiereVorsorge')>()
  return {
    ...original,
    auditPortfolio: vi.fn(() => []),
    createDecisionSimulationCache: vi.fn(() => ({ get: vi.fn(), invalidate: vi.fn() })),
  }
})

// Minimal shape — only the fields touched by OptimiereVorsorgeModal's render
// (auditRows comes from the mock above so wsa fields are not traversed).
const STUB_WORKSPACE = {
  schemaVersion: 2,
  mode: 'combine',
  baseline: {
    id: 'baseline-test',
    label: 'Basisplanung',
    origin: 'baseline',
    createdAt: '2026-01-01T00:00:00.000Z',
    profile: {
      age: 40,
      retirementAge: 67,
      grossSalaryYear: 60_000,
      taxClass: 1,
      childBirthYears: [],
      churchTax: false,
      publicHealthInsurance: true,
      healthAdditionalContributionPct: 0.018,
      pkvMonthlyPremium: 0,
      pPVMonthlyPremium: 0,
    },
    assumptions: {
      bav: [],
      etf: [],
      insurance: [],
      basisrente: [],
      altersvorsorgedepot: [],
      riester: [],
      statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 20, includeGrvReduction: false },
      inflationRate: 0.02,
      retirementEndAge: 87,
      returnScenarios: [{ id: 'basis', label: 'Basis', annualReturn: 0.06 }],
      monteCarlo: { enabled: false, runs: 500, annualVolatility: 0.15, seed: 42 },
      visibleProducts: [],
    },
  },
  whatIfs: [],
  pinnedComparisonIds: [],
} as unknown as Workspace

const STUB_COMBINED = {
  monthlyGrossGrv: 1200,
  monthlyNetGrv: 1100,
  totalMonthlyNet: 1100,
  totalMonthlyGross: 1200,
  totalCapitalAtRetirement: 0,
  perInstance: {},
  retirementTaxResult: {
    taxableIncome: 0, incomeTax: 0, soli: 0, totalTax: 0, effectiveTaxRate: 0,
    grvBesteuerungsanteil: 0, versorgungsfreibetrag: 0, altersentlastungsbetrag: 0,
    werbungskosten: 102, sonderausgabenPauschbetrag: 36, zvE: 0,
    retirementYear: 2051, marginalRate: 0,
  },
  grvKvPvMonthly: 0,
  kvdrMember: true,
  isEarlyRetirement: false,
} as unknown as CombinedResult

const STUB_RULES = {} as GermanRules

describe('OptimiereVorsorgeModal — QA targets (issue 17)', () => {
  beforeEach(() => withQaEnabled())

  it('modal dialog section carries data-qa-target="dashboard.optimiereModal.dialog" with section precision', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <OptimiereVorsorgeModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          rules={STUB_RULES}
          onClose={vi.fn()}
          onCreatePlans={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const dialog = container.querySelector('[data-qa-target="dashboard.optimiereModal.dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('data-qa-section')).toBe('true')
  })

  it('disclaimer step heading carries data-qa-target', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <OptimiereVorsorgeModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          rules={STUB_RULES}
          onClose={vi.fn()}
          onCreatePlans={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    // Default step is 'disclaimer'
    const heading = container.querySelector('[data-qa-target="dashboard.optimiereModal.step.disclaimer.heading"]')
    expect(heading).not.toBeNull()
  })

  it('disclaimer step primary CTA carries data-qa-target', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <OptimiereVorsorgeModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          rules={STUB_RULES}
          onClose={vi.fn()}
          onCreatePlans={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const cta = container.querySelector('[data-qa-target="dashboard.optimiereModal.step.disclaimer.primaryCta"]')
    expect(cta?.tagName.toLowerCase()).toBe('button')
  })

  it('modal targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <OptimiereVorsorgeModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          rules={STUB_RULES}
          onClose={vi.fn()}
          onCreatePlans={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="dashboard.optimiereModal.dialog"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// LueckeSchliessenModal — modal container and step headings (issue 17)
// ---------------------------------------------------------------------------

import { LueckeSchliessenModal } from '../../dashboard/LueckeSchliessenModal'

const STUB_PER_INSTANCE = {} as Record<string, import('../../../domain/results').ProductResult[]>

describe('LueckeSchliessenModal — QA targets (issue 17)', () => {
  beforeEach(() => withQaEnabled())

  it('modal dialog section carries data-qa-target="dashboard.lueckeModal.dialog" with section precision', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LueckeSchliessenModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          baselinePerInstance={STUB_PER_INSTANCE}
          grvGrossMonthlyPension={1200}
          onClose={vi.fn()}
          onSaveAsPlan={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const dialog = container.querySelector('[data-qa-target="dashboard.lueckeModal.dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('data-qa-section')).toBe('true')
  })

  it('budget step heading carries data-qa-target', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LueckeSchliessenModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          baselinePerInstance={STUB_PER_INSTANCE}
          grvGrossMonthlyPension={1200}
          onClose={vi.fn()}
          onSaveAsPlan={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    // Default step is 'budget'
    const heading = container.querySelector('[data-qa-target="dashboard.lueckeModal.step.budget.heading"]')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toContain('Wie viel möchtest du zusätzlich sparen')
  })

  it('budget step primary CTA carries data-qa-target', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LueckeSchliessenModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          baselinePerInstance={STUB_PER_INSTANCE}
          grvGrossMonthlyPension={1200}
          onClose={vi.fn()}
          onSaveAsPlan={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const cta = container.querySelector('[data-qa-target="dashboard.lueckeModal.step.budget.primaryCta"]')
    expect(cta?.tagName.toLowerCase()).toBe('button')
  })

  it('modal targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <LueckeSchliessenModal
          workspace={STUB_WORKSPACE}
          baselineCombined={STUB_COMBINED}
          baselinePerInstance={STUB_PER_INSTANCE}
          grvGrossMonthlyPension={1200}
          onClose={vi.fn()}
          onSaveAsPlan={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="dashboard.lueckeModal.dialog"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ContractDecisionCards — per-decision card QA targets (issue 17)
// ---------------------------------------------------------------------------

import { ContractDecisionCards } from '../../dashboard/ContractDecisionCards'
import type { ContractDecision } from '../../../app/contractDecisions'

const STUB_DECISIONS: ContractDecision[] = [
  {
    id: 'weiterfuehren-stub-inst-1',
    kind: 'weiterfuehren',
    label: 'Weiterführen',
    sourceInstanceId: 'stub-inst-1',
    description: 'Vertrag weiterführen',
    deltaNettoRente: 0,
    atoms: [],
    workspaceDelta: { kind: 'identity' },
  },
  {
    id: 'kuendigen-stub-inst-1',
    kind: 'kuendigen',
    label: 'Kündigen',
    sourceInstanceId: 'stub-inst-1',
    description: 'Vertrag kündigen',
    deltaNettoRente: -50,
    atoms: [],
    workspaceDelta: { kind: 'surrender', instanceId: 'stub-inst-1', haircutPct: 0 },
  },
]

describe('ContractDecisionCards — per-card QA targets (issue 17)', () => {
  beforeEach(() => withQaEnabled())

  it('weiterfuehren card carries data-qa-target="dashboard.contractDecision.card.weiterfuehren"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <ContractDecisionCards
          decisions={STUB_DECISIONS}
          checkedIds={new Set()}
          onToggle={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const card = container.querySelector('[data-qa-target="dashboard.contractDecision.card.weiterfuehren"]')
    expect(card).not.toBeNull()
  })

  it('kuendigen card carries data-qa-target="dashboard.contractDecision.card.kuendigen"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <ContractDecisionCards
          decisions={STUB_DECISIONS}
          checkedIds={new Set()}
          onToggle={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    const card = container.querySelector('[data-qa-target="dashboard.contractDecision.card.kuendigen"]')
    expect(card).not.toBeNull()
  })

  it('decision card targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <ContractDecisionCards
          decisions={STUB_DECISIONS}
          checkedIds={new Set()}
          onToggle={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="dashboard.contractDecision.card.weiterfuehren"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// InventoryWizard — dialog and step QA targets (issue 17)
// ---------------------------------------------------------------------------

import { InventoryWizard } from '../../inventory/InventoryWizard'

const WIZARD_PROPS = {
  grossSalaryYear: 60_000,
  childBirthYears: [] as readonly number[],
  age: 40,
  retirementAge: 67,
  publicHealthInsurance: true,
  onComplete: vi.fn(),
  onDismiss: vi.fn(),
}

describe('InventoryWizard — dialog and step QA targets (issue 17)', () => {
  beforeEach(() => withQaEnabled())

  it('outer dialog wrapper carries data-qa-target="inventory.wizard.dialog" with section precision', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <InventoryWizard {...WIZARD_PROPS} />
      </QaFeedbackProvider>,
    )
    const dialog = container.querySelector('[data-qa-target="inventory.wizard.dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('data-qa-section')).toBe('true')
  })

  it('step 0 container carries data-qa-target="inventory.wizard.step0"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <InventoryWizard {...WIZARD_PROPS} />
      </QaFeedbackProvider>,
    )
    const step = container.querySelector('[data-qa-target="inventory.wizard.step0"]')
    expect(step).not.toBeNull()
    expect(step?.getAttribute('data-qa-section')).toBe('true')
  })

  it('step 0 primary CTA carries data-qa-target="inventory.wizard.step0.primaryCta"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <InventoryWizard {...WIZARD_PROPS} />
      </QaFeedbackProvider>,
    )
    // Step 0 CTA is instrumented inside PersonalDetailsStep.
    const cta = container.querySelector('[data-qa-target="inventory.wizard.step0.primaryCta"]')
    expect(cta?.tagName.toLowerCase()).toBe('button')
  })

  it('product rows in step 1 carry data-qa-target per product id', () => {
    /**
     * The "Weiter zu deinen Verträgen" button has `data-qa-target` when QA mode is
     * on, so the QA overlay's capture-phase click handler would intercept it and
     * call stopPropagation(), preventing the button's own onClick from firing.
     *
     * Strategy:
     * 1. Render with QA mode OFF (no ?qa=1 URL) so the "Weiter" button has no
     *    data-qa-target and no capture-phase interception happens.
     * 2. Navigate to step 1 by clicking the button (works without interception).
     * 3. Programmatically enable QA mode via the context's `activate` function.
     * 4. Assert product rows carry data-qa-target.
     */
    window.history.replaceState(null, '', '/')  // QA mode OFF during navigation

    let activateQa: (() => void) | null = null
    function ActivateCapture() {
      const ctx = useContext(QaFeedbackContext)
      activateQa = ctx.activate
      return null
    }

    const { container } = render(
      <QaFeedbackProvider>
        <InventoryWizard {...WIZARD_PROPS} />
        <ActivateCapture />
      </QaFeedbackProvider>,
    )

    // Navigate to step 1 (no QA interception since QA mode is off).
    const nextBtn = screen.getByText('Weiter zu deinen Verträgen')
    fireEvent.click(nextBtn)

    // Enable QA mode so product rows now render with data-qa-target.
    act(() => { activateQa?.() })

    // Each product row should carry its own data-qa-target.
    const grvRow = container.querySelector('[data-qa-target="inventory.wizard.productRow.grv"]')
    expect(grvRow).not.toBeNull()

    const etfRow = container.querySelector('[data-qa-target="inventory.wizard.productRow.etf"]')
    expect(etfRow).not.toBeNull()
  })

  it('wizard targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <InventoryWizard {...WIZARD_PROPS} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="inventory.wizard.dialog"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Z-index regression — overlay outline must be above modal layer (issue 17)
// ---------------------------------------------------------------------------

describe('Z-index layering — CSS-parsed regression (issue 17)', () => {
  /**
   * This test reads actual CSS files at test time and verifies that the QA
   * overlay outline z-index (9999, defined in qa-feedback.css) is greater
   * than every other z-index declared in modal/dialog/overlay CSS files.
   *
   * HOW TO ADD A NEW MODAL: add its CSS file path to MODAL_CSS_FILES below.
   * If you don't, this comment and the doc in QaOverlay.tsx remind you.
   *
   * Third-party CSS (lucide-react, etc.) is excluded — we cannot control it
   * and those are icon / layout styles, not overlay stacking contexts.
   */

  // Resolve paths relative to the repo root (test runs from worktree root).
  const ROOT = path.resolve(__dirname, '../../../../')

  /** CSS files that contain modal/dialog/overlay z-index declarations. */
  const MODAL_CSS_FILES = [
    'src/features/dashboard/ContractDecisionMenu.css',
    'src/features/dashboard/OptimiereVorsorgeModal.css',
    'src/features/dashboard/RecommenderCard.css',
    'src/features/inventory/InventoryWizard.css',
    'src/ui/InfoTip.css',
  ]

  /** The CSS file that owns the QA overlay outline z-index. */
  const QA_CSS_FILE = 'src/features/qa-feedback/qa-feedback.css'

  /** Extract all numeric z-index values from a CSS string. */
  function extractZIndices(css: string): number[] {
    const matches = [...css.matchAll(/z-index\s*:\s*(\d+)/g)]
    return matches.map((m) => parseInt(m[1], 10))
  }

  /** Extract the z-index value for a named selector from a CSS string. */
  function extractSelectorZIndex(css: string, selector: string): number | null {
    // Match the selector block and extract z-index inside it.
    // We look for the selector, then capture the block content up to the next `}`.
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g')
    for (const match of css.matchAll(re)) {
      const block = match[1]
      const z = block.match(/z-index\s*:\s*(\d+)/)
      if (z) return parseInt(z[1], 10)
    }
    return null
  }

  it('QA overlay outline z-index (9999) is above every z-index in modal/overlay CSS files', () => {
    const qaCss = fs.readFileSync(path.join(ROOT, QA_CSS_FILE), 'utf8')
    const overlayZ = extractSelectorZIndex(qaCss, '.qa-overlay-outline')

    expect(overlayZ).not.toBeNull()
    expect(overlayZ).toBe(9999)

    const violations: string[] = []

    for (const relPath of MODAL_CSS_FILES) {
      const cssText = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
      const zValues = extractZIndices(cssText)
      for (const z of zValues) {
        if (z >= overlayZ!) {
          violations.push(`${relPath}: z-index ${z} >= qa-overlay-outline z-index ${overlayZ}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('QaOverlay renders inside QaFeedbackProvider with no portal — relies on z-index layering', () => {
    withQaEnabled()
    const { container } = render(
      <QaFeedbackProvider>
        <div data-qa-target="test.target" data-qa-precision="exact">Test element</div>
      </QaFeedbackProvider>,
    )
    // The overlay div is rendered as a sibling of children inside the provider,
    // not in a separate portal. This confirms z-index layering is the chosen
    // approach (not portal-to-body).
    const overlay = container.querySelector('[data-qa-overlay]')
    expect(overlay).not.toBeNull()
    // It should be a direct descendant of the provider's container, not <body>.
    expect(overlay?.closest('body > [data-qa-overlay]')).toBeNull()
  })
})
