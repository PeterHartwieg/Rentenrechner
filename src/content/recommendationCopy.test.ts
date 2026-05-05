/**
 * Tests for the copy-rendering layer (recommendationCopy.ts).
 *
 * These tests are intentionally separate from recommendations.test.ts, which
 * tests rule evaluation (runRules, atom output, AtomId presence/priority).
 *
 * Separation principle:
 *   - Rule behavior tests (in recommendations.test.ts): assert on atom ids,
 *     priority, and context values — NOT on German text.
 *   - Copy rendering tests (here): assert on text output of renderAtom —
 *     NOT on which atoms rules emit.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderAtom, ctxString, ctxNumber, type AtomTemplate } from './recommendationCopy'
import type { Atom, AtomId } from '../app/recommendations'

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeAtom(id: AtomId, context: Record<string, unknown> = {}): Atom {
  return { id, priority: 'medium', context }
}

// ---------------------------------------------------------------------------
// renderAtom — public contract
// ---------------------------------------------------------------------------

describe('renderAtom', () => {
  it('returns non-empty headline and body for every known atom id', () => {
    const knownIds: AtomId[] = [
      'sensitivity_rankings_disagree',
      'sensitivity_narrow_capital_gap',
      'sensitivity_high_fee_winner',
      'sensitivity_default',
      'reason_employer_subsidy',
      'reason_low_fees',
      'reason_high_fees',
      'reason_tax_deferral',
      'reason_flexible_capital',
      'reason_subsidies',
      'reason_guarantee',
      'bav_cap_remaining',
      'basisrente_cap_remaining',
      'riester_cap_remaining',
      'avd_cap_remaining',
      'sparerpauschbetrag_remaining',
      'pre_2005_pav_taxfree_capital',
      'halbeinkuenfte_pav_eligible',
      'pre_2005_pav_high_garantiezins',
      'bav_40b_alt_eligible',
      'bav_40b_alt_conditions_unmet',
      'bav_durchfuehrungsweg_direktzusage',
      'riester_pre_2008_zulage',
      'lose_pre_2005_privilege',
      'paid_up_high_fee_warning',
      'riester_to_avd_certified',
    ]

    for (const id of knownIds) {
      const atom = makeAtom(id)
      const result = renderAtom(atom)
      expect(result.headline, `${id} headline`).toBeTruthy()
      expect(result.body, `${id} body`).toBeTruthy()
    }
  })

  it('returns empty-string fallback for an unknown id — never throws', () => {
    const atom = makeAtom('completely_unknown_atom_id' as AtomId)
    expect(() => renderAtom(atom)).not.toThrow()
    const result = renderAtom(atom)
    expect(result.headline).toBe('')
    expect(result.body).toBe('')
    expect(result.cta).toBeUndefined()
  })

  it('warns in dev mode for unknown atom id', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const atom = makeAtom('warn_unknown_id' as AtomId)
    renderAtom(atom)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('warn_unknown_id'))
    consoleSpy.mockRestore()
  })

  it('sensitivity_rankings_disagree includes both product labels in body', () => {
    const atom = makeAtom('sensitivity_rankings_disagree', {
      bestCapitalId: 'etf',
      bestCapitalLabel: 'ETF-Depot',
      bestPensionId: 'bav',
      bestPensionLabel: 'bAV',
    })
    const result = renderAtom(atom)
    expect(result.body).toContain('ETF-Depot')
    expect(result.body).toContain('bAV')
  })

  it('sensitivity_narrow_capital_gap includes runner label in body', () => {
    const atom = makeAtom('sensitivity_narrow_capital_gap', {
      winnerId: 'etf',
      winnerLabel: 'ETF',
      runnerId: 'bav',
      runnerLabel: 'bAV-Tarif',
      gapPct: 0.03,
    })
    const result = renderAtom(atom)
    expect(result.body).toContain('bAV-Tarif')
  })

  it('sensitivity_high_fee_winner formats riy as percentage string', () => {
    const atom = makeAtom('sensitivity_high_fee_winner', { riyDecimal: 0.016 })
    const result = renderAtom(atom)
    expect(result.body).toContain('1.60')
  })

  it('reason_high_fees body differs by productId — basisrente vs versicherung vs default', () => {
    const basisrente = renderAtom(makeAtom('reason_high_fees', { productId: 'basisrente' }))
    const versicherung = renderAtom(makeAtom('reason_high_fees', { productId: 'versicherung' }))
    const bav = renderAtom(makeAtom('reason_high_fees', { productId: 'bav' }))

    expect(basisrente.body).toContain('Kapitalwahlrecht')
    expect(versicherung.body).toContain('1,2 %')
    expect(bav.body).not.toContain('Kapitalwahlrecht')
    expect(bav.body).not.toContain('1,2 %')
  })

  it('reason_tax_deferral body differs by productId — basisrente vs bav', () => {
    const basisrente = renderAtom(makeAtom('reason_tax_deferral', { productId: 'basisrente' }))
    const bav = renderAtom(makeAtom('reason_tax_deferral', { productId: 'bav' }))
    expect(basisrente.body).toContain('Sonderausgabenabzug')
    expect(bav.body).toContain('SV-Ersparnis')
  })

  it('reason_subsidies body differs for altersvorsorgedepot, riester with employer, riester without', () => {
    const avd = renderAtom(makeAtom('reason_subsidies', { productId: 'altersvorsorgedepot' }))
    const riesterWithEmployer = renderAtom(makeAtom('reason_subsidies', { productId: 'riester', hasEmployerContribution: true }))
    const riesterDefault = renderAtom(makeAtom('reason_subsidies', { productId: 'riester' }))

    expect(avd.body).toContain('gebunden bis Rentenbeginn')
    expect(riesterWithEmployer.body).toContain('ggf. zusätzlicher Steuervorteil')
    expect(riesterDefault.body).toContain('Grund- und Kinderzulagen')
  })

  it('bav_cap_remaining body shows used percentage and remaining amount', () => {
    const atom = makeAtom('bav_cap_remaining', { usedPct: 0.65, remainingMonthly: 236 })
    const result = renderAtom(atom)
    expect(result.body).toContain('65 %')
    expect(result.body).toContain('236')
  })

  it('bav_cap_remaining body mentions basisrente when nextLeverProductId is set', () => {
    const withLever = makeAtom('bav_cap_remaining', {
      usedPct: 1.0,
      remainingMonthly: 0,
      nextLeverProductId: 'basisrente',
    })
    const withoutLever = makeAtom('bav_cap_remaining', {
      usedPct: 0.5,
      remainingMonthly: 300,
    })
    expect(renderAtom(withLever).body).toContain('Rürup')
    expect(renderAtom(withoutLever).body).not.toContain('Rürup')
  })

  it('sparerpauschbetrag_remaining body differs for single vs married', () => {
    const single = renderAtom(makeAtom('sparerpauschbetrag_remaining', {
      usedAnnual: 0,
      remainingAnnual: 1000,
      married: false,
    }))
    const married = renderAtom(makeAtom('sparerpauschbetrag_remaining', {
      usedAnnual: 400,
      remainingAnnual: 1600,
      married: true,
    }))
    expect(single.body).toContain('1.000 €')
    expect(married.body).toContain('2.000 €')
    expect(married.body).toContain('400')
  })

  it('paid_up_high_fee_warning formats riy correctly', () => {
    const atom = makeAtom('paid_up_high_fee_warning', { riyDecimal: 0.025 })
    const result = renderAtom(atom)
    expect(result.body).toContain('2.50')
  })
})

// ---------------------------------------------------------------------------
// ctxString and ctxNumber — context accessor helpers
// ---------------------------------------------------------------------------

describe('ctxString', () => {
  it('returns the string value for a matching key', () => {
    expect(ctxString({ foo: 'bar' }, 'foo')).toBe('bar')
  })

  it('returns empty string when key is missing', () => {
    expect(ctxString({}, 'missing')).toBe('')
  })

  it('returns empty string when value is not a string', () => {
    expect(ctxString({ n: 42 }, 'n')).toBe('')
  })

  it('warns in dev mode when value is not a string', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    ctxString({ n: 42 }, 'n')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("'n'"),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })
})

describe('ctxNumber', () => {
  it('returns the number value for a matching key', () => {
    expect(ctxNumber({ rate: 0.05 }, 'rate')).toBe(0.05)
  })

  it('returns 0 when key is missing', () => {
    expect(ctxNumber({}, 'missing')).toBe(0)
  })

  it('returns 0 when value is not a number', () => {
    expect(ctxNumber({ s: 'hello' }, 's')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Snapshot — text output of all known atom ids (regression guard for copy)
// ---------------------------------------------------------------------------

describe('renderAtom copy snapshot', () => {
  const representativeAtoms: Array<{ id: AtomId; context: Record<string, unknown> }> = [
    { id: 'sensitivity_rankings_disagree', context: { bestCapitalLabel: 'ETF', bestPensionLabel: 'bAV' } },
    { id: 'sensitivity_narrow_capital_gap', context: { runnerLabel: 'bAV' } },
    { id: 'sensitivity_high_fee_winner', context: { riyDecimal: 0.016 } },
    { id: 'sensitivity_default', context: { text: 'Hebel...' } },
    { id: 'reason_employer_subsidy', context: {} },
    { id: 'reason_low_fees', context: {} },
    { id: 'reason_high_fees', context: { productId: 'bav' } },
    { id: 'reason_high_fees', context: { productId: 'versicherung' } },
    { id: 'reason_high_fees', context: { productId: 'basisrente' } },
    { id: 'reason_tax_deferral', context: { productId: 'bav' } },
    { id: 'reason_tax_deferral', context: { productId: 'basisrente' } },
    { id: 'reason_flexible_capital', context: {} },
    { id: 'reason_subsidies', context: { productId: 'altersvorsorgedepot' } },
    { id: 'reason_subsidies', context: { productId: 'riester' } },
    { id: 'reason_subsidies', context: { productId: 'riester', hasEmployerContribution: true } },
    { id: 'reason_guarantee', context: {} },
    { id: 'bav_cap_remaining', context: { usedPct: 0.65, remainingMonthly: 236 } },
    { id: 'bav_cap_remaining', context: { usedPct: 1.0, remainingMonthly: 0, nextLeverProductId: 'basisrente' } },
    { id: 'basisrente_cap_remaining', context: { usedPct: 0.3, remainingAnnual: 15_000 } },
    { id: 'riester_cap_remaining', context: { usedPct: 0.5, allowanceCovered: 175, topUpToCap: 750 } },
    { id: 'avd_cap_remaining', context: { usedPct: 0.35, remainingMonthly: 370 } },
    { id: 'sparerpauschbetrag_remaining', context: { usedAnnual: 0, remainingAnnual: 1_000, married: false } },
    { id: 'sparerpauschbetrag_remaining', context: { usedAnnual: 400, remainingAnnual: 1_600, married: true } },
    { id: 'pre_2005_pav_taxfree_capital', context: {} },
    { id: 'halbeinkuenfte_pav_eligible', context: {} },
    { id: 'pre_2005_pav_high_garantiezins', context: {} },
    { id: 'bav_40b_alt_eligible', context: {} },
    { id: 'bav_40b_alt_conditions_unmet', context: {} },
    { id: 'bav_durchfuehrungsweg_direktzusage', context: {} },
    { id: 'riester_pre_2008_zulage', context: {} },
    { id: 'lose_pre_2005_privilege', context: {} },
    { id: 'paid_up_high_fee_warning', context: { riyDecimal: 0.02 } },
    { id: 'riester_to_avd_certified', context: {} },
  ]

  it('copy output matches snapshot for all representative atoms', () => {
    const snapshot: Array<{ id: AtomId; context: Record<string, unknown>; rendered: AtomTemplate }> =
      representativeAtoms.map(({ id, context }) => ({
        id,
        context,
        rendered: renderAtom({ id, priority: 'medium', context }),
      }))
    expect(snapshot).toMatchSnapshot()
  })
})
