// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { VergleichPage } from './VergleichPage'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { ProductId, ScenarioAssumptions } from '../../domain'
import { buildAllProductsSimulation } from '../../app/buildAllProductsSimulation'
import { deriveTaxModes } from '../../app/simulationSelectors'
import { de2026Rules } from '../../rules/de2026'
import { formatCurrency } from '../../utils/format'

afterEach(cleanup)

function renderResult(assumptions: ScenarioAssumptions) {
  const simulation = buildAllProductsSimulation(defaultProfile, assumptions)
  const result = {
    simulation, monteCarloResult: null, effectiveScenarioId: 'basis',
    selectedScenario: assumptions.returnScenarios.find((scenario) => scenario.id === 'basis'),
    taxModes: deriveTaxModes(defaultProfile, assumptions, de2026Rules),
  }
  render(<VergleichPage profile={defaultProfile} assumptions={assumptions}
    result={result} allProductsSimulation={simulation} selectedScenarioId="basis"
    onAssumptionsChange={() => {}} onSelectScenario={() => {}} />)
  return simulation
}

describe('comparison card duration and real figures', () => {
  const cases: [ProductId, Partial<ScenarioAssumptions>, string, boolean][] = [
    ['basisrente', {}, 'Lebenslang', true],
    ['bav', { bav: { ...defaultAssumptions.bav, payoutMode: 'leibrente' } }, 'Lebenslang', true],
    ['versicherung', { insurance: { ...defaultAssumptions.insurance, payoutMode: 'zeitrente', zeitrenteYears: 12 } }, `Für 12 Jahre · bis Alter ${defaultProfile.retirementAge + 12}`, false],
    ['riester', { riester: { ...defaultAssumptions.riester, payoutMode: 'zeitrente', zeitrenteYears: 18 } }, `Für 18 Jahre · bis Alter ${defaultProfile.retirementAge + 18}`, false],
    ['etf', { retirementEndAge: 94 }, 'Entnahme geplant bis Alter 94 · gemeinsame Annahme', false],
    ['bav', { bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' }, retirementEndAge: 92 }, 'Entnahme geplant bis Alter 92 · gemeinsame Annahme', false],
    ['altersvorsorgedepot', { altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, payoutMode: 'certified_payout_plan', payoutPlanEndAge: 91 } }, 'Auszahlplan bis Alter 91', false],
    ['altersvorsorgedepot', { altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, payoutMode: 'lifelong_annuity' } }, 'Lebenslang', true],
  ]

  it.each(cases)('%s displays its actual payout duration (%s)', (id, overrides, label, lifelong) => {
    renderResult({ ...defaultAssumptions, ...overrides, visibleProducts: [id] })
    const card = within(screen.getByTestId(`vergleich-result-${id}`))
    expect(card.getByText(label)).toBeInTheDocument()
    expect(card.getByText(lifelong ? 'Auch wenn du älter wirst.' : 'Danach endet diese Auszahlung.')).toBeInTheDocument()
  })

  it('uses supplied nominal net, real fees and the effective fair-comparison anchor', () => {
    const assumptions = { ...defaultAssumptions, visibleProducts: ['etf' as const], equalInputAmountEUR: 257,
      etf: { ...defaultAssumptions.etf, annualAssetFee: 0.0037 } }
    const simulation = renderResult(assumptions)
    const product = simulation.products.find((product) => product.productId === 'etf' && product.scenarioId === 'basis')!
    const card = within(screen.getByTestId('vergleich-result-etf'))
    expect(card.getByText(formatCurrency(product.netMonthlyPayout).replaceAll('\u00a0', ' '))).toBeInTheDocument()
    fireEvent.click(card.getByText('Annahmen ansehen'))
    expect(card.getByText('Fondskosten 0,37 % p. a.')).toBeInTheDocument()
    expect(card.getByText(`${formatCurrency(simulation.bavFunding.monthlyNetCost, 2).replaceAll('\u00a0', ' ')} / Monat`)).toBeInTheDocument()
    expect(screen.getByText(/Beträge zum Rentenbeginn \(nominal\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Beträge in heutigen Euro/)).not.toBeInTheDocument()
  })
})
