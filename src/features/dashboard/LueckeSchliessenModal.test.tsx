// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { LueckeSchliessenModal } from './LueckeSchliessenModal'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'

afterEach(() => cleanup())

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
    expect(container.textContent).toContain('Beste Optionen für 350')
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
})
