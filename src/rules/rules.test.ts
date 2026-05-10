// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as rulesExports from './index'

describe('src/rules/index.ts — RULES_YEAR export', () => {
  it('exports RULES_YEAR as a number so public pages can interpolate it without hardcoding', () => {
    // This fails until RULES_YEAR (or equivalent) is exported from src/rules/index.ts.
    // Public pages currently hardcode the string "2026" — when de2027.ts lands,
    // every page needs a manual edit. A named RULES_YEAR export is the single
    // place to change. See issue #144.
    expect('RULES_YEAR' in rulesExports).toBe(true)
    const year = (rulesExports as Record<string, unknown>).RULES_YEAR
    expect(typeof year).toBe('number')
  })

  it('RULES_YEAR equals activeRules.year', () => {
    const year = (rulesExports as Record<string, unknown>).RULES_YEAR
    expect(year).toBe(rulesExports.activeRules.year)
  })
})
