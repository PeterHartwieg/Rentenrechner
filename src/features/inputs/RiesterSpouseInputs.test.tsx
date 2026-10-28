// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultAssumptions } from '../../data/defaultScenario'
import { RiesterSpouseInputs } from './RiesterSpouseInputs'

afterEach(cleanup)

it('collects separate spouse eligibility and moves child attribution instead of duplicating it', () => {
  const riester = { ...defaultAssumptions.riester, spouse: {
    grossSalaryYear: 0, taxableIncomeAnnual: 0, monthlyOwnContribution: 5, jointAssessment: true,
    eligibility: { ...defaultAssumptions.riester.eligibility, claimsChildAllowance: false },
  } }
  const onChange = vi.fn()
  render(<RiesterSpouseInputs riester={riester} onChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: /Partner: Förderberechtigung/ }), { target: { value: 'indirect' } })
  expect(onChange.mock.lastCall?.[0].spouse.eligibility).toMatchObject({ directlyEligible: false, indirectSpouseEligible: true })
  fireEvent.click(screen.getByRole('checkbox', { name: /Kinderzulagen bei der zweiten/ }))
  expect(onChange.mock.lastCall?.[0].eligibility.claimsChildAllowance).toBe(false)
  expect(onChange.mock.lastCall?.[0].spouse.eligibility.claimsChildAllowance).toBe(true)
})
