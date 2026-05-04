import { describe, it, expect } from 'vitest'
import { PATH_OPTIONS } from '../../../content/triggers'
import { WIZARD_REGISTRY } from './wizardRegistry'

describe('WIZARD_REGISTRY', () => {
  it('has an entry for every id in PATH_OPTIONS', () => {
    for (const option of PATH_OPTIONS) {
      expect(WIZARD_REGISTRY).toHaveProperty(option.id)
      expect(WIZARD_REGISTRY[option.id]).toBeDefined()
    }
  })

  it('has no extra entries beyond what PATH_OPTIONS declares', () => {
    const registryKeys = Object.keys(WIZARD_REGISTRY)
    const pathIds = PATH_OPTIONS.map((o) => o.id)
    expect(registryKeys.sort()).toEqual(pathIds.sort())
  })
})
