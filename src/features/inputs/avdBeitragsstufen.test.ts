import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../../rules/de2026'
import { defaultAssumptions } from '../../data/defaultScenario'
import { buildAvdBeitragsstufen } from './avdBeitragsstufen'

const RULES = de2026Rules
const BASE = defaultAssumptions.altersvorsorgedepot.eligibility

describe('buildAvdBeitragsstufen — values derive from the rules', () => {
  it('produces the four statutory levels for the default eligibility', () => {
    const stufen = buildAvdBeitragsstufen(RULES, BASE)
    expect(stufen.map((s) => s.value)).toEqual([10, 30, 150, 525])
  })

  it('tracks the rules rather than hardcoded numbers', () => {
    // Halve the statutory thresholds; every level must halve with them. A
    // literal 10/30/150 in the module would survive this and fail here.
    const doubled = {
      ...RULES,
      altersvorsorgedepot: {
        ...RULES.altersvorsorgedepot,
        minimumOwnContributionAnnual: RULES.altersvorsorgedepot.minimumOwnContributionAnnual * 2,
        basicAllowanceTier1MaxContribution:
          RULES.altersvorsorgedepot.basicAllowanceTier1MaxContribution * 2,
        basicAllowanceTier2MaxContribution:
          RULES.altersvorsorgedepot.basicAllowanceTier2MaxContribution * 2,
      },
    }
    const stufen = buildAvdBeitragsstufen(doubled, BASE)
    expect(stufen[0].value).toBe(20)
    expect(stufen[1].value).toBe(60)
    expect(stufen[2].value).toBe(300)
  })

  it('derives the tier-1 percentage in the label instead of writing it out', () => {
    const halfRate = {
      ...RULES,
      altersvorsorgedepot: { ...RULES.altersvorsorgedepot, basicAllowanceTier1Rate: 0.25 },
    }
    const stufen = buildAvdBeitragsstufen(halfRate, BASE)
    expect(stufen[1].label).toContain('25')
    expect(stufen[1].label).not.toContain('50')
  })

  it('contains no statutory literals in the module source', () => {
    // Guards the P0 in CLAUDE.md ("statutory values hardcoded outside src/rules/").
    const source = readFileSync(new URL('./avdBeitragsstufen.ts', import.meta.url), 'utf8')
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const forbidden of ['120', '360', '1800', '1_800', '540', '6840', '6_840']) {
      expect(body).not.toContain(forbidden)
    }
  })
})

describe('buildAvdBeitragsstufen — Vertragsrahmen tracks eligibility', () => {
  it.each([
    [0, 525],
    [1, 500],
    [2, 475],
  ])('drops to %s children -> %s EUR/month', (eligibleChildren, expected) => {
    const stufen = buildAvdBeitragsstufen(RULES, { ...BASE, eligibleChildren })
    expect(stufen.at(-1)?.label).toBe('Vertragsrahmen')
    expect(stufen.at(-1)?.value).toBeCloseTo(expected, 6)
  })

  it('accounts for an unused career-starter bonus', () => {
    // The mockup's flat (6840 - 540 - 300*kids)/12 formula misses this: the
    // bonus is part of the allowance sum that the contract ceiling covers.
    const young = { ...BASE, ageAtContractStart: 22, careerStarterBonusUsed: false }
    const stufen = buildAvdBeitragsstufen(RULES, young)
    expect(stufen.at(-1)?.value).toBeCloseTo(508.3333, 3)
  })

  it('accounts for indirect spouse eligibility', () => {
    const spouse = { ...BASE, indirectSpouseEligible: true }
    const stufen = buildAvdBeitragsstufen(RULES, spouse)
    expect(stufen.at(-1)?.value).toBeCloseTo(510.4167, 3)
  })
})

describe('buildAvdBeitragsstufen — degenerate ceilings', () => {
  it('drops levels above the Vertragsrahmen instead of offering impossible cards', () => {
    // Enough children that the ceiling falls below the full-allowance level.
    const manyKids = { ...BASE, eligibleChildren: 20 }
    const stufen = buildAvdBeitragsstufen(RULES, manyKids)
    const ceiling = stufen.at(-1)?.value ?? 0
    for (const s of stufen) {
      expect(s.value).toBeLessThanOrEqual(ceiling)
    }
  })

  it('never returns duplicate values', () => {
    for (const eligibleChildren of [0, 1, 2, 3, 5, 10, 20]) {
      const values = buildAvdBeitragsstufen(RULES, { ...BASE, eligibleChildren }).map((s) => s.value)
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it('returns ascending values', () => {
    const values = buildAvdBeitragsstufen(RULES, BASE).map((s) => s.value)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })
})
