// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { simulateRetirementComparison } from '../../engine/simulate'
import { de2026Rules } from '../../rules/de2026'
import { PrintReport } from './PrintReport'
import { VertragScenarioTable } from '../vertrag-detail/VertragScenarioTable'
import { formatPercent } from '../../utils/format'

afterEach(cleanup)

it('discloses fixed contract returns in the print assumptions, contract block and decision table', () => {
  const workspace = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
  const instance = workspace.baseline.assumptions.etf[0]
  instance.expectedReturn = 0.025
  instance.label = 'Mein ETF'
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const { container } = render(<>
    <PrintReport profile={defaultProfile} assumptions={defaultAssumptions}
      simulation={simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)}
      combineMode combineWorkspace={workspace} portfolio={{ ...bundle, scenarioLabels: Object.fromEntries(defaultAssumptions.returnScenarios.map(s => [s.id, s.label])) }} />
    <VertragScenarioTable workspace={workspace} instance={instance} productId="etf"
      rules={de2026Rules} scenarioId="basis" combinedForScenario={bundle.combinedByScenarioId.basis} />
  </>)
  const caption = `Rendite ${formatPercent(0.025, 1)} p. a. (vertragsspezifisch)`
  expect(container.querySelector('.pr-vertrag-block')?.parentElement?.textContent).toContain(caption)
  expect(container.querySelector('.vertrag-section')?.textContent).toContain(caption)
  const scenarioSection = Array.from(container.querySelectorAll('.pr-section'))
    .find(section => section.textContent?.startsWith('Rentenszenarien & Annahmen'))!
  expect(scenarioSection.textContent).toContain(`Mein ETF: ${formatPercent(0.025, 1)} p. a.`)
  expect(container.querySelector('.pr-methode-list')?.textContent)
    .not.toContain('Alle Produkte rechnen je Szenario mit derselben Marktrendite')
  expect(container.querySelector('#print-report')?.firstElementChild).toHaveClass('pr-disclaimer-top')
})
