// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { ROUTES } from '../../app/useRoute'
import { VorsorgeNeuPage } from './VorsorgeNeuPage'

afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/vorsorge/neu')
})

describe('contract picker container', () => {
  it('renders every product in registry order and opens each choice through navigation', () => {
    const navigate = vi.fn()
    const view = render(<VorsorgeNeuPage navigate={navigate} />)
    const choices = within(screen.getByTestId('contract-picker')).getAllByRole('button').slice(1)
    expect(choices).toHaveLength(PRODUCT_REGISTRY.length)
    PRODUCT_REGISTRY.forEach(({ metadata }, index) => expect(choices[index]).toHaveTextContent(metadata.label))
    view.unmount()
    for (const { metadata } of PRODUCT_REGISTRY) {
      const current = render(<VorsorgeNeuPage navigate={navigate} />)
      fireEvent.click(screen.getByRole('button', { name: metadata.label }))
      expect(navigate).toHaveBeenLastCalledWith(ROUTES.vorsorgeNeu, `?produkt=${metadata.id}`)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(metadata.label)
      current.unmount()
    }
  })

  it('loads a selected product directly and offers other-product and cancel navigation', () => {
    window.history.replaceState(null, '', '/vorsorge/neu?produkt=etf')
    const navigate = vi.fn()
    render(<VorsorgeNeuPage navigate={navigate} />)
    expect(screen.getByRole('spinbutton', { name: 'Monatliche Sparrate (€)' })).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: '← Andere Sparform' }))
    expect(navigate).toHaveBeenLastCalledWith(ROUTES.vorsorgeNeu)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(navigate).toHaveBeenLastCalledWith(ROUTES.home)
  })

  it('discards an unsaved draft when the product selection changes and comes back', () => {
    // ETF doubles as the hook's placeholder product, so returning to it from
    // the picker used to keep the abandoned draft (2B handoff issue 2).
    window.history.replaceState(null, '', '/vorsorge/neu?produkt=etf')
    render(<VorsorgeNeuPage navigate={vi.fn()} />)
    const rate = () => screen.getByRole('spinbutton', { name: 'Monatliche Sparrate (€)' })
    fireEvent.change(rate(), { target: { value: '250' } })
    expect(rate()).toHaveValue(250)
    for (const path of ['/vorsorge/neu', '/vorsorge/neu?produkt=etf']) {
      window.history.replaceState(null, '', path)
      fireEvent(window, new Event('rentenwiki:navigated'))
    }
    expect(rate()).toHaveValue(null)
  })

  it('uses the availability registry copy for AVD', () => {
    render(<VorsorgeNeuPage navigate={vi.fn()} />)
    expect(screen.getByText(/Auszahlplan an Renteneintritt gekoppelt/)).toBeInTheDocument()
    expect(screen.queryByText(/Zukunftsbeispiel/)).not.toBeInTheDocument()
  })
})

it('adds a populated ETF with entered zero and unknown capital through the real save callback', async () => {
  const { loadSavedWorkspace } = await import('../../storage')
  window.history.replaceState(null, '', '/vorsorge/neu?produkt=etf')
  const navigate = vi.fn()
  render(<VorsorgeNeuPage navigate={navigate} />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Monatliche Sparrate (€)' }), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Aktueller Wert (€): Weiß ich nicht' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zum Plan hinzufügen' }))
  expect(navigate).toHaveBeenLastCalledWith(ROUTES.home)
  const etf = loadSavedWorkspace()!.baseline.assumptions.etf.at(-1)!
  expect(etf.monthlyContribution).toBe(0)
  expect(etf.inputStatus?.monthlyContribution).toBe('entered')
  expect(etf.inputStatus?.currentValueEUR).toBe('unknown')
})
