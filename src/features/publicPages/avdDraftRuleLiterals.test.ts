import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { activeRules } from '../../rules'
import { AVD_GESETZ_PAGE_COPY } from '../../content/avdDraftPageCopy'
import anbieterFaq from './altersvorsorgedepot-anbieter.faq.json'
import gesetzFaq from './altersvorsorgedepot-gesetz.faq.json'
import {
  AVD_BASIC_ALLOWANCE_MAX, AVD_CHILD_ALLOWANCE_FULL_FROM, AVD_CHILD_ALLOWANCE_MAX, AVD_CHILD_ALLOWANCE_RATE,
  AVD_INDIRECT_SPOUSE_ALLOWANCE_MAX, AVD_MINIMUM_OWN_CONTRIBUTION, AVD_PARTIAL_CAPITAL_MAX, AVD_PAYOUT_MAX_AGE,
  AVD_PAYOUT_MIN_AGE, AVD_PAYOUT_PLAN_END_AGE, AVD_SPECIAL_EXPENSE_OWN_CAP, AVD_STANDARD_COST_CAP,
  AVD_TIER_1_MAX, AVD_TIER_1_RATE, AVD_TIER_2_MAX, AVD_TIER_2_RATE, AVD_TIER_2_START,
  AVD_TRANSFER_COST_NEW_PROVIDER, AVD_TRANSFER_COST_OLD_PROVIDER, EX3, EX3_YEARS,
} from './avdDraftRuleCopy'

/**
 * P0 guard for the AV-Depot draft pages: statutory amounts come from
 * src/rules. The two MDX bodies render them from avdDraftRuleCopy.ts; the
 * .faq.json files (visible FAQ + FAQPage JSON-LD) cannot import, so their
 * amounts are pinned here. A rule change fails this test until the JSON is
 * updated.
 */

const answer = (faq: { q: string; a: string }[], q: string) => {
  const item = faq.find((f) => f.q === q)
  expect(item, q).toBeDefined()
  return item?.a ?? ''
}

describe('altersvorsorgedepot-gesetz.faq.json amounts match src/rules', () => {
  it.each([
    ['Wer ist förderberechtigt?', [`Grundzulage von höchstens ${AVD_INDIRECT_SPOUSE_ALLOWANCE_MAX} Euro`]],
    ['Wie hoch ist die Grundzulage?', [
      `${AVD_TIER_1_RATE} Prozent auf deine Beiträge bis ${AVD_TIER_1_MAX} Euro im Jahr`,
      `${AVD_TIER_2_RATE} Prozent auf Beiträge von ${AVD_TIER_2_START} bis ${AVD_TIER_2_MAX} Euro`,
      `höchstens ${AVD_BASIC_ALLOWANCE_MAX} Euro im Jahr`,
    ]],
    ['Wie hoch ist die Kinderzulage?', [
      `${AVD_CHILD_ALLOWANCE_RATE} Prozent deiner Beiträge, höchstens ${AVD_CHILD_ALLOWANCE_MAX} Euro im Jahr`,
      `ab ${AVD_CHILD_ALLOWANCE_FULL_FROM} Euro Eigenbeitrag`,
    ]],
    ['Wie viel muss ich mindestens einzahlen?', [`mindestens ${AVD_MINIMUM_OWN_CONTRIBUTION} Euro im Jahr`]],
    ['Ab wann wird ausgezahlt?', [
      `frühestens mit ${AVD_PAYOUT_MIN_AGE} Jahren`,
      `spätestens mit ${AVD_PAYOUT_MAX_AGE} Jahren`,
    ]],
    ['Wie wird ausgezahlt?', [
      `frühestens mit ${AVD_PAYOUT_PLAN_END_AGE} Jahren endet`,
      `Bis zu ${AVD_PARTIAL_CAPITAL_MAX} Prozent des Kapitals`,
    ]],
  ] as const)('%s', (q, phrases) => {
    const a = answer(gesetzFaq, q)
    for (const phrase of phrases) expect(a).toContain(phrase)
  })
})

describe('altersvorsorgedepot-anbieter.faq.json amounts match src/rules', () => {
  it.each([
    ['Was kostet ein Altersvorsorgedepot?', [`Effektivkosten des Standarddepots: höchstens ${AVD_STANDARD_COST_CAP} Prozent`]],
    ['Welchen Mindestbeitrag muss ich zahlen?', [`Mindesteigenbeitrag von ${AVD_MINIMUM_OWN_CONTRIBUTION} Euro im Jahr`]],
    ['Was kostet ein späterer Anbieterwechsel?', [
      `darf der bisherige Anbieter höchstens ${AVD_TRANSFER_COST_OLD_PROVIDER} Euro berechnen`,
      `Verwaltungspauschale von höchstens ${AVD_TRANSFER_COST_NEW_PROVIDER} Euro`,
    ]],
    ['Wovon hängt die Höhe der Förderung ab?', [
      `${AVD_TIER_1_RATE} Prozent auf die ersten ${AVD_TIER_1_MAX} Euro im Jahr`,
      `bis zu ${AVD_CHILD_ALLOWANCE_MAX} Euro Kinderzulage je Kind`,
    ]],
    ['Was ergibt sich bei einem Beginn kurz vor der Rente?', [
      `Wer mit ${EX3.startAge} beginnt und ab ${AVD_PAYOUT_MIN_AGE} auszahlen lässt`,
      `Bei ${EX3.contribution} Euro Eigenbeitrag und ${EX3.allowancePerYear} Euro Grundzulage im Jahr sind das ${EX3.capital} Euro`,
    ]],
    ['Was ist der Unterschied zu einem normalen ETF-Depot?', [
      `bis ${AVD_SPECIAL_EXPENSE_OWN_CAP} Euro im Jahr plus Zulagen als Sonderausgaben`,
      `Auszahlungsplan bis mindestens ${AVD_PAYOUT_PLAN_END_AGE}`,
    ]],
  ] as const)('%s', (q, phrases) => {
    const a = answer(anbieterFaq, q)
    for (const phrase of phrases) expect(a).toContain(phrase)
  })
})

describe('AV-Depot draft copy spelled out in words', () => {
  // Beispiel 3 and its FAQ say "rund sieben" Beitragsjahre (start at 58).
  it('Beispiel 3 runs seven contribution years', () => {
    expect(EX3_YEARS).toBe(7)
    expect(answer(anbieterFaq, 'Was ergibt sich bei einem Beginn kurz vor der Rente?')).toContain('rund sieben Jahre')
  })

  it('the law-page summary reads the allowance caps from the rules', () => {
    expect(AVD_GESETZ_PAGE_COPY.summary).toContain(
      `bis zu ${activeRules.altersvorsorgedepot.basicAllowanceMax.toLocaleString('de-DE')} Euro Grundzulage und bis zu ` +
      `${activeRules.altersvorsorgedepot.childAllowanceMax.toLocaleString('de-DE')} Euro Kinderzulage`,
    )
  })
})

describe('AV-Depot draft MDX bodies have no statutory literals', () => {
  // Amount-like literals (digits + €/Euro/Prozent/%/Jahre) left in the source
  // after the rule wiring. Provider entries (ending in "Stand: dd.mm.yyyy.")
  // are provider data, not law. The allowlisted rest has no rule field in
  // src/rules yet; adding one would also shift the scenario-report
  // provenance baseline, so they stay literal until a rule field exists.
  const ALLOWED: Record<string, string[]> = {
    'altersvorsorgedepot-gesetz.body.mdx': [
      '67 Jahren', // Selbständige: eligible while under 67 (no rule field)
      '100 Prozent', // Garantieprodukt: 80 or 100 % guarantee levels (no rule field)
    ],
    'altersvorsorgedepot-anbieter.body.mdx': [
      '100 Prozent', // Garantieprodukt: 80 or 100 % guarantee levels (no rule field)
      '0 Euro', // quoted provider advertising claim, not a statutory value
      '67 Jahren', // Selbständige: eligible while under 67 (no rule field)
    ],
  }

  it.each(Object.keys(ALLOWED))('%s', (file) => {
    const source = readFileSync(join(process.cwd(), 'src/features/publicPages', file), 'utf8')
    const literals = source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .split(/\r?\n/)
      .filter((line) => !/^(import|export)\b/.test(line))
      .filter((line) => !/Stand: \d{2}\.\d{2}\.\d{4}\.$/.test(line.trim()))
      .flatMap((line) => line.match(/(?<![\w{.,])\d[\d.,]*\s?(?:€|Euro\b|Prozent\b|%|Jahren?\b)/g) ?? [])
    expect(literals).toEqual(ALLOWED[file])
  })
})
