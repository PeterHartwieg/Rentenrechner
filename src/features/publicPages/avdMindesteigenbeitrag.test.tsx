// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CALCULATION_NOTES } from '../../content/calculationNotes'
import { getTerm } from '../../content/terms'
import { AltersvorsorgedepotRechnerPage } from './AltersvorsorgedepotRechnerPage'
import { AltersvorsorgeproduktePage } from './AltersvorsorgeproduktePage'
import { RiesterVsAltersvorsorgedepotPage } from './RiesterVsAltersvorsorgedepotPage'

/**
 * § 86 EStG i.d.F. des Altersvorsorgereformgesetzes (BGBl. 2026 I Nr. 156,
 * verkündet 29.05.2026): from Beitragsjahr 2027, Zulagen require a
 * Mindesteigenbeitrag of 120 €/year. Only the old 4 % calculation is gone.
 */
function assertMindesteigenbeitragCopy(text: string) {
  expect(text).toMatch(/120/)
  expect(text).toMatch(/Mindesteigenbeitrag/)
  expect(text).toMatch(/§\s?86/)
  expect(text).not.toMatch(/Mindesteigenbeitrag[^.]{0,120}entfällt/i)
  expect(text).not.toMatch(/kein einkommensproportionaler Anteil/)
}

describe('AVD Mindesteigenbeitrag copy (§ 86 EStG, 120 €/year from 2027)', () => {
  it('does not apply the old 4 % formula to the Altersvorsorgedepot in the glossary', () => {
    const term = getTerm('mindesteigenbeitrag')
    expect(term).toBeDefined()
    const help = term?.shortHelp ?? ''
    expect(help).toContain('120')
    expect(help).toMatch(/Altersvorsorgedepot|Alters­vorsorge­depot/)
    expect(help).toMatch(/Weggefallen ist nur die alte Berechnung/)
    expect(help).not.toMatch(/Riester\s*\/\s*AVD:\s*4\s*%/)
    expect(help).not.toMatch(/entfällt/i)
  })

  it('states the 120 € floor on the Altersvorsorgedepot page', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    assertMindesteigenbeitragCopy(container.textContent ?? '')
    expect(container.textContent).toMatch(/4\s*% des Vorjahreseinkommens minus Zulagen/)
    expect(container.textContent).toMatch(/gilt hier nicht mehr/)
  })

  it('states the 120 € floor on the Riester-vs-AVD page', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    assertMindesteigenbeitragCopy(container.textContent ?? '')
    expect(container.textContent).toMatch(/gilt nicht mehr/)
  })

  it('states the 120 € floor on the product comparison page', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    assertMindesteigenbeitragCopy(container.textContent ?? '')
    expect(container.textContent).toMatch(/gilt für diese Zulage nicht mehr/)
  })

  it('drops the stale draft-only provenance from the calculator note', () => {
    const note = CALCULATION_NOTES.find((entry) => entry.category.startsWith('Altersvorsorgedepot'))
    expect(note?.note).toContain('120')
    expect(note?.note).toContain('BGBl. 2026 I Nr. 156')
    expect(note?.note).toMatch(/Produktstart ab 2027/)
    expect(note?.note).not.toMatch(/steht noch aus/)
    expect(note?.note).not.toMatch(/Bundesrat-Drucksache 206\/26/)
  })
})
