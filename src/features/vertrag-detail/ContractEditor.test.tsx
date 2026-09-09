// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { defaultWorkspace, saveWorkspace, loadSavedWorkspace } from '../../storage'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { useContractDraft } from '../inventory/useContractDraft'
import { INVENTORY_PRODUCT_REGISTRY, type MultiInstanceProductId } from '../inventory/inventoryProductRegistry'
import type { ContractDraftPatch } from '../inventory/contractDraft'
import { ContractEditor } from './ContractEditor'
import { VertragBearbeitenPage } from './VertragBearbeitenPage'

function Harness({ productId = 'etf', onSave = () => {}, onCancel = () => {} }: {
  productId?: MultiInstanceProductId
  onSave?: (patch: ContractDraftPatch) => void
  onCancel?: () => void
}) {
  const api = useContractDraft({ productId, instance: null, workspace: defaultWorkspace })
  const [open, setOpen] = useState(true)
  if (!open) return <button onClick={() => setOpen(true)}>Editor öffnen</button>
  return <ContractEditor {...api} fieldSpecs={api.visibleSpecs} mode="new"
    productLabel={PRODUCT_REGISTRY.find((entry) => entry.metadata.id === productId)!.metadata.label}
    retirementEndAge={96} onEditSharedHorizon={vi.fn()} onOpenFurtherInputs={vi.fn()} back={vi.fn()}
    cancel={() => { api.reset(); setOpen(false); onCancel() }}
    save={() => { if (!api.valid) return false; onSave(api.toPatch()); return true }} />
}

const capital = () => screen.getByRole('spinbutton', { name: 'Aktueller Wert (€)' })
const monthly = () => screen.getByRole('spinbutton', { name: 'Monatliche Sparrate (€)' })
const unknownCapital = () => screen.getByRole('checkbox', { name: 'Aktueller Wert (€): Weiß ich nicht' })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Zum Plan hinzufügen' }))
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } })

afterEach(cleanup)

beforeEach(() => localStorage.clear())

describe('contract editor with real draft hook', () => {
  it('starts with empty required core fields, not unknown, and focuses the error summary on failed save', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    expect(capital()).toHaveValue(null)
    expect(capital()).toBeRequired()
    expect(unknownCapital()).not.toBeChecked()
    submit()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(capital()).toHaveAttribute('aria-invalid', 'true')
  })

  it('saves a typed zero contribution as entered and unknown capital as omitted without touching its neighbour', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    type(monthly(), '0')
    fireEvent.click(unknownCapital())
    expect(monthly()).toHaveValue(0)
    expect(capital()).not.toBeRequired()
    submit()
    const saved = onSave.mock.calls[0][0] as ContractDraftPatch
    expect(saved.patch.monthlyContribution).toBe(0)
    expect(saved.inputStatus.monthlyContribution).toBe('entered')
    expect(saved.patch).not.toHaveProperty('currentValueEUR')
    expect(saved.inputStatus.currentValueEUR).toBe('unknown')
  })

  it('restores a remembered value after unchecking unknown, and typing zero clears unknown', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    type(capital(), '1234.56')
    type(monthly(), '150')
    fireEvent.click(unknownCapital())
    fireEvent.click(unknownCapital())
    expect(capital()).toHaveValue(1234.56)
    fireEvent.click(unknownCapital())
    type(capital(), '0')
    expect(unknownCapital()).not.toBeChecked()
    submit()
    expect(onSave.mock.calls[0][0].patch.currentValueEUR).toBe(0)
    expect(onSave.mock.calls[0][0].inputStatus.currentValueEUR).toBe('entered')
  })

  it('clearing a known input stays blank and invalid after blur', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    type(capital(), '30')
    type(monthly(), '40')
    type(monthly(), '')
    fireEvent.blur(monthly())
    expect(monthly()).toHaveValue(null)
    submit()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps disclosure edits, uses ratio storage and confirms document provenance explicitly', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    type(capital(), '0'); type(monthly(), '100')
    const disclosure = screen.getByText('Kosten & Auszahlung').closest('details')!
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    const name = screen.getByRole('textbox', { name: 'Eigener Name (optional)' })
    type(name, 'Mein Depot')
    const fee = screen.getByRole('spinbutton', { name: 'Laufende Fondskosten p.a. (TER) (%)' })
    type(fee, '0.35')
    fireEvent.click(within(fee.closest('[data-contract-field]') as HTMLElement).getByRole('button', { name: 'Wert aus Beleg bestätigen' }))
    expect(fee).toHaveAccessibleDescription('lt. Beleg')
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    expect(disclosure).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    expect(name).toHaveValue('Mein Depot')
    expect(fee).toHaveValue(0.35)
    expect(screen.getByText(/Die gemeinsame Entnahmedauer bis Alter 96/)).toBeInTheDocument()
    submit()
    expect(onSave.mock.calls[0][0].patch.annualAssetFee).toBeCloseTo(0.0035)
    expect(onSave.mock.calls[0][0].inputStatus.annualAssetFee).toBe('document')
    expect(onSave.mock.calls[0][0].patch.label).toBe('Mein Depot')
  })

  it('opens details on invalid cost input and preserves the blank after blur', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    type(capital(), '0'); type(monthly(), '100')
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    const fee = screen.getByRole('spinbutton', { name: 'Laufende Fondskosten p.a. (TER) (%)' })
    type(fee, '')
    fireEvent.blur(fee)
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    submit()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Kosten & Auszahlung').closest('details')).toHaveAttribute('open')
    expect(fee).toHaveValue(null)
    expect(fee).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('cancel discards edits and never saves', () => {
    const onSave = vi.fn(), onCancel = vi.fn()
    render(<Harness onSave={onSave} onCancel={onCancel} />)
    type(monthly(), '444')
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Editor öffnen' }))
    expect(monthly()).toHaveValue(null)
  })

  it('shows bAV classification and separate statutory and fixed employer support', () => {
    render(<Harness productId="bav" />)
    expect(screen.getByRole('spinbutton', { name: 'Jahr des Vertragsbeginns' })).toBeInTheDocument()
    const kind = screen.getByRole('combobox', { name: 'Art der betrieblichen Vorsorge' })
    expect(kind).toContainHTML('Weiß ich nicht')
    expect(screen.getByRole('checkbox', { name: /Gesetzlicher Arbeitgeberzuschuss/ })).toBeInTheDocument()
    const contribution = screen.getByRole('spinbutton', { name: 'Dein monatlicher Bruttobeitrag (€)' })
    expect(contribution).toHaveAccessibleDescription(/ohne Arbeitgeberzuschuss/)
    expect(screen.getByRole('spinbutton', { name: 'Zusätzlicher fester Arbeitgeberbeitrag (€/Monat)' }))
      .toHaveAccessibleDescription(/0 bedeutet: kein zusätzlicher/)
    fireEvent.change(kind, { target: { value: '' } })
    expect(kind.closest('[data-contract-field]')).toHaveTextContent('Angenommen')
  })

  it('shows conditional insurance classification and preserves the three payout modes', () => {
    render(<Harness productId="versicherung" />)
    type(screen.getByRole('spinbutton', { name: 'Jahr des Vertragsbeginns' }), '2000')
    expect(screen.getByRole('checkbox', { name: /Altvertrag.*Steuerfreiheits/ })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    const mode = screen.getByRole('combobox', { name: 'Auszahlungsform' })
    fireEvent.change(mode, { target: { value: 'zeitrente' } })
    expect(screen.getByRole('spinbutton', { name: 'Laufzeit der Zeitrente (Jahre)' })).toBeInTheDocument()
    fireEvent.change(mode, { target: { value: 'kapitalverzehr' } })
    expect(screen.getByText(/Die gemeinsame Entnahmedauer/)).toBeInTheDocument()
  })

  it('renders only the allowed Basisrente mode and AVD-specific end age', () => {
    const view = render(<Harness productId="basisrente" />)
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    expect(screen.getByRole('combobox', { name: 'Auszahlungsform' }).querySelectorAll('option')).toHaveLength(1)
    view.unmount()
    render(<Harness productId="altersvorsorgedepot" />)
    expect(screen.getByRole('checkbox', { name: 'Unmittelbar förderberechtigt' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Kosten & Auszahlung'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Auszahlungsform' }), { target: { value: 'certified_payout_plan' } })
    expect(screen.getByRole('spinbutton', { name: 'Auszahlplan bis Alter' })).toBeInTheDocument()
    expect(screen.queryByText(/Die gemeinsame Entnahmedauer/)).not.toBeInTheDocument()
  })
})

it('removing through the real container keeps an undo action after the instance disappears', () => {
  const workspace = structuredClone(defaultWorkspace)
  const instance = INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => 'etf-remove')
  workspace.baseline.assumptions.etf = [{ ...instance, label: 'Mein Depot' }]
  saveWorkspace(workspace)
  render(<VertragBearbeitenPage instanceId="etf-remove" navigate={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Vorsorge entfernen' }))
  expect(screen.getByRole('status')).toHaveTextContent('„Mein Depot“ entfernt.')
  expect(loadSavedWorkspace()!.baseline.assumptions.etf).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(loadSavedWorkspace()!.baseline.assumptions.etf).toEqual(workspace.baseline.assumptions.etf)
  expect(screen.getByRole('button', { name: 'Änderungen übernehmen' })).toBeInTheDocument()
})
