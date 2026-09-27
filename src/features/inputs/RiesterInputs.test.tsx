// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { calculateRiesterFunding } from '../../engine/riester'
import { calculateSalaryResult } from '../../engine/salary'
import { RiesterInputs } from './RiesterInputs'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { RiesterFundingResult } from '../../domain/products/riester'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

const FUNDING: RiesterFundingResult = {
  monthlyNetCost: 50,
  monthlyOwnContribution: 50,
  annualOwnContribution: 600,
  grundzulageAnnual: 175,
  childAllowanceAnnual: 0,
  careerStarterBonusAnnual: 0,
  totalAllowanceAnnual: 175,
  guenstigerpruefungBenefitAnnual: 0,
  minEigenbeitragAnnual: 60,
  meetsMinContribution: true,
  prorationFactor: 1,
  specialExpenseDeductibleAnnual: 775,
}

describe('RiesterInputs', () => {
  it.each([
    { directlyEligible: false, indirectSpouseEligible: false, monthlyOwnContribution: 50, eligible: false },
    { directlyEligible: false, indirectSpouseEligible: true, monthlyOwnContribution: 2.5, eligible: false },
    { directlyEligible: true, indirectSpouseEligible: false, monthlyOwnContribution: 50, eligible: true },
  ])('shows proration only when eligible: $directlyEligible / $indirectSpouseEligible / $monthlyOwnContribution', ({ directlyEligible, indirectSpouseEligible, monthlyOwnContribution, eligible }) => {
    const assumptions = {
      ...defaultAssumptions,
      riester: {
        ...defaultAssumptions.riester,
        monthlyOwnContribution,
        eligibility: { ...defaultAssumptions.riester.eligibility, directlyEligible, indirectSpouseEligible },
      },
    }
    const funding = calculateRiesterFunding(
      de2026Rules,
      calculateSalaryResult(defaultProfile, de2026Rules),
      assumptions.riester,
      defaultProfile,
    )
    expect(funding.meetsMinContribution).toBe(false)
    render(
      <RiesterInputs
        assumptions={assumptions}
        onAssumptionsChange={vi.fn()}
        onSyncMonthlyContribution={vi.fn()}
        profile={defaultProfile}
        riesterFunding={funding}
        riesterProductResult={undefined}
      />,
    )
    if (eligible) {
      expect(screen.getByText(/Zulagen werden anteilig/)).toBeInTheDocument()
      expect(screen.queryByText(/Nicht förderberechtigt/)).not.toBeInTheDocument()
    } else {
      expect(screen.getByText(/Nicht förderberechtigt/)).toBeInTheDocument()
      expect(screen.queryByText(/Zulagen werden anteilig/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Eigenbeitrag unter Mindesteigenbeitrag/)).not.toBeInTheDocument()
    }
  })

  it('names the child allowance checkbox without the tooltip text', () => {
    render(
      <RiesterInputs
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onSyncMonthlyContribution={vi.fn()}
        profile={{ ...defaultProfile, childBirthYears: [de2026Rules.year - 5] }}
        riesterFunding={FUNDING}
        riesterProductResult={undefined}
      />,
    )

    const name = 'Kinderzulage in diesem Vertrag berücksichtigen'
    expect(screen.getByRole('checkbox', { name })).toHaveAccessibleName(name)

    fireEvent.click(screen.getByRole('button', { name: 'Erklärung anzeigen' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name })).toHaveAccessibleName(name)
  })
})
