// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { OnboardingNumberField } from './OnboardingFields'
import { assumed, entered, setUnknown, type Field, createFreshOnboardingScenario } from './onboardingDraft'
import { InventoryWizard } from './InventoryWizard'
import { OnboardingProfileStep } from './OnboardingProfileStep'
import { OnboardingPensionStep } from './OnboardingPensionStep'
import { useOnboardingDraft } from './useOnboardingDraft'

afterEach(cleanup)

function ControlledField({ hideAssumed = true }: { hideAssumed?: boolean }) {
  const [field, setField] = useState<Field<number>>(assumed(35))
  return <OnboardingNumberField label="Dein Alter" field={field} hideAssumed={hideAssumed} showErrors={false}
    onValue={(value) => setField(entered(value))} onUnknown={() => setField(setUnknown(field))} />
}

function ControlledSteps() {
  const [scenario] = useState(createFreshOnboardingScenario)
  const draft = useOnboardingDraft({ scenario })
  return <>
    <OnboardingProfileStep draft={draft} errors={draft.errors.profile} mode="onboarding" showErrors={false} />
    <OnboardingPensionStep draft={draft} errors={draft.errors.pension} mode="onboarding" showErrors={false} />
    <button onClick={() => {
      draft.setFieldUnknown('profile', 'employment')
      draft.setFieldUnknown('profile', 'publicHealthInsurance')
      draft.setFieldUnknown('pension', 'retirementHealthStatus')
    }}>Auswahl leeren</button>
  </>
}

describe('onboarding select placeholders', () => {
  it('omits placeholders for preselected values, including private health insurance', async () => {
    render(<ControlledSteps />)
    const employment = screen.getByRole('combobox', { name: 'Deine Tätigkeit' })
    const health = screen.getByRole('combobox', { name: 'Krankenversicherung' })
    expect(employment).toHaveValue('employee')
    expect(health).toHaveValue('gkv')
    expect(within(employment).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    expect(within(health).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    fireEvent.change(health, { target: { value: 'pkv' } })
    expect(health).toHaveValue('pkv')
    expect(within(health).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Andere Altersversorgung'))
    const system = await screen.findByRole('combobox', { name: 'Deine Altersversorgung' })
    expect(system).toHaveValue('grv')
    expect(within(system).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Weitere Rentenangaben'))
    const retirementHealth = await screen.findByRole('combobox', { name: 'Krankenversicherung im Ruhestand' })
    expect(retirementHealth).toHaveValue('kvdr')
    expect(within(retirementHealth).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
  })

  it('keeps a disabled placeholder only until an empty draft field gets a value', async () => {
    render(<ControlledSteps />)
    fireEvent.click(screen.getByText('Weitere Rentenangaben'))
    await screen.findByRole('combobox', { name: 'Krankenversicherung im Ruhestand' })
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl leeren' }))
    for (const [name, value] of [
      ['Deine Tätigkeit', 'self_employed'],
      ['Krankenversicherung', 'pkv'],
      ['Krankenversicherung im Ruhestand', 'pkv'],
    ]) {
      const select = screen.getByRole('combobox', { name })
      expect(select).toHaveValue('')
      expect(within(select).getByRole('option', { name: 'Bitte auswählen' })).toBeDisabled()
      fireEvent.change(select, { target: { value } })
      expect(select).toHaveValue(value)
      expect(within(select).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    }
  })
})

describe('onboarding provenance', () => {
  it('omits provenance for blank inputs, shows entered zero and hides the hint again when cleared', () => {
    render(<ControlledField />)
    const input = screen.getByRole('spinbutton', { name: 'Dein Alter' })
    const group = screen.getByRole('group', { name: 'Angabe: Dein Alter' })
    expect(input).toHaveValue(null)
    expect(screen.queryByText('Angenommen')).not.toBeInTheDocument()
    expect(group).not.toHaveAttribute('aria-describedby')
    fireEvent.change(input, { target: { value: '0' } })
    expect(input).toHaveValue(0)
    expect(screen.getByText('Von dir angegeben')).toBeVisible()
    expect(group).toHaveAccessibleDescription('Von dir angegeben')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(null)
    expect(screen.queryByText('Von dir angegeben')).not.toBeInTheDocument()
  })

  it('shows explicit unknown and restores the previous entered value when unchecked', () => {
    render(<ControlledField />)
    const input = screen.getByRole('spinbutton')
    const checkbox = screen.getByRole('checkbox')
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.blur(input)
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(input).toHaveValue(null)
    expect(screen.getByText('Unbekannt')).toBeVisible()
    expect(checkbox).toHaveAccessibleDescription('Unbekannt')
    fireEvent.click(checkbox)
    expect(input).toHaveValue(42)
    expect(screen.getByText('Von dir angegeben')).toBeVisible()
  })

  it('keeps assumed values and their hint in edit mode', () => {
    render(<ControlledField hideAssumed={false} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(35)
    expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription('Angenommen')
    expect(screen.getByText('Angenommen')).toBeVisible()
  })

  it('applies the blank-field rule to both onboarding steps', () => {
    render(<InventoryWizard scenario={createFreshOnboardingScenario()} mode="onboarding" onComplete={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByText('Angenommen')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Dein Alter'), { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('Jahreseinkommen brutto (€)'), { target: { value: '60000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    const group = screen.getByRole('group', { name: 'Angabe: Mit welchem Alter hast du angefangen zu arbeiten?' })
    expect(within(group).getByRole('spinbutton')).toHaveValue(null)
    expect(within(group).queryByText('Angenommen')).not.toBeInTheDocument()
    fireEvent.change(within(group).getByRole('spinbutton'), { target: { value: '22' } })
    expect(within(group).getByText('Von dir angegeben')).toBeVisible()
  })
})
