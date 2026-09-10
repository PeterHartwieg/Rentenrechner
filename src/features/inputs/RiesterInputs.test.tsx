// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
