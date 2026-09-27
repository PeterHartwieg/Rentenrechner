import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../storage'
import { addInstanceToWorkspace } from '../features/inventory/inventoryHelpers'
import { countContractsWithOwnReturn, ownReturnAnnotation } from './contractReturns'

describe('countContractsWithOwnReturn', () => {
  it('counts active and paid-up overrides, including zero, and skips offers and surrendered contracts', () => {
    let ws = structuredClone(defaultWorkspace)
    for (let i = 0; i < 4; i++) ws = addInstanceToWorkspace(ws, 'etf')
    const statuses = ['active', 'paid_up', 'offered', 'surrendered'] as const
    ws.baseline.assumptions.etf.forEach((inst, i) => Object.assign(inst, { status: statuses[i], expectedReturn: 0 }))
    expect(countContractsWithOwnReturn(ws.baseline.assumptions)).toBe(2)
    delete ws.baseline.assumptions.etf[0].expectedReturn
    expect(countContractsWithOwnReturn(ws.baseline.assumptions)).toBe(1)
  })

  it('formats the annotation in singular and plural and stays empty for none', () => {
    expect(ownReturnAnnotation(0)).toBe('')
    expect(ownReturnAnnotation(1)).toBe(' · 1 Vertrag mit eigener Rendite')
    expect(ownReturnAnnotation(3)).toBe(' · 3 Verträge mit eigener Rendite')
  })
})
