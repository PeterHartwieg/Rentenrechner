// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { de2026Rules as rules } from '../../rules/de2026'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { generateContractDecisions } from '../../app/contractDecisions'
import { VertragScenarioTable } from './VertragScenarioTable'

it('shows unavailable applied surrender values while the annuity baseline remains numeric', () => {
  const workspace = migrateV1ToV2({ ...defaultProfile, age: 50, retirementAge: 67 }, defaultAssumptions as unknown as Record<string, unknown>)
  const a = workspace.baseline.assumptions
  a.bav = []; a.basisrente = []; a.altersvorsorgedepot = []; a.riester = []
  Object.assign(a.insurance[0], { currentValueEUR: 100000, monthlyContribution: 0, contractStartYear: 2020, payoutMode: 'leibrente' })
  Object.assign(a.etf[0], { currentValueEUR: 0, monthlyContribution: 0 })
  const instance = a.insurance[0]
  const decision = generateContractDecisions(workspace, instance.instanceId).find((d) => d.kind === 'uebertragen' && d.targetInstanceId === a.etf[0].instanceId)!
  const bundle = runCombineSimulation(workspace, rules)
  render(<VertragScenarioTable workspace={workspace} instance={instance} productId="versicherung" rules={rules} scenarioId="basis" combinedForScenario={bundle.combinedByScenarioId.basis} />)
  const row = screen.getByText(decision.label).closest('tr')!
  const cells = row.querySelectorAll('td')
  expect(cells[2].textContent).toBe('—')
  expect(cells[3].textContent).toBe('—')
  expect(cells[1].textContent).toMatch(/Historische Steuerdaten/)
  const baseline = document.querySelector('.vertrag-scenario-row--current')!
  expect(baseline.querySelectorAll('td')[2].textContent).toMatch(/€/)
})
