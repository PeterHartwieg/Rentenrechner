import { describe, expect, it } from 'vitest'
import { activeRules } from '../rules'
import avdFaq from '../features/publicPages/altersvorsorgedepot-rechner.faq.json'
import { validateFaq } from './faq'

describe('page FAQ files', () => {
  const files = import.meta.glob('../features/publicPages/*.faq.json', { eager: true, import: 'default' })
  it.each(Object.entries(files))('validates %s', (filename, data) => {
    expect(() => validateFaq(data, filename)).not.toThrow()
  })

  it.each([
    { q: 'Question?', a: '', sources: [] },
    { q: 'Question?', a: 'Answer.', sources: ['not-a-url'] },
    { q: 'Question?', a: 'Answer.', sources: ['http://example.com'] },
    { q: 'Question?', a: 'Answer.', sources: ['https://'] },
    { q: ' ', a: 'Answer.', sources: [] },
    { q: 'Question?', a: 'Answer.', sources: null },
    { q: 'Question?', a: 'Answer.' },
    null,
  ])('rejects an invalid faq.json item: %j', (item) => {
    expect(() => validateFaq([item], 'invalid.faq.json')).toThrow('invalid.faq.json[0]')
  })

  it('rejects an object instead of an array', () => {
    expect(() => validateFaq({})).toThrow('expected an FAQ array')
  })
})

describe('AVD FAQ statutory values', () => {
  const rules = activeRules.altersvorsorgedepot
  // The FAQ stays plain text. A rules change must fail CI until its copy is
  // updated, keeping the visible FAQ and JSON-LD aligned with the calculator.
  it.each([
    [
      'indirectSpouseBasicAllowanceMax',
      'Wer kann ein Altersvorsorgedepot eröffnen?',
      `höchstens ${rules.indirectSpouseBasicAllowanceMax.toLocaleString('de-DE')} € Grundzulage.`,
    ],
    [
      'glidepathHighRiskMax5YearsBefore',
      'Was passiert mit dem Depotwert in schlechten Marktphasen?',
      `ab fünf Jahren vor Rentenbeginn auf höchstens ${(rules.glidepathHighRiskMax5YearsBefore * 100).toLocaleString('de-DE')} %`,
    ],
    [
      'glidepathHighRiskMax2YearsBefore',
      'Was passiert mit dem Depotwert in schlechten Marktphasen?',
      `ab zwei Jahren vor Rentenbeginn auf höchstens ${(rules.glidepathHighRiskMax2YearsBefore * 100).toLocaleString('de-DE')} %.`,
    ],
    [
      'standarddepotEffektivkostenCap',
      'Wie hoch sind die Kosten?',
      `Effektivkosten-Deckel von ${(rules.standarddepotEffektivkostenCap * 100).toLocaleString('de-DE', { minimumFractionDigits: 1 })} % pro Jahr.`,
    ],
    [
      'productStartYear',
      'Wie funktioniert die Übertragung von Riester auf das AVD?',
      `ab Inkrafttreten ${rules.productStartYear}.`,
    ],
  ])('matches activeRules.%s in the relevant answer', (_rule, question, expected) => {
    const answer = avdFaq.find((item) => item.q === question)?.a
    // MDX's former &nbsp; and the JSON's non-breaking spaces have the same
    // display semantics as ordinary spaces for these value assertions.
    expect(answer?.replace(/\s+/g, ' '), question).toContain(expected)
  })
})
