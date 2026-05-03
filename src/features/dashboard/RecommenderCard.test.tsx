// @vitest-environment jsdom
/**
 * Render-integration tests for RecommenderCard.
 *
 * Uses jsdom + @testing-library/react. The component owns marginal-budget
 * input + sort-key state and consumes the recommender engine; tests assert
 * that:
 *   - The card renders without crashing on a baseline workspace.
 *   - Setting the marginal budget via a preset causes candidate cards to render.
 *   - Sort buttons toggle the sort indicator label.
 *   - Clicking "Als Plan speichern" invokes the onSaveAsPlan callback.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { RecommenderCard } from './RecommenderCard'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

function setup() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav', 'etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
  }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? ws.baseline.assumptions.returnScenarios[0].id
  const baselineCombined = bundle.combinedByScenarioId[basisId]
  return {
    workspace: ws,
    baselineCombined,
    baselinePerInstance: bundle.perInstance,
    grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
  }
}

describe('RecommenderCard', () => {
  it('renders the marginal-budget input and preset buttons', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} onSaveAsPlan={() => {}} />,
    )
    expect(container.querySelector('.recommender-card')).toBeTruthy()
    const presets = container.querySelectorAll('.recommender-preset')
    expect(presets.length).toBe(3)
  })

  it('shows candidate cards after a preset is selected', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} onSaveAsPlan={() => {}} />,
    )
    // Click the €400 preset.
    const presets = container.querySelectorAll('.recommender-preset')
    const fourHundred = Array.from(presets).find((b) => b.textContent?.includes('400'))
    expect(fourHundred).toBeTruthy()
    fireEvent.click(fourHundred!)
    const cands = container.querySelectorAll('.recommender-candidate')
    expect(cands.length).toBeGreaterThan(0)
  })

  it('sort buttons toggle the rank-by indicator', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} onSaveAsPlan={() => {}} />,
    )
    const presets = container.querySelectorAll('.recommender-preset')
    fireEvent.click(presets[2])  // €400
    const sortButtons = container.querySelectorAll('.recommender-sort-button')
    // Click the "Flexibilität" button.
    const flexBtn = Array.from(sortButtons).find((b) => b.textContent === 'Flexibilität')
    expect(flexBtn).toBeTruthy()
    fireEvent.click(flexBtn!)
    const indicator = container.querySelector('.recommender-sort-indicator')
    expect(indicator?.textContent).toContain('Flexibilität')
  })

  it('invokes onSaveAsPlan when "Als Plan speichern" is clicked', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const { container } = render(
      <RecommenderCard {...ctx} onSaveAsPlan={onSave} />,
    )
    const presets = container.querySelectorAll('.recommender-preset')
    fireEvent.click(presets[2])  // €400
    const saveButtons = container.querySelectorAll('.recommender-candidate-save')
    expect(saveButtons.length).toBeGreaterThan(0)
    fireEvent.click(saveButtons[0])
    expect(onSave).toHaveBeenCalledTimes(1)
    const call = onSave.mock.calls[0][0]
    expect(call.productId).toBeDefined()
    expect(call.grossMonthlyEUR).toBeGreaterThan(0)
  })

  it('does not render candidate cards when budget is 0', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} onSaveAsPlan={() => {}} />,
    )
    const cands = container.querySelectorAll('.recommender-candidate')
    expect(cands.length).toBe(0)
  })
})
