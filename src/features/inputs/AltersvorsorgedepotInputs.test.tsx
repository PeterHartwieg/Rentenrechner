// @vitest-environment jsdom
/**
 * Compare-mode AVD panel — contribution input behaviour.
 *
 * The assertions that matter here are about *which quantity the panel steers*
 * and *where its numbers come from*, because both were structurally wrong
 * before: the panel asked for the derived net cost while the statutory
 * thresholds apply to the Eigenbeitrag, and any locally recomputed allowance
 * would drift from the engine (which resolves children from the profile, gates
 * on eligibility, and caps the child allowance per child).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AltersvorsorgedepotInputs } from './AltersvorsorgedepotInputs'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { AltersvorsorgedepotFundingResult } from '../../domain/products/altersvorsorgedepot'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

const FUNDING: AltersvorsorgedepotFundingResult = {
  monthlyOwnContribution: 150,
  annualOwnContribution: 1_800,
  basicAllowanceAnnual: 540,
  childAllowanceAnnual: 0,
  careerStarterBonusAnnual: 0,
  indirectSpouseAllowanceAnnual: 0,
  totalAllowanceAnnual: 540,
  totalContractContributionAnnual: 2_340,
  cappedAtContractMax: false,
  specialExpenseBaseAnnual: 2_340,
  guenstigerpruefungBenefitAnnual: 329,
  monthlyNetCost: 122.58,
}

function setup(over: Partial<Parameters<typeof AltersvorsorgedepotInputs>[0]> = {}) {
  const onAvdOwnContributionChange = vi.fn()
  const onSyncMonthlyContribution = vi.fn()
  render(
    <AltersvorsorgedepotInputs
      assumptions={defaultAssumptions}
      onAssumptionsChange={vi.fn()}
      onSyncMonthlyContribution={onSyncMonthlyContribution}
      onAvdOwnContributionChange={onAvdOwnContributionChange}
      profile={defaultProfile}
      avdFunding={FUNDING}
      avdProductResult={undefined}
      rules={de2026Rules}
      {...over}
    />,
  )
  return { onAvdOwnContributionChange, onSyncMonthlyContribution }
}

describe('AltersvorsorgedepotInputs — the Eigenbeitrag is the primary input', () => {
  it('asks for the Eigenbeitrag, not the net cost', () => {
    setup()
    expect(screen.getByText('Wie viel zahlst du selbst ein?')).toBeTruthy()
    expect(screen.queryByText('Netto-Aufwand mtl.')).toBeNull()
  })

  it('binds to the engine-derived Eigenbeitrag', () => {
    setup()
    expect(screen.getByRole('slider')).toHaveValue('150')
  })

  it('pins the Eigenbeitrag rather than writing the net anchor', () => {
    const { onAvdOwnContributionChange, onSyncMonthlyContribution } = setup()
    fireEvent.click(screen.getByText('Volle Grundzulage'))
    expect(onAvdOwnContributionChange).toHaveBeenCalledWith(150)
    expect(onSyncMonthlyContribution).not.toHaveBeenCalled()
  })

  it('falls back to the net anchor when no pin callback is wired', () => {
    const { onSyncMonthlyContribution } = setup({ onAvdOwnContributionChange: undefined })
    fireEvent.click(screen.getByText('Mindestbeitrag'))
    expect(onSyncMonthlyContribution).toHaveBeenCalledWith(10)
  })

  it('offers the statutory levels, bounded by the Vertragsrahmen', () => {
    setup()
    expect(screen.getByText('Mindestbeitrag')).toBeTruthy()
    expect(screen.getByText('Volle Grundzulage')).toBeTruthy()
    expect(screen.getByText('Vertragsrahmen')).toBeTruthy()
    expect(screen.getByRole('slider')).toHaveAttribute('max', '525')
  })
})

describe('AltersvorsorgedepotInputs — the ledger reads the engine, never recomputes', () => {
  it('renders the funding figures it was handed', () => {
    setup()
    expect(screen.getByText('Grundzulage (Staat)')).toBeTruthy()
    expect(screen.getByText('+ 540 €/Jahr')).toBeTruthy()
    expect(screen.getByText('Steuervorteil (Günstigerprüfung)')).toBeTruthy()
    expect(screen.getByText('+ 329 €/Jahr')).toBeTruthy()
  })

  it('shows the net cost from the funding result, not a local calculation', () => {
    setup()
    expect(screen.getByText('Netto-Aufwand nach Steuer')).toBeTruthy()
    expect(screen.getByText('122,58 € mtl.')).toBeTruthy()
  })

  it('reflects a child allowance the engine reports, without deriving it', () => {
    // The panel is handed 2 children worth of allowance while the assumptions
    // say zero — the engine resolves children from the profile, so the panel
    // must not second-guess it.
    setup({ avdFunding: { ...FUNDING, childAllowanceAnnual: 600, totalAllowanceAnnual: 1_140 } })
    expect(screen.getByText('Kinderzulage')).toBeTruthy()
    expect(screen.getByText('+ 600 €/Jahr')).toBeTruthy()
  })

  it('flags a contribution below the eligibility floor', () => {
    setup({
      avdFunding: {
        ...FUNDING,
        monthlyOwnContribution: 5,
        annualOwnContribution: 60,
        basicAllowanceAnnual: 0,
        totalAllowanceAnnual: 0,
      },
    })
    expect(screen.getByText('Keine Zulage')).toBeTruthy()
  })

  it('says the net cost is the comparison basis for every product', () => {
    setup()
    expect(screen.getByText(/Vergleichsbasis für/)).toBeTruthy()
  })
})

describe('AltersvorsorgedepotInputs — progressive disclosure', () => {
  it('keeps eligibility, children and payout form visible', () => {
    setup()
    expect(screen.getByText('Förderberechtigte Kinder')).toBeTruthy()
    expect(screen.getByText('Direkt förderberechtigt (Pflichtversichert)')).toBeTruthy()
    expect(screen.getByText('Auszahlungsform')).toBeTruthy()
  })

  it('moves product variant and allocation into a collapsed Erweitert', () => {
    const { container } = render(
      <AltersvorsorgedepotInputs
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onSyncMonthlyContribution={vi.fn()}
        profile={defaultProfile}
        avdFunding={FUNDING}
        avdProductResult={undefined}
        rules={de2026Rules}
      />,
    )
    const details = container.querySelector('details.erweitert-section')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.textContent).toContain('Produktvariante')
    expect(details?.textContent).toContain('Aktien-Anteil (vor Gleitpfad)')
    expect(details?.textContent).toContain('Rendite Sicherheits-Anlageteil p.a.')
  })

  it('keeps the payout-plan end age with the payout form, not under Erweitert', () => {
    const { container } = render(
      <AltersvorsorgedepotInputs
        assumptions={defaultAssumptions}
        onAssumptionsChange={vi.fn()}
        onSyncMonthlyContribution={vi.fn()}
        profile={defaultProfile}
        avdFunding={FUNDING}
        avdProductResult={undefined}
        rules={de2026Rules}
      />,
    )
    const details = container.querySelector('details.erweitert-section')
    expect(screen.getByText('Entnahmeplan bis Alter')).toBeTruthy()
    expect(details?.textContent).not.toContain('Entnahmeplan bis Alter')
  })
})
