// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CandidateFigureRows } from './RecommenderCard.figureRows'
import type { CandidateFigures } from './RecommenderCard.figures'
import { formatCurrency } from '../../utils/format'

afterEach(cleanup)

function figures(overrides: Partial<CandidateFigures> = {}): CandidateFigures {
  return {
    wholePlanReal: 2_400,
    baselineReal: 2_250,
    additionalReal: 150,
    extraBudgetNet: 200,
    extraBudgetGross: 200,
    extraCapitalReal: 48_765,
    payoutOnly: false,
    safetyReal: 2_300,
    safetyPaths: 200,
    targetMonthly: null,
    remainingGapReal: null,
    scenario: { id: 'basis', label: 'Basis', annualReturn: 0.05 },
    duration: null,
    productLabel: 'Altersvorsorgedepot (ab 2027)',
    productStartYear: 2027,
    ...overrides,
  }
}

function capitalRow(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.recommender-figures__row')).find((r) =>
    r.querySelector('dt')?.textContent?.startsWith('Zusätzliches Kapital bei Renteneintritt'),
  )
  expect(row).toBeTruthy()
  return row!
}

// Browser review 2026-09-11: `payoutOnly` covers finite payout plans (AVD,
// Riester) as well as lifelong annuities, so the capital note must not call
// the value "annuitisiert" or claim a lump sum is impossible in general.
describe('CandidateFigureRows — payout-only capital note', () => {
  it('uses the neutral "laufende Auszahlungen" wording and keeps the figure', () => {
    const { container } = render(
      <CandidateFigureRows figures={figures({ payoutOnly: true })} candidateLabel="Altersvorsorgedepot" />,
    )
    const dd = capitalRow(container).querySelector('dd')!
    expect(dd.textContent).toContain(formatCurrency(48_765))
    expect(dd.textContent).toContain('(im Modell für laufende Auszahlungen vorgesehen)')
    expect(container.textContent).not.toContain('annuitisiert')
    expect(container.textContent).not.toContain('keine Kapitalauszahlung')
    expect(container.textContent).not.toContain('Keine Kapitalauszahlung')
  })

  it('shows no note for candidates with a usable lump sum', () => {
    const { container } = render(
      <CandidateFigureRows figures={figures({ payoutOnly: false })} candidateLabel="ETF-Depot" />,
    )
    const dd = capitalRow(container).querySelector('dd')!
    expect(dd.textContent?.trim()).toBe(formatCurrency(48_765))
    expect(container.textContent).not.toContain('laufende Auszahlungen')
  })
})
