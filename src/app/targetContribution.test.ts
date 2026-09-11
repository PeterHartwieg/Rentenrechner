import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../storage'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { de2026Rules } from '../rules/de2026'
import { runCombineSimulation } from './useCombineSimulation'
import { selectPlanSummary } from './planSummary'
import { solveTargetContribution } from './targetContribution'

function fixture() {
  const ws = structuredClone(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline.profile = { ...ws.baseline.profile, age: 30, retirementAge: 67, grossSalaryYear: 50160 }
  const asm = ws.baseline.assumptions
  asm.inflationRate = 0.02
  asm.etf = [{ ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => 'etf-target01'), monthlyContribution: 270, currentValueEUR: 10000 }]
  asm.bav = []
  asm.insurance = []
  return ws
}

describe('target contribution solver', () => {
  it('finds the smallest whole-euro contribution that reaches a real-money target without changing the plan', () => {
    const ws = fixture()
    const original = structuredClone(ws)
    const bundle = runCombineSimulation(ws, de2026Rules)
    const baseline = selectPlanSummary(ws, bundle, 'basis')
    const target = baseline.netMonthlyTotalReal + 350
    const solved = solveTargetContribution(ws, de2026Rules, 'etf-target01', target)!
    expect(solved).not.toBeNull()
    expect(solved.achievedMonthlyReal).toBeGreaterThanOrEqual(target)
    const less = structuredClone(ws)
    less.baseline.assumptions.etf[0].monthlyContribution = solved.monthlyContribution - 1
    const lessSummary = selectPlanSummary(less, runCombineSimulation(less, de2026Rules), 'basis')
    expect(lessSummary.netMonthlyTotalReal).toBeLessThan(target)
    expect(solved.additionalMonthly).toBe(solved.monthlyContribution - 270)
    expect(ws).toEqual(original)
  })

  it('returns no proposed increase when the target is met, and refuses unavailable or invalid goals', () => {
    const ws = fixture()
    expect(solveTargetContribution(ws, de2026Rules, 'etf-target01', 1)?.additionalMonthly).toBe(0)
    expect(solveTargetContribution(ws, de2026Rules, 'missing', 2000)).toBeNull()
    expect(solveTargetContribution(ws, de2026Rules, 'etf-target01', NaN)).toBeNull()
    expect(solveTargetContribution(ws, de2026Rules, 'etf-target01', 1e9)).toBeNull()
  })
})
