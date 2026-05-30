import { describe, it, expect, vi } from 'vitest'
import { diffInstancePatch, makeInstancePatcher } from './instancePatch'

describe('diffInstancePatch', () => {
  it('returns only the keys whose value changed', () => {
    const prev = { a: 1, b: 'x', c: true }
    const next = { a: 2, b: 'x', c: true }
    expect(diffInstancePatch(prev, next)).toEqual({ a: 2 })
  })

  it('returns an empty patch when nothing changed', () => {
    const prev = { a: 1, b: 'x' }
    expect(diffInstancePatch(prev, { ...prev })).toEqual({})
  })

  it('captures every changed key', () => {
    expect(diffInstancePatch({ a: 1, b: 2 }, { a: 9, b: 8 })).toEqual({
      a: 9,
      b: 8,
    })
  })
})

describe('makeInstancePatcher', () => {
  it('dispatches only the changed keys', () => {
    const patchInstance = vi.fn()
    makeInstancePatcher({ a: 1, b: 2 }, patchInstance)({ a: 1, b: 5 })
    expect(patchInstance).toHaveBeenCalledWith({ b: 5 })
  })

  it('does not dispatch when the instance is unchanged', () => {
    const patchInstance = vi.fn()
    makeInstancePatcher({ a: 1 }, patchInstance)({ a: 1 })
    expect(patchInstance).not.toHaveBeenCalled()
  })
})
