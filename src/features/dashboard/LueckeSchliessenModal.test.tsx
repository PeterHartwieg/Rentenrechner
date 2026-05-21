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
  // Defensive cleanup: ModalSlot locks body overflow while open; the
  // useEffect cleanup restores it on unmount, but explicitly resetting
  // here keeps any failing test from leaking state into the next one.
  document.body.style.overflow = ''
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

  // R3.1: the modal MUST consume the shared Sober D ModalSlot primitive so
  // the chrome (backdrop, panel, header, focus trap, ESC + backdrop dismiss)
  // is owned by `src/ui/chrome/ModalSlot.tsx`. Asserting the rw-modal-slot
  // panel class pins the dialog to that primitive — a regression that
  // reverts to the legacy `.luecke-modal-backdrop` chrome would fail here.
  it('renders via the Sober D ModalSlot primitive (R3.1)', () => {
    const ctx = setup()
    const { container } = render(
      <LueckeSchliessenModal {...ctx} onClose={() => {}} onSaveAsPlan={() => {}} />,
    )
    expect(container.querySelector('.rw-modal-slot')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__panel')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__header')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__body')).not.toBeNull()
    // Eyebrow is the step label; default first step is "Schritt 1 von 3".
    expect(container.querySelector('.rw-modal-slot__eyebrow')?.textContent).toBe(
      'Schritt 1 von 3',
    )
    // Title is the modal's permanent label, not the step heading.
    expect(container.querySelector('.rw-modal-slot__title')?.textContent).toBe(
      'Lücke schließen',
    )
    // The legacy bespoke chrome must be gone — no luecke-modal-backdrop / header.
    expect(container.querySelector('.luecke-modal-backdrop')).toBeNull()
    expect(container.querySelector('.luecke-modal__header')).toBeNull()
  })

  it('can be closed without invoking save/adopt mutation', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const before = JSON.stringify(ctx.workspace)
    const { container, getAllByLabelText } = render(
      <LueckeSchliessenModal {...ctx} onClose={onClose} onSaveAsPlan={onSave} />,
    )
    // ModalSlot mounts two elements with the close label (backdrop button +
    // X button). Click the X (the header close button, identified by the
    // `.rw-modal-slot__close` class) so we exercise the explicit dismiss
    // affordance rather than the backdrop fallback.
    const closeBtn = container.querySelector<HTMLButtonElement>('.rw-modal-slot__close')
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.workspace)).toBe(before)
    // Sanity: both labelled elements (backdrop + X) carry the same dismiss
    // label, mirroring the ModalSlot primitive contract.
    expect(getAllByLabelText('Dialog schließen').length).toBe(2)
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

  // Codex P2 (R3.1 R1): ModalSlot's FocusTrap focuses the first focusable
  // element (the invisible backdrop button) on mount. The consumer useEffect
  // on [step] must override this so the first visible form field has focus
  // when the modal opens — otherwise pressing Space/Enter immediately
  // dismisses the dialog.
  it('focuses the first form field (not the backdrop button) on open', () => {
    const ctx = setup()
    const { container } = render(
      <LueckeSchliessenModal {...ctx} onClose={() => {}} onSaveAsPlan={() => {}} />,
    )
    // The backdrop button is the invisible dismiss affordance — it must NOT
    // have focus when the modal opens.
    const backdropBtn = container.querySelector<HTMLButtonElement>('.rw-modal-slot__backdrop')
    expect(backdropBtn).not.toBeNull()
    expect(document.activeElement).not.toBe(backdropBtn)

    // The first preset button ("100 €") is the first visible form control in
    // step 1 and should have received focus via the consumer useEffect.
    const firstPresetBtn = container.querySelector<HTMLButtonElement>('.recommender-preset')
    expect(firstPresetBtn).not.toBeNull()
    expect(document.activeElement).toBe(firstPresetBtn)
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
