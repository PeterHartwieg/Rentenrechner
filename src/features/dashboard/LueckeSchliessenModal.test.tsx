// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { LueckeSchliessenModal } from './LueckeSchliessenModal'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function setup() {
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    {
      ...defaultAssumptions,
      visibleProducts: ['bav', 'etf'],
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
    } as unknown as Record<string, unknown>,
  )
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? ws.baseline.assumptions.returnScenarios[0].id
  return {
    workspace: ws,
    baselineCombined: bundle.combinedByScenarioId[basisId],
    baselinePerInstance: bundle.perInstance,
    grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
  }
}

describe('LueckeSchliessenModal', () => {
  it('opens from the dashboard CTA wrapper', () => {
    const ctx = setup()
    function Wrapper() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Lücke schließen</button>
          {open && (
            <LueckeSchliessenModal
              {...ctx}
              onClose={() => setOpen(false)}
              onSaveAsPlan={() => {}}
            />
          )}
        </>
      )
    }
    const { getByText, queryByRole } = render(<Wrapper />)
    expect(queryByRole('dialog')).toBeNull()
    fireEvent.click(getByText('Lücke schließen'))
    expect(queryByRole('dialog')).toBeTruthy()
  })

  it('can be closed without invoking save/adopt mutation', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const before = JSON.stringify(ctx.workspace)
    const { getByLabelText } = render(
      <LueckeSchliessenModal {...ctx} onClose={onClose} onSaveAsPlan={onSave} />,
    )
    fireEvent.click(getByLabelText('Dialog schließen'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.workspace)).toBe(before)
  })

  it('accepts a custom budget and carries it to the result step', () => {
    const ctx = setup()
    const { container, getByText } = render(
      <LueckeSchliessenModal {...ctx} onClose={() => {}} onSaveAsPlan={() => {}} />,
    )
    const budgetInput = container.querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(budgetInput, { target: { value: '350' } })
    fireEvent.blur(budgetInput)
    fireEvent.click(getByText('Weiter'))
    fireEvent.click(getByText('Nein, Standardannahmen nutzen'))
    fireEvent.click(getByText('Optionen anzeigen'))
    // PR 6: card heading neutralised to a question (no winner framing).
    expect(container.textContent).toMatch(
      /Welcher Vertrag profitiert am stärksten von .*350.* zusätzlich/,
    )
  })

  it('only calls save/adopt from the final result action', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const { container, getByText } = render(
      <LueckeSchliessenModal {...ctx} onClose={() => {}} onSaveAsPlan={onSave} />,
    )
    fireEvent.click(getByText('Weiter'))
    fireEvent.click(getByText('Nein, Standardannahmen nutzen'))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(getByText('Optionen anzeigen'))
    const save = container.querySelector('.recommender-candidate-save')
    expect(save).toBeTruthy()
    fireEvent.click(save!)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  // Issue 68: clicking "Als Plan speichern" must produce a visible state
  // change with feedback to the user; the save handler must fire and the
  // modal must reach a confirmation step rather than silently closing.
  it('shows a confirmation step after Als Plan speichern is clicked', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { container, getByText } = render(
      <LueckeSchliessenModal {...ctx} onClose={onClose} onSaveAsPlan={onSave} />,
    )
    fireEvent.click(getByText('Weiter'))
    fireEvent.click(getByText('Nein, Standardannahmen nutzen'))
    fireEvent.click(getByText('Optionen anzeigen'))
    fireEvent.click(container.querySelector('.recommender-candidate-save')!)

    expect(onSave).toHaveBeenCalledTimes(1)
    // Saved-step content visible: confirmation status region + summary list.
    expect(container.textContent).toContain('Plan gespeichert')
    expect(container.querySelector('.luecke-modal__body--saved')).toBeTruthy()
    expect(container.querySelector('[role="status"]')).toBeTruthy()
    // Modal must NOT auto-close: user must click Fertig.
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(getByText('Fertig'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('PR 11 viewport sweep — opens at phone / tablet / desktop', () => {
    const ctx = setup()
    eachViewport(() => {
      const { container, getByRole, unmount } = render(
        <LueckeSchliessenModal {...ctx} onClose={() => {}} onSaveAsPlan={() => {}} />,
      )
      // The modal is rendered as a `role="dialog"` at every viewport.
      expect(getByRole('dialog')).not.toBeNull()
      // The intro / budget step always renders the budget input.
      expect(container.querySelector('input[type="number"]')).not.toBeNull()
      unmount()
    })
  })
})
