// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { VergleichJourneyPage } from './VergleichJourneyPage'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { buildShareUrl } from '../../utils/urlShare'
import { PRODUCT_REGISTRY, getProductMeta } from '../../engine/productRegistry'
import { buildStateJson, migrateV1ToV2, saveWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/vergleich')
})
afterEach(cleanup)

const choose = (id: string) => screen.getByRole('checkbox', { name: getProductMeta(id)!.label })
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Auswahl oder Betrag ändern' }))
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Vergleich ansehen' }))

function saveComparison(selected: typeof defaultAssumptions.visibleProducts) {
  localStorage.setItem(STORAGE_KEY_V1, buildStateJson(defaultProfile, {
    ...defaultAssumptions, visibleProducts: selected, monteCarlo: { ...defaultAssumptions.monteCarlo, enabled: false },
  }))
}

describe('comparison journey with real compare-state handlers', () => {
  it('renders only selected cards and scopes deeper results to the same products', () => {
    saveComparison(['versicherung', 'etf'])
    const { container } = render(<VergleichJourneyPage navigate={vi.fn()} />)
    expect(screen.getAllByTestId(/^vergleich-result-/)).toHaveLength(2)
    expect(screen.getByTestId('vergleich-result-versicherung')).toBeInTheDocument()
    expect(screen.queryByTestId('vergleich-result-bav')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.vergleich-comparison-table tbody tr')).toHaveLength(2)
    expect(container.querySelectorAll('.vergleich-pro-contra-card')).toHaveLength(2)
  })

  it('starts empty selection in setup, allows an empty result, then returns to setup', () => {
    saveComparison([])
    render(<VergleichJourneyPage navigate={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Was möchtest du vergleichen?')
    expect(screen.getByRole('group', { name: 'Sparformen' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(PRODUCT_REGISTRY.length)
    submit()
    expect(screen.getByText('Noch keine Sparform ausgewählt')).toBeInTheDocument()
    expect(screen.queryAllByTestId(/^vergleich-result-/)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Sparformen auswählen' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    fireEvent.click(choose('riester'))
    submit()
    expect(screen.getByTestId('vergleich-result-riester')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    edit()
    expect(choose('riester')).toBeChecked()
  })

  it('edits the compare profile and budget without creating a combine workspace', () => {
    render(<VergleichJourneyPage navigate={vi.fn()} />)
    edit()
    expect(screen.queryByRole('button', { name: 'Angaben aus meinem Plan verwenden' })).not.toBeInTheDocument()
    for (const [name, value] of [['Alter', '42'], ['Jahreseinkommen brutto (€)', '81000'], ['Was möchtest du monatlich selbst zahlen (€)?', '240']]) {
      const input = screen.getByLabelText(name)
      expect(input).toBe(screen.getByRole('spinbutton', { name }))
      expect(input).toHaveAttribute('id')
      expect((input as HTMLInputElement).labels?.[0]).toHaveAttribute('for', input.id)
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Privat (PKV)' }))
    submit()
    expect(screen.getByText('Je 240 € aus deinem eigenen Geld im Monat.')).toBeInTheDocument()
    const card = screen.getByTestId('vergleich-result-etf')
    expect(within(card).getByText(/42 Jahre · 81.000.*PKV/)).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull()
    edit()
    expect(screen.getByRole('spinbutton', { name: 'Alter' })).toHaveValue(42)
    expect(screen.getByRole('radio', { name: 'Privat (PKV)' })).toBeChecked()
  })

  it('mounts the compare print mirror with the disclaimer first and only the selected products', () => {
    saveComparison(['etf', 'riester'])
    const { container } = render(<VergleichJourneyPage navigate={vi.fn()} />)
    const report = container.querySelector('#print-report')
    expect(report).not.toBeNull()
    // Publication guardrail: the disclaimer is the literal first child.
    expect(report!.firstElementChild).toHaveClass('pr-disclaimer-top')
    const rows = report!.querySelectorAll('.pr-vergleich-table tbody tr')
    expect(rows).toHaveLength(2)
    const labels = [...rows].map((row) => row.querySelector('td')?.textContent ?? '')
    expect(labels[0]).toContain(getProductMeta('etf')!.label)
    expect(labels[1]).toContain(getProductMeta('riester')!.label)
  })

  it('offers explicit saved-plan seeding, keeps budget/selection and never writes the plan', () => {
    const workspace = migrateV1ToV2({ ...defaultProfile, age: 48, grossSalaryYear: 93000 }, { ...defaultAssumptions })
    workspace.mode = 'combine'
    saveWorkspace(workspace)
    // A share link supplies an independent compare profile. The storage loader
    // now prefers V1 comparison state over the plan (see the next test), but a
    // share URL is still the cleanest way to pin an explicit "before" here.
    window.history.replaceState(null, '', buildShareUrl(defaultProfile, {
      ...defaultAssumptions, visibleProducts: ['etf'],
      monteCarlo: { ...defaultAssumptions.monteCarlo, enabled: false },
    }))
    const before = localStorage.getItem(STORAGE_KEY_V2)
    render(<VergleichJourneyPage navigate={vi.fn()} />)
    edit()
    expect(screen.queryByRole('spinbutton', { name: 'Alter' })).not.toBeInTheDocument()
    const seed = screen.getByRole('button', { name: 'Angaben aus meinem Plan verwenden' })
    expect(screen.getByText(/Aktuell verwendet:/)).toHaveTextContent(`${defaultProfile.age} Jahre`)
    fireEvent.click(seed)
    expect(screen.getByText(/Aktuell verwendet:/)).toHaveTextContent('48 Jahre · 93.000')
    expect(choose('etf')).toBeChecked()
    expect(choose('bav')).not.toBeChecked()
    submit()
    expect(screen.getAllByTestId(/^vergleich-result-/)).toHaveLength(1)
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(before)
  })

  it('never imports the saved plan silently — comparison state wins on load', () => {
    // Phase 4a: `loadSavedState` used to prefer a combine workspace, so a user
    // with a plan saw plan values on `/vergleich` before ever pressing
    // "Angaben aus meinem Plan verwenden". Seeding must stay explicit.
    const workspace = migrateV1ToV2({ ...defaultProfile, age: 48, grossSalaryYear: 93000 }, { ...defaultAssumptions })
    workspace.mode = 'combine'
    saveWorkspace(workspace)
    saveComparison(['etf'])
    render(<VergleichJourneyPage navigate={vi.fn()} />)
    edit()
    expect(screen.getByText(/Aktuell verwendet:/)).toHaveTextContent(`${defaultProfile.age} Jahre`)
    fireEvent.click(screen.getByRole('button', { name: 'Angaben aus meinem Plan verwenden' }))
    expect(screen.getByText(/Aktuell verwendet:/)).toHaveTextContent('48 Jahre · 93.000')
  })
})
