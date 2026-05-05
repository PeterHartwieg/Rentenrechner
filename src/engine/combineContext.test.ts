/**
 * Unit tests for `buildCombineContext` — the shared combine-context builder.
 *
 * These tests pin the output shape and key routing decisions for representative
 * health-insurance / pension-type combinations. They must pass whenever the
 * routing logic is changed to guard against drift between the combine-simulation
 * hook and the recommender.
 *
 * Covered cases:
 *   1. GKV member with KVdR → 'kvdr_half_rate' KV channel, 'kvdr' health status.
 *   2. GKV member with freiwillig status → 'kvdr_half_rate' KV channel (GRV),
 *      'freiwillig_gkv' health status.
 *   3. PKV member (GRV) → 'none' KV channel (PKV pays no statutory KV/PV),
 *      'pkv' health status.
 *   4. Versorgungswerk member (GKV) → 'versorgungsbezug_full_rate' KV channel.
 *   5. Beamtenpension (GKV) → 'beamten_versorgungsbezug' tax channel,
 *      'versorgungsbezug_full_rate' KV channel.
 *   6. pensionBaselineType 'none' → all channels 'none'.
 *   7. Zero gross monthly pension → all channels 'none'.
 *   8. retirementYear is computed from rules.year + (retirementAge - age).
 */

import { describe, expect, it } from 'vitest'
import { buildCombineContext } from './combineContext'
import { defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { CombineContextInputs } from './combineContext'
import type { PersonalProfile } from '../domain'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gkvProfile(overrides?: Partial<PersonalProfile>): PersonalProfile {
  return {
    ...(defaultProfile as PersonalProfile),
    publicHealthInsurance: true,
    age: 40,
    retirementAge: 67,
    ...overrides,
  }
}

function pkvProfile(overrides?: Partial<PersonalProfile>): PersonalProfile {
  return {
    ...(defaultProfile as PersonalProfile),
    publicHealthInsurance: false,
    age: 40,
    retirementAge: 67,
    ...overrides,
  }
}

function baseInputs(
  profile: PersonalProfile,
  overrides?: Partial<CombineContextInputs>,
): CombineContextInputs {
  return {
    profile,
    rules: de2026Rules,
    statutoryPension: {
      pensionBaselineType: 'grv',
      manualMonthlyGross: null,
      currentEntgeltpunkte: 30,
      includeGrvReduction: false,
      retirementHealthStatus: 'kvdr',
    },
    grvGrossMonthlyPension: 1500,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. GKV / KVdR (default GRV member)
// ---------------------------------------------------------------------------

describe('buildCombineContext — GKV member / GRV / KVdR', () => {
  it('routes statutory pension through kvdr_half_rate KV channel', () => {
    const ctx = buildCombineContext(baseInputs(gkvProfile()))
    expect(ctx.statutoryPensionTaxChannel).toBe('statutory_pension')
    expect(ctx.statutoryPensionKvChannel).toBe('kvdr_half_rate')
  })

  it('sets retirementHealthStatus to kvdr', () => {
    const ctx = buildCombineContext(baseInputs(gkvProfile()))
    expect(ctx.retirementHealthStatus).toBe('kvdr')
  })

  it('computes retirementYear from rules.year + (retirementAge - age)', () => {
    const profile = gkvProfile({ age: 45, retirementAge: 67 })
    const ctx = buildCombineContext(baseInputs(profile))
    expect(ctx.retirementYear).toBe(de2026Rules.year + (67 - 45))
  })

  it('passes grvGrossMonthlyPension through unchanged', () => {
    const ctx = buildCombineContext(baseInputs(gkvProfile(), { grvGrossMonthlyPension: 2000 }))
    expect(ctx.grvGrossMonthlyPension).toBe(2000)
  })
})

// ---------------------------------------------------------------------------
// 2. GKV / freiwillig
// ---------------------------------------------------------------------------

describe('buildCombineContext — GKV member / GRV / freiwillig', () => {
  it('sets retirementHealthStatus to freiwillig_gkv when workspace flag says so', () => {
    const inputs = baseInputs(gkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'grv',
        manualMonthlyGross: null,
        currentEntgeltpunkte: 30,
        includeGrvReduction: false,
        retirementHealthStatus: 'freiwillig_gkv',
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.retirementHealthStatus).toBe('freiwillig_gkv')
    // KV channel: still kvdr_half_rate for GRV (channel is about pension type,
    // not about freiwillig vs. KVdR — the freiwillig flag affects per-instance
    // routing inside combinePortfolio, not the statutory channel assignment).
    expect(ctx.statutoryPensionKvChannel).toBe('kvdr_half_rate')
    expect(ctx.statutoryPensionTaxChannel).toBe('statutory_pension')
  })
})

// ---------------------------------------------------------------------------
// 3. PKV member (GRV)
// ---------------------------------------------------------------------------

describe('buildCombineContext — PKV member / GRV', () => {
  it('sets KV channel to none (no statutory KV/PV for PKV holders)', () => {
    const ctx = buildCombineContext(baseInputs(pkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'grv',
        manualMonthlyGross: null,
        currentEntgeltpunkte: 30,
        includeGrvReduction: false,
        retirementHealthStatus: 'pkv',
      },
    }))
    expect(ctx.statutoryPensionKvChannel).toBe('none')
    expect(ctx.retirementHealthStatus).toBe('pkv')
  })

  it('still uses statutory_pension tax channel for GRV regardless of PKV', () => {
    const ctx = buildCombineContext(baseInputs(pkvProfile()))
    expect(ctx.statutoryPensionTaxChannel).toBe('statutory_pension')
  })
})

// ---------------------------------------------------------------------------
// 4. Versorgungswerk (GKV)
// ---------------------------------------------------------------------------

describe('buildCombineContext — Versorgungswerk / GKV', () => {
  it('routes through versorgungsbezug_full_rate KV channel', () => {
    const inputs = baseInputs(gkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'versorgungswerk',
        manualMonthlyGross: null,
        currentEntgeltpunkte: 30,
        includeGrvReduction: false,
        retirementHealthStatus: 'kvdr',
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.statutoryPensionTaxChannel).toBe('statutory_pension')
    expect(ctx.statutoryPensionKvChannel).toBe('versorgungsbezug_full_rate')
  })

  it('PKV Versorgungswerk member gets none KV channel', () => {
    const inputs = baseInputs(pkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'versorgungswerk',
        manualMonthlyGross: null,
        currentEntgeltpunkte: 30,
        includeGrvReduction: false,
        retirementHealthStatus: 'pkv',
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.statutoryPensionKvChannel).toBe('none')
    expect(ctx.retirementHealthStatus).toBe('pkv')
  })
})

// ---------------------------------------------------------------------------
// 5. Beamtenpension (GKV)
// ---------------------------------------------------------------------------

describe('buildCombineContext — Beamtenpension / GKV', () => {
  it('routes through beamten_versorgungsbezug tax channel', () => {
    const inputs = baseInputs(gkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'beamtenpension',
        manualMonthlyGross: 3000,
        currentEntgeltpunkte: 0,
        includeGrvReduction: false,
        retirementHealthStatus: 'kvdr',
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.statutoryPensionTaxChannel).toBe('beamten_versorgungsbezug')
    expect(ctx.statutoryPensionKvChannel).toBe('versorgungsbezug_full_rate')
  })

  it('PKV Beamte get none KV channel', () => {
    const inputs = baseInputs(pkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'beamtenpension',
        manualMonthlyGross: 3000,
        currentEntgeltpunkte: 0,
        includeGrvReduction: false,
        retirementHealthStatus: 'pkv',
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.statutoryPensionTaxChannel).toBe('beamten_versorgungsbezug')
    expect(ctx.statutoryPensionKvChannel).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// 6. pensionBaselineType 'none'
// ---------------------------------------------------------------------------

describe('buildCombineContext — pensionBaselineType none', () => {
  it('routes all channels to none when type is none', () => {
    const inputs = baseInputs(gkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'none',
        manualMonthlyGross: 0,
        currentEntgeltpunkte: 0,
        includeGrvReduction: false,
      },
      grvGrossMonthlyPension: 500,
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.statutoryPensionTaxChannel).toBe('none')
    expect(ctx.statutoryPensionKvChannel).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// 7. Zero gross pension → all channels none
// ---------------------------------------------------------------------------

describe('buildCombineContext — zero grvGrossMonthlyPension', () => {
  it('routes all channels to none when gross is 0', () => {
    const ctx = buildCombineContext(baseInputs(gkvProfile(), { grvGrossMonthlyPension: 0 }))
    expect(ctx.statutoryPensionTaxChannel).toBe('none')
    expect(ctx.statutoryPensionKvChannel).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// 8. Default retirementHealthStatus fallback
// ---------------------------------------------------------------------------

describe('buildCombineContext — retirementHealthStatus fallback', () => {
  it('defaults retirementHealthStatus to kvdr when not set on the workspace', () => {
    const inputs = baseInputs(gkvProfile(), {
      statutoryPension: {
        pensionBaselineType: 'grv',
        manualMonthlyGross: null,
        currentEntgeltpunkte: 30,
        includeGrvReduction: false,
        // retirementHealthStatus deliberately omitted
      },
    })
    const ctx = buildCombineContext(inputs)
    expect(ctx.retirementHealthStatus).toBe('kvdr')
  })
})
