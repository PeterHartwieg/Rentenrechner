// @vitest-environment jsdom
/**
 * UI audit 2026-09-11, F03: a saved alternative must say what applying it
 * changes. An activated offer or a new contract is named as such, with the
 * quoted contribution as "Danach", the extra monthly cost, the plan's total
 * contribution before/after and the contract's real payout duration.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PlanSourceRow, PlanSummary } from '../../app/planSummary'
import type { WhatIfDescription } from '../../app/whatIfPreview'
import { AlternativeComparison } from './AlternativeComparison'

afterEach(cleanup)

function row(overrides: Partial<PlanSourceRow> & Pick<PlanSourceRow, 'key' | 'label'>): PlanSourceRow {
  return {
    netMonthlyNominal: 1000, netMonthlyReal: 700, status: 'entered',
    duration: { kind: 'lifelong' }, contributionMonthly: null, contributionStatus: null, ...overrides,
  }
}

function summary(amount: number, rows: PlanSourceRow[] = [], cost: number | null = null): PlanSummary {
  return {
    monthlyNetSavingCost: cost, pkvRetirementMonthlyCost: 0, netMonthlyTotalReal: amount, netMonthlyTotalNominal: amount / 0.7,
    deflator: 0.7, yearsUntilRetirement: 37, rows,
    readiness: { status: 'available', canShowHouseholdTotal: true, reasons: [], blocking: [], assumptions: [] },
  }
}

const sourceRevision = { baselineId: 'b', createdAt: '2026-09-11T00:00:00Z', snapshotTime: 1 }
const statutory = row({ key: 'statutory', label: 'Gesetzliche Rente' })
const etfBefore = row({ key: 'etf-1', instanceId: 'etf-1', productId: 'etf', label: 'Mein Depot', contributionMonthly: 270,
  duration: { kind: 'drawdown-shared-horizon', endAge: 90, sharedWith: [] } })
const offerAfter = row({ key: 'versicherung-1', instanceId: 'versicherung-1', productId: 'versicherung',
  label: 'Audit Brokerangebot', contributionMonthly: 270, duration: { kind: 'lifelong' } })

describe('AlternativeComparison — F03 change summary', () => {
  it('names an activated offer, its quoted contribution, the extra cost and the payout promise', () => {
    const description: WhatIfDescription = {
      instanceId: 'versicherung-1', instanceLabel: 'Audit Brokerangebot', productId: 'versicherung',
      decision: 'activate_offer', changed: true, beforeContributionMonthly: 0, afterContributionMonthly: 270, sourceRevision,
    }
    render(<AlternativeComparison before={summary(1652, [statutory, etfBefore], 270)} after={summary(1926, [statutory, etfBefore, offerAfter], 540)}
      delta={274} description={description} retirementAge={67} />)
    expect(screen.getByText('Audit Brokerangebot')).toBeInTheDocument()
    expect(screen.getByText(/Angebot wird in den Plan aufgenommen/)).toBeInTheDocument()
    expect(screen.getByText('Monatlicher Beitrag laut Angebot')).toBeInTheDocument()
    expect(screen.getByText(/^Bisher: 0 € \/ Monat \(Angebot zählt noch nicht zum Plan\)/)).toBeInTheDocument()
    expect(screen.getByText('Danach: 270 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Zusätzliche monatliche Belastung: 270 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Nettoaufwand aller Sparformen zu Beginn: 270 € → 540 € / Monat')).toBeInTheDocument()
    expect(screen.getByText(/^Auszahlung:/)).toHaveTextContent('Auszahlung: Lebenslang')
    expect(screen.queryByText(/unbekannt/)).not.toBeInTheDocument()
  })

  it('names a new contract with a zero "Bisher"', () => {
    const description: WhatIfDescription = {
      instanceId: 'etf-neu', instanceLabel: 'Neues ETF-Depot', productId: 'etf',
      decision: 'new_contract', changed: true, beforeContributionMonthly: 0, afterContributionMonthly: 150, sourceRevision,
    }
    const after = row({ key: 'etf-neu', instanceId: 'etf-neu', productId: 'etf', label: 'Neues ETF-Depot', contributionMonthly: 150,
      duration: { kind: 'drawdown-shared-horizon', endAge: 90, sharedWith: ['etf-1'] } })
    render(<AlternativeComparison before={summary(1652, [statutory, etfBefore], 270)} after={summary(1800, [statutory, etfBefore, after])}
      description={description} retirementAge={67} />)
    expect(screen.getByText('Neue Sparform wird ergänzt')).toBeInTheDocument()
    expect(screen.getByText('Bisher: 0 € / Monat (noch nicht vorhanden)')).toBeInTheDocument()
    expect(screen.getByText('Danach: 150 € / Monat')).toBeInTheDocument()
    expect(screen.getByText(/^Auszahlung:/)).toHaveTextContent('Entnahme geplant bis Alter 90')
  })

  it('keeps the plain contribution change and the bAV gross label', () => {
    const description: WhatIfDescription = {
      instanceId: 'bav-1', instanceLabel: 'Betriebsrente', productId: 'bav',
      decision: 'contribution', changed: true, beforeContributionMonthly: 100, afterContributionMonthly: 50, sourceRevision,
    }
    render(<AlternativeComparison before={summary(1652, [], 60)} after={summary(1600, [], 30)} description={description} retirementAge={67} />)
    expect(screen.getByText('Monatlicher Beitrag wird geändert')).toBeInTheDocument()
    expect(screen.getByText('Monatlicher Bruttobeitrag zur bAV')).toBeInTheDocument()
    expect(screen.getByText('Bisher: 100 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Danach: 50 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Monatliche Entlastung: 30 € / Monat')).toBeInTheDocument()
    // No rows on the fixture summaries, so no plan-wide contribution sum is claimed.
    expect(screen.queryByText(/Summe aller Beiträge/)).not.toBeInTheDocument()
  })

  it('says so when the change cannot be described, instead of implying safe unknown fields', () => {
    const description: WhatIfDescription = {
      instanceId: null, instanceLabel: null, productId: null, decision: 'other', changed: false,
      beforeContributionMonthly: null, afterContributionMonthly: null, sourceRevision,
    }
    render(<AlternativeComparison before={summary(1652)} after={summary(1700)} description={description} retirementAge={67} />)
    expect(screen.getByText('Geänderte Vorsorge')).toBeInTheDocument()
    expect(screen.getByText('Änderung konnte nicht im Einzelnen beschrieben werden')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('nicht einzeln aufgeführt')
    expect(screen.queryByText(/Bisher:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Danach:/)).not.toBeInTheDocument()
  })

  it('still shows a paid-up decision as "Keine weiteren Beiträge"', () => {
    const description: WhatIfDescription = {
      instanceId: 'etf-1', instanceLabel: 'Mein Depot', productId: 'etf',
      decision: 'paid_up', changed: true, beforeContributionMonthly: 270, afterContributionMonthly: 270, sourceRevision,
    }
    render(<AlternativeComparison before={summary(1652)} after={summary(1500)} description={description} retirementAge={67} />)
    expect(screen.getByText('Vertrag wird beitragsfrei gestellt')).toBeInTheDocument()
    expect(screen.getByText('Danach: Keine weiteren Beiträge')).toBeInTheDocument()
    expect(screen.queryByText(/Belastung|Entlastung/)).not.toBeInTheDocument()
  })
})


it('distinguishes a resized model contribution from the original broker quote', () => {
  const description: WhatIfDescription = { instanceId: 'versicherung-1', instanceLabel: 'Audit Brokerangebot',
    productId: 'versicherung', decision: 'activate_offer', changed: true, beforeContributionMonthly: 0,
    afterContributionMonthly: 118, quotedContributionMonthly: 270, sourceRevision }
  render(<AlternativeComparison before={summary(1652)} after={summary(1770)} description={description} retirementAge={67} />)
  expect(screen.getByText('Monatlicher Beitrag im Modell')).toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent('Ursprünglicher Beitrag laut Angebot: 270 € / Monat')
  expect(screen.queryByText('Monatlicher Beitrag laut Angebot')).not.toBeInTheDocument()
})
