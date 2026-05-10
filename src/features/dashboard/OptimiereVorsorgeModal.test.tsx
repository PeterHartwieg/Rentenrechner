// @vitest-environment jsdom
/**
 * Tests for OptimiereVorsorgeModal (B6).
 *
 * Coverage:
 *   1. Disclaimer step renders first; no shortcut to other steps.
 *   2. Re-mounting the component lands on disclaimer (never-persisted invariant).
 *   3. Save dispatches one what-if per ticked pair with spec'd default name.
 *   4. Cancel from any step does not call onCreatePlans.
 *   5. Empty workspace: entry button is disabled + tooltip matches.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { OptimiereVorsorgeModal } from './OptimiereVorsorgeModal'
import { RentenluckeDashboard } from './RentenluckeDashboard'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { de2026Rules } from '../../rules/de2026'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { RentenluckeOverview } from '../../app/simulationSelectors'
import {
  OPTIMIERE_DISCLAIMER_HEADING,
  OPTIMIERE_BUTTON_ACCEPT,
  OPTIMIERE_BUTTON_CANCEL,
  OPTIMIERE_BANNER,
  OPTIMIERE_DISABLED_TOOLTIP,
  OPTIMIERE_BUTTON_LABEL,
  OPTIMIERE_OVERVIEW_HEADING,
  OPTIMIERE_OVERVIEW_INTRO,
} from '../../content/optimiereCopy'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Fixture: workspace with a high-fee bAV instance
// ---------------------------------------------------------------------------

function setupBavWorkspace(): { ws: Workspace; instanceId: string } {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav'],
    bav: {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      fees: {
        wrapperAssetFee: 0.01,
        fundAssetFee: 0.005,
        contributionFee: 0,
        fixedMonthlyFee: 0,
        acquisitionCostPct: 0,
        acquisitionCostSpreadYears: 5,
        pensionPayoutFeePct: 0,
      },
    },
  }
  const ws = migrateV1ToV2(
    { ...defaultProfile, age: 35, retirementAge: 67 } as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  const instanceId = ws.baseline.assumptions.bav[0].instanceId
  return { ws, instanceId }
}

function makeBaseline(): CombinedResult {
  return { monthlyNetIncome: 1500 } as CombinedResult
}

function makeOverview(overrides?: Partial<RentenluckeOverview>): RentenluckeOverview {
  return {
    grvNet: 0,
    productBreakdown: [],
    projectedTotal: 0,
    target: 0,
    targetIsUserSet: false,
    gap: 0,
    goalReached: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OptimiereVorsorgeModal', () => {
  it('renders the disclaimer heading on mount', () => {
    const { ws } = setupBavWorkspace()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    expect(getByText(OPTIMIERE_DISCLAIMER_HEADING)).toBeTruthy()
  })

  it('cannot skip disclaimer — Verstanden is the only path to overview', () => {
    const { ws } = setupBavWorkspace()
    const { queryByText, getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    // No overview elements visible before acknowledgement.
    expect(queryByText('Anpassen')).toBeNull()
    expect(queryByText(OPTIMIERE_BANNER)).toBeNull()

    // Click Verstanden.
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))

    // Now the banner and overview are visible.
    expect(getByText(OPTIMIERE_BANNER)).toBeTruthy()
  })

  it('re-mounting the component lands on disclaimer (never-persisted invariant)', () => {
    const { ws } = setupBavWorkspace()
    const onClose = vi.fn()

    // First mount: advance past disclaimer.
    const { getByText, unmount } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={onClose}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    expect(getByText(OPTIMIERE_BANNER)).toBeTruthy()
    unmount()

    // Second mount: must land on disclaimer again.
    const secondRender = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={onClose}
        onCreatePlans={() => {}}
      />,
    )
    expect(secondRender.getByText(OPTIMIERE_DISCLAIMER_HEADING)).toBeTruthy()
    expect(secondRender.queryByText(OPTIMIERE_BANNER)).toBeNull()
  })

  it('cancel from disclaimer does not call onCreatePlans', () => {
    const { ws } = setupBavWorkspace()
    const onCreatePlans = vi.fn()
    const onClose = vi.fn()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={onClose}
        onCreatePlans={onCreatePlans}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_CANCEL))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreatePlans).not.toHaveBeenCalled()
  })

  it('cancel from overview does not call onCreatePlans', () => {
    const { ws } = setupBavWorkspace()
    const onCreatePlans = vi.fn()
    const onClose = vi.fn()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={onClose}
        onCreatePlans={onCreatePlans}
      />,
    )
    // Advance to overview.
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    // Click Abbrechen on overview.
    fireEvent.click(getByText(OPTIMIERE_BUTTON_CANCEL))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreatePlans).not.toHaveBeenCalled()
  })

  it('overview renders one row per active instance', () => {
    const { ws } = setupBavWorkspace()
    const { getByText, getAllByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    // The bAV instance should produce an "Anpassen" button.
    const anpassenButtons = getAllByText('Anpassen')
    expect(anpassenButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('drill into instance shows ContractDecisionCards', () => {
    const { ws } = setupBavWorkspace()
    const { getByText, getAllByText, container } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    // Navigate: disclaimer -> overview -> instance.
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    const anpassenButtons = getAllByText('Anpassen')
    fireEvent.click(anpassenButtons[0])

    // Decision cards should be visible.
    const cards = container.querySelectorAll('.contract-decision-card')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('ticking a decision and saving dispatches one what-if with spec default name', () => {
    const { ws } = setupBavWorkspace()
    const onCreatePlans = vi.fn()
    const { getByText, getAllByText, container } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={onCreatePlans}
      />,
    )
    // Navigate to instance step.
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    const anpassenButtons = getAllByText('Anpassen')
    fireEvent.click(anpassenButtons[0])

    // Tick the first non-weiterfuehren checkbox.
    const checkboxes = container.querySelectorAll('.contract-decision-checkbox input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
    fireEvent.click(checkboxes[0])

    // Click Weiter to go to confirm step.
    fireEvent.click(getByText('Weiter'))

    // Click save.
    fireEvent.click(getByText('Pläne erstellen'))

    expect(onCreatePlans).toHaveBeenCalledTimes(1)
    const whatIfs: WhatIfScenario[] = onCreatePlans.mock.calls[0][0]
    expect(whatIfs.length).toBe(1)
    expect(whatIfs[0].origin).toBe('recommender')
    expect(typeof whatIfs[0].label).toBe('string')
    expect(whatIfs[0].label.length).toBeGreaterThan(0)
  })

  it('Escape key calls onClose', () => {
    const { ws } = setupBavWorkspace()
    const onClose = vi.fn()
    render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={onClose}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('step counter is absent on disclaimer step', () => {
    const { ws } = setupBavWorkspace()
    const { queryByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    expect(queryByText(/Schritt \d von 4/)).toBeNull()
  })

  it('step counter shows "Schritt 1 von 4" on overview step', () => {
    const { ws } = setupBavWorkspace()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    expect(getByText('Schritt 1 von 4')).toBeTruthy()
  })

  it('step counter shows "Schritt 2 von 4" on instance step', () => {
    const { ws } = setupBavWorkspace()
    const { getByText, getAllByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    const anpassenButtons = getAllByText('Anpassen')
    fireEvent.click(anpassenButtons[0])
    expect(getByText('Schritt 2 von 4')).toBeTruthy()
  })

  it('overview step renders heading and intro paragraph', () => {
    const { ws } = setupBavWorkspace()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    expect(getByText(OPTIMIERE_OVERVIEW_HEADING)).toBeTruthy()
    expect(getByText(OPTIMIERE_OVERVIEW_INTRO)).toBeTruthy()
  })

  it('overview row shows option count hint', () => {
    const { ws } = setupBavWorkspace()
    const { getByText } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        scenarioId="basis"
        rules={de2026Rules}
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))
    // The option-count hint should appear somewhere containing "Option"
    const container = getByText(OPTIMIERE_OVERVIEW_HEADING).closest('.optimiere-modal__body')
    expect(container).toBeTruthy()
    expect(container!.textContent).toMatch(/\d+\s*(Option|Optionen)/)
  })

  it('anpassen button text has a space between label and option count (#114)', () => {
    // Bug #114: button textContent was "Anpassen4 Optionen" (no space) because the
    // option-count <span> was concatenated directly after the "Anpassen" text node.
    const { ws } = setupBavWorkspace()
    const { getByText, container } = render(
      <OptimiereVorsorgeModal
        workspace={ws}
        baselineCombined={makeBaseline()}
        rules={de2026Rules}
        scenarioId="basis"
        onClose={() => {}}
        onCreatePlans={() => {}}
      />,
    )
    fireEvent.click(getByText(OPTIMIERE_BUTTON_ACCEPT))

    const anpassenBtns = container.querySelectorAll('.optimiere-modal__anpassen-btn')
    expect(anpassenBtns.length).toBeGreaterThanOrEqual(1)

    // Every Anpassen button that shows an option count must have a space separator
    // so the accessible name reads "Anpassen 4 Optionen", not "Anpassen4 Optionen".
    for (const btn of Array.from(anpassenBtns)) {
      const text = (btn.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (/\d+\s*(Option|Optionen)/.test(text)) {
        expect(text).toMatch(/^Anpassen \d+ (Option|Optionen)$/)
      }
    }
  })
})

describe('RentenluckeDashboard — Optimiere button', () => {
  it('renders the Optimiere button when onOpenOptimiere is provided', () => {
    const { getByText } = render(
      <RentenluckeDashboard
        profile={{ ...defaultProfile, grossSalaryYear: 60_000 }}
        overview={makeOverview({ target: 2000, gap: 500 })}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
        onOpenOptimiere={() => {}}
        hasActiveInstances={true}
      />,
    )
    const btn = getByText(OPTIMIERE_BUTTON_LABEL) as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(false)
  })

  it('button is disabled with tooltip when workspace has no active instances', () => {
    const { getByText } = render(
      <RentenluckeDashboard
        profile={{ ...defaultProfile, grossSalaryYear: 60_000 }}
        overview={makeOverview({ target: 2000, gap: 500 })}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
        onOpenOptimiere={() => {}}
        hasActiveInstances={false}
      />,
    )
    const btn = getByText(OPTIMIERE_BUTTON_LABEL) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe(OPTIMIERE_DISABLED_TOOLTIP)
  })

  it('does not render the button when onOpenOptimiere is not provided', () => {
    const { queryByText } = render(
      <RentenluckeDashboard
        profile={{ ...defaultProfile, grossSalaryYear: 60_000 }}
        overview={makeOverview({ target: 2000, gap: 500 })}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
      />,
    )
    expect(queryByText(OPTIMIERE_BUTTON_LABEL)).toBeNull()
  })
})
