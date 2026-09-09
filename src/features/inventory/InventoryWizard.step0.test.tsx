// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InventoryWizard, type InventoryWizardProps } from './InventoryWizard'
import { createFreshOnboardingScenario } from './onboardingDraft'
import { hasStartedPlan } from '../../app/portfolioState'
import { defaultWorkspace } from '../../storage'

afterEach(cleanup)
function setup(overrides: Partial<Omit<InventoryWizardProps, 'onComplete' | 'onDismiss'>> = {}) {
  const props = { scenario: createFreshOnboardingScenario(), mode: 'onboarding' as const, onComplete: vi.fn(), onDismiss: vi.fn(), ...overrides }
  render(<InventoryWizard {...props} />)
  return props
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function next() { fireEvent.click(screen.getByRole('button', { name: 'Weiter' })) }
function complete() { fireEvent.click(screen.getByRole('button', { name: 'Meinen Plan ansehen' })) }

describe('two-step onboarding', () => {
  it('commits age, income and a career estimate as a Scenario with provenance and no contracts', () => {
    const props = setup()
    expect(screen.getByText('1 von 2 · Über dich')).toBeDefined()
    change('Dein Alter', '40')
    change('Jahreseinkommen brutto (€)', '65000')
    next()
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(screen.getByText('2 von 2 · Deine Rente')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Ohne Unterlagen grob schätzen'))
    change('Mit welchem Alter hast du angefangen zu arbeiten?', '21')
    complete()
    const result = props.onComplete.mock.calls[0][0]
    expect(result.profile.age).toBe(40)
    expect(result.profile.grossSalaryYear).toBe(65000)
    expect(result.assumptions.statutoryPension.pensionEntryMethod).toEqual({ kind: 'career', careerStartAge: 21, pauseYears: 0 })
    expect(result.assumptions.inputStatus).toMatchObject({ 'profile.age': 'entered', 'profile.grossSalaryYear': 'entered', 'statutoryPension.currentEntgeltpunkte': 'assumed' })
    expect(result.assumptions.etf).toEqual([])
    expect(hasStartedPlan({ ...defaultWorkspace, baseline: result })).toBe(true)
  })

  it('skipped pension keeps engine values and marks the pension inputs unknown', () => {
    const props = setup()
    next()
    fireEvent.click(screen.getByLabelText('Später ergänzen'))
    expect(screen.getByText(/Die Gesamtrente bleibt offen/)).toBeDefined()
    complete()
    const result = props.onComplete.mock.calls[0][0]
    expect(result.assumptions.statutoryPension.pensionEntryMethod).toEqual({ kind: 'skipped' })
    expect(result.assumptions.inputStatus).toMatchObject({ 'statutoryPension.currentEntgeltpunkte': 'unknown', 'statutoryPension.manualMonthlyGross': 'unknown' })
    expect(result.assumptions.statutoryPension.currentEntgeltpunkte).toBe(props.scenario.assumptions.statutoryPension.currentEntgeltpunkte)
  })

  it('saves an unknown PKV premium without replacing its engine value with zero', () => {
    const props = setup()
    change('Krankenversicherung', 'pkv')
    fireEvent.click(screen.getByLabelText('Private Krankenversicherung (€/Monat): Weiß ich nicht'))
    fireEvent.click(screen.getByLabelText('Private Pflegeversicherung (€/Monat): Weiß ich nicht'))
    expect(screen.getByText('Ohne Beitrag bleibt dein Netto-Ergebnis offen.')).toBeDefined()
    next()
    fireEvent.click(screen.getByLabelText('Später ergänzen'))
    complete()
    const result = props.onComplete.mock.calls[0][0]
    expect(result.profile.publicHealthInsurance).toBe(false)
    expect(result.profile.pkvMonthlyPremium).toBe(props.scenario.profile.pkvMonthlyPremium)
    expect(result.assumptions.inputStatus).toMatchObject({ 'profile.pkvMonthlyPremium': 'unknown', 'profile.pPVMonthlyPremium': 'unknown' })
  })

  it('typing zero after unknown restores an entered value', () => {
    const props = setup()
    fireEvent.click(screen.getByLabelText('Jahreseinkommen brutto (€): Weiß ich nicht'))
    change('Jahreseinkommen brutto (€)', '0')
    next()
    fireEvent.click(screen.getByLabelText('Später ergänzen'))
    complete()
    expect(props.onComplete.mock.calls[0][0].assumptions.inputStatus['profile.grossSalaryYear']).toBe('entered')
    expect(props.onComplete.mock.calls[0][0].profile.grossSalaryYear).toBe(0)
  })

  it('preserves raw profile values on back and switches the self-employed income label', () => {
    setup()
    change('Deine Tätigkeit', 'self_employed')
    change('Gewinn vor Steuern pro Jahr (€)', '72000')
    next()
    expect(screen.getByLabelText('Deine Altersversorgung')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zu deinen Angaben' }))
    expect((screen.getByLabelText('Gewinn vor Steuern pro Jahr (€)') as HTMLInputElement).value).toBe('72000')
  })

  it('rejects blank age without confirming it as zero', () => {
    const props = setup()
    change('Dein Alter', '')
    next()
    expect(screen.getByRole('alert')).toBe(document.activeElement)
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(screen.queryByText('2 von 2 · Deine Rente')).toBeNull()
    expect((screen.getByLabelText('Dein Alter') as HTMLInputElement).value).toBe('')
  })

  it('retains partner, tax and children pass-throughs when editing a profile', async () => {
    const scenario = createFreshOnboardingScenario()
    scenario.profile.childBirthYears = [2010, 2015]
    scenario.profile.taxClass = 3
    scenario.partner = { ...scenario.profile, grossSalaryYear: 20000 }
    const props = setup({ scenario, mode: 'edit' })
    fireEvent.click(screen.getByText('Rentenalter & weitere Angaben'))
    await waitFor(() => expect(screen.getByLabelText('Kirchensteuer')).toBeDefined())
    fireEvent.click(screen.getByLabelText('Kirchensteuer'))
    fireEvent.click(screen.getByRole('button', { name: 'Angaben übernehmen' }))
    const result = props.onComplete.mock.calls[0][0]
    expect(result.profile.childBirthYears).toEqual([2010, 2015])
    expect(result.profile.taxClass).toBe(3)
    expect(result.partner).toEqual(scenario.partner)
    expect(result.profile.churchTax).toBe(!scenario.profile.churchTax)
  })
})
