// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveRuleYear } from './rules'
import { activeRules } from '../rules'

describe('resolveRuleYear', () => {
  it('omitted year resolves successfully with activeRules.year', () => {
    const result = resolveRuleYear()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.ruleYear).toBe(activeRules.year)
      expect(result.data.rules).toBe(activeRules)
    }
  })

  it('explicit supported year (2026) succeeds', () => {
    const result = resolveRuleYear(2026)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.ruleYear).toBe(2026)
      expect(result.data.rules.year).toBe(2026)
    }
  })

  it('explicit unsupported year (9999) returns ApiError with UNSUPPORTED_RULE_YEAR', () => {
    const result = resolveRuleYear(9999)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('UNSUPPORTED_RULE_YEAR')
      expect(result.errors[0].path).toBe('ruleYear')
      expect(result.errors[0].severity).toBe('error')
    }
  })

  it('meta is always present even on error', () => {
    const result = resolveRuleYear(9999)
    expect(result.meta).toBeDefined()
    expect(result.meta!.apiVersion).toBe('v1')
  })
})
