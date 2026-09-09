// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InventoryWizard, type InventoryWizardProps } from './InventoryWizard'
import { createFreshOnboardingScenario } from './onboardingDraft'

afterEach(cleanup)
function setup(overrides: Partial<Omit<InventoryWizardProps, 'onComplete' | 'onDismiss'>> = {}) {
  const props = { scenario: createFreshOnboardingScenario(), mode: 'edit' as const, initialStep: 'pension' as const, onComplete: vi.fn(), onDismiss: vi.fn(), ...overrides }
  const view = render(<InventoryWizard {...props} />)
  return { ...props, ...view }
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Angaben übernehmen' })) }
async function disclose(title: string, fieldLabel: string) {
  fireEvent.click(screen.getByText(title))
  await waitFor(() => expect(screen.getByLabelText(fieldLabel)).toBeDefined())
}

describe('profile and pension editing', () => {
  it.each(['profile', 'pension'] as const)('opens %s as a single edit step; dismiss leaves the scenario untouched', (initialStep) => {
    const props = setup({ initialStep })
    const before = JSON.stringify(props.scenario)
    expect(screen.queryByText(/von 2/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull()
    if (initialStep === 'profile') change('Dein Alter', '42')
    else { fireEvent.click(screen.getByLabelText('Renteninformation liegt vor')); change('Monatsrente aus deiner Renteninformation (€ brutto)', '2400') }
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Plan' }))
    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(JSON.stringify(props.scenario)).toBe(before)
  })

  it('commits the document method and provides checked DRV help', async () => {
    const props = setup()
    fireEvent.click(screen.getByLabelText('Renteninformation liegt vor'))
    change('Monatsrente aus deiner Renteninformation (€ brutto)', '2345')
    fireEvent.click(screen.getByText('Welche Zahl ist gemeint?'))
    await waitFor(() => expect(screen.getByText(/als zweiten Betrag/)).toBeDefined())
    save()
    const result = props.onComplete.mock.calls[0][0]
    expect(result.assumptions.statutoryPension.pensionEntryMethod).toEqual({ kind: 'document', monthlyGrossEUR: 2345 })
    expect(result.assumptions.inputStatus['statutoryPension.manualMonthlyGross']).toBe('document')
  })

  it('blocks negative career pauses, keeps the invalid value and focuses the summary', async () => {
    const props = setup()
    fireEvent.click(screen.getByLabelText('Ohne Unterlagen grob schätzen'))
    await disclose('Pausen berücksichtigen', 'Jahre ohne Arbeit (grob)')
    change('Jahre ohne Arbeit (grob)', '-3')
    save()
    expect(props.onComplete).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Jahre ohne Arbeit (grob)') as HTMLInputElement).value).toBe('-3')
    expect(screen.getByRole('alert')).toBe(document.activeElement)
    expect(screen.getAllByText('Pausen können nicht negativ sein.')).toHaveLength(2)
    change('Jahre ohne Arbeit (grob)', '1')
    save()
    expect(props.onComplete).toHaveBeenCalledOnce()
  })

  it('rejects a start after current age and negative direct years without clipping', async () => {
    const props = setup()
    fireEvent.click(screen.getByLabelText('Ohne Unterlagen grob schätzen'))
    change('Mit welchem Alter hast du angefangen zu arbeiten?', String(props.scenario.profile.age + 1))
    save()
    expect(props.onComplete).not.toHaveBeenCalled()
    change('Mit welchem Alter hast du angefangen zu arbeiten?', '20')
    fireEvent.click(screen.getByText('Ich kenne meine Beitragsjahre'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Beitragsjahre direkt eingeben' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Beitragsjahre direkt eingeben' }))
    change('Bisherige Beitragsjahre', '-2')
    save()
    expect(props.onComplete).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Bisherige Beitragsjahre') as HTMLInputElement).value).toBe('-2')
  })

  it('retains career and document raw values when switching methods', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Ohne Unterlagen grob schätzen'))
    change('Mit welchem Alter hast du angefangen zu arbeiten?', '19')
    fireEvent.click(screen.getByLabelText('Renteninformation liegt vor'))
    change('Monatsrente aus deiner Renteninformation (€ brutto)', '1900')
    fireEvent.click(screen.getByLabelText('Ohne Unterlagen grob schätzen'))
    expect((screen.getByLabelText('Mit welchem Alter hast du angefangen zu arbeiten?') as HTMLInputElement).value).toBe('19')
    fireEvent.click(screen.getByLabelText('Renteninformation liegt vor'))
    expect((screen.getByLabelText('Monatsrente aus deiner Renteninformation (€ brutto)') as HTMLInputElement).value).toBe('1900')
  })

  it.each(['beamtenpension', 'versorgungswerk', 'none'] as const)('supports %s for an employee without forcing GRV', async (system) => {
    const props = setup()
    await disclose('Andere Altersversorgung', 'Deine Altersversorgung')
    change('Deine Altersversorgung', system)
    if (system !== 'none') change('Voraussichtliche Monatsversorgung (€ brutto)', '2700')
    if (system === 'versorgungswerk') {
      change('Eigener Beitrag zum Versorgungswerk (€/Monat)', '600')
      change('Arbeitgeberbeitrag zum Versorgungswerk (€/Monat)', '300')
    }
    save()
    const pension = props.onComplete.mock.calls[0][0].assumptions.statutoryPension
    expect(pension.pensionBaselineType).toBe(system)
    if (system === 'none') expect(pension.pensionEntryMethod).toBeUndefined()
    else expect(pension.pensionEntryMethod).toEqual({ kind: 'projected-gross', monthlyGrossEUR: 2700 })
    if (system === 'versorgungswerk') expect(pension).toMatchObject({ versorgungswerkMonthlyContribution: 600, versorgungswerkEmployerMonthly: 300 })
  })

  it('does not reseed an in-flight draft when the same scenario id rerenders', () => {
    const props = setup({ initialStep: 'profile' })
    change('Dein Alter', '48')
    props.rerender(<InventoryWizard scenario={{ ...props.scenario }} mode="edit" initialStep="profile" onComplete={props.onComplete} onDismiss={vi.fn()} />)
    expect((screen.getByLabelText('Dein Alter') as HTMLInputElement).value).toBe('48')
    save()
    expect(props.onComplete.mock.calls[0][0].profile.age).toBe(48)
  })
})
