import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../../data/defaultScenario'
import { recommendNextEuro } from '../recommender'
import { makeBavCandidate } from './bav'
import { makeEtfCandidate } from './etf'
import { makeInsuranceCandidate } from './insurance'
import { makeRiesterTopUpCandidate } from './riester'
import { buildBerndWorkspace, buildGeneratorContext } from './testHelpers'
import type { GeneratorContext } from './types'

function buildReturnWorkspace() {
  const ws = buildBerndWorkspace()
  ws.baseline.profile.age = 37
  ws.baseline.profile.retirementAge = 67
  ws.baseline.assumptions.insurance = [{
    ...defaultAssumptions.insurance,
    instanceId: 'insurance-fixed',
    label: 'Versicherung',
    status: 'active',
    contractStartYear: 2020,
    evidenceMap: {},
    monthlyContribution: 50,
  }]
  ws.baseline.assumptions.riester = [{
    ...defaultAssumptions.riester,
    instanceId: 'riester-fixed',
    label: 'Riester',
    status: 'active',
    contractStartYear: 2020,
    evidenceMap: {},
    monthlyOwnContribution: 50,
  }]
  return ws
}

function recommendations(g: GeneratorContext) {
  return recommendNextEuro({
    ...g,
    grvGrossMonthlyPension: g.combineCtx.grvGrossMonthlyPension,
  })
}

const targets = [
  { slot: 'etf', status: 'active', generate: makeEtfCandidate },
  { slot: 'bav', status: 'active', generate: makeBavCandidate },
  { slot: 'insurance', status: 'active', generate: makeInsuranceCandidate },
  { slot: 'riester', status: 'active', generate: makeRiesterTopUpCandidate },
  { slot: 'bav', status: 'offered', generate: makeBavCandidate },
  { slot: 'insurance', status: 'offered', generate: makeInsuranceCandidate },
] as const

describe.each(targets)('fixed return for $status $slot candidates', ({ slot, status, generate }) => {
  function contexts() {
    const ws = buildReturnWorkspace()
    ws.baseline.assumptions[slot][0].status = status
    // Reference: identical target with no override in a zero-return scenario.
    ws.baseline.assumptions.returnScenarios = ws.baseline.assumptions.returnScenarios
      .map((scenario) => ({ ...scenario, annualReturn: 0 }))
    const reference = buildGeneratorContext(ws, 100)
    const fixedWs = structuredClone(ws)
    fixedWs.baseline.assumptions[slot][0].expectedReturn = 0
    fixedWs.baseline.assumptions.returnScenarios = fixedWs.baseline.assumptions.returnScenarios
      .map((scenario) => ({ ...scenario, annualReturn: 0.07 }))
    return { reference, fixed: buildGeneratorContext(fixedWs, 100) }
  }

  it('projects the same result as the target rate selected without an override', () => {
    const { reference, fixed } = contexts()
    const expected = generate(reference)
    const actual = generate(fixed)
    expect(expected).not.toBeNull()
    expect(actual).not.toBeNull()
    expect(actual!.candidateResult).toEqual(expected!.candidateResult)
    if (status === 'offered') expect(actual!.id).toMatch(/^activate_/)
  })

  it('uses the target rate for the seeded P10 capital score', () => {
    const { reference, fixed } = contexts()
    const targetId = fixed.workspace.baseline.assumptions[slot][0].instanceId
    const expected = recommendations(reference).find((c) => c.targetInstanceId === targetId)
    const actual = recommendations(fixed).find((c) => c.targetInstanceId === targetId)
    expect(expected).toBeDefined()
    expect(actual).toBeDefined()
    expect(actual!.riskScoreP10).toBe(expected!.riskScoreP10)
  })
})

it('new bAV, AVD and Basisrente candidates keep the shared rate despite other contract overrides', () => {
  const ws = buildReturnWorkspace()
  ws.baseline.assumptions.bav = []
  const reference = recommendations(buildGeneratorContext(ws, 100))
  const fixedWs = structuredClone(ws)
  fixedWs.baseline.assumptions.etf[0].expectedReturn = 0
  const actual = recommendations(buildGeneratorContext(fixedWs, 100))
  for (const productId of ['bav', 'altersvorsorgedepot', 'basisrente']) {
    const before = reference.find((c) => c.productId === productId)
    const after = actual.find((c) => c.productId === productId)
    expect(before).toBeDefined()
    expect(after?.isNewInstance).toBe(true)
    expect(after?.capitalAtRetirement).toBe(before!.capitalAtRetirement)
    expect(after?.riskScoreP10).toBe(before!.riskScoreP10)
  }
})
