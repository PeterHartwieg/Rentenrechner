// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CALCULATION_NOTES } from '../../content/calculationNotes'
import { getTerm } from '../../content/terms'
import { AltersvorsorgedepotRechnerPage } from './AltersvorsorgedepotRechnerPage'
import { AltersvorsorgeproduktePage } from './AltersvorsorgeproduktePage'
import { RiesterRechnerPage } from './RiesterRechnerPage'
import { RiesterVsAltersvorsorgedepotPage } from './RiesterVsAltersvorsorgedepotPage'

/**
 * § 86 EStG i.d.F. des Altersvorsorgereformgesetzes (BGBl. 2026 I Nr. 156,
 * verkündet 29.05.2026): from Beitragsjahr 2027, Zulagen require a
 * Mindesteigenbeitrag of 120 €/year. Only the old 4 % calculation is gone.
 */
const BUNDESGESETZBLATT_PDF =
  'https://www.recht.bund.de/bgbl/1/2026/156/regelungstext.pdf?__blob=publicationFile&v=1'

/** Art. 2 Nr. 9 Altersvorsorgereformgesetz (BGBl. 2026 I Nr. 156) replaces § 86 EStG. */
function assertCurrentSection86Source(container: HTMLElement) {
  const text = container.textContent ?? ''
  expect(text).toMatch(/gesetze-im-internet\.de zeigt derzeit noch die bis 2026 geltende Fassung/)
  expect(text).toMatch(/Art\.\s*2 Nr\.\s*9/)
  const hrefs = Array.from(container.querySelectorAll('a'), (anchor) => anchor.getAttribute('href'))
  expect(hrefs).toContain(BUNDESGESETZBLATT_PDF)
}

function assertMindesteigenbeitragCopy(text: string) {
  expect(text).toMatch(
    /Mindesteigenbeitrag[^.]{0,80}120\s*€|120\s*€[^.]{0,40}(pro|im) Jahr/,
  )
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
    expect(help).toMatch(/120\s*€ im Jahr/)
    expect(help).toMatch(/Bestehender Riester-Vertrag in der bisherigen Förderung/)
    expect(help).toMatch(/§ 52 Abs\. 50a EStG/)
    expect(help).toMatch(/Altersvorsorgedepot|Alters­vorsorge­depot/)
    expect(help).toMatch(/Weggefallen ist nur die alte Berechnung/)
    expect(help).not.toMatch(/Riester\s*\/\s*AVD:\s*4\s*%/)
    expect(help).not.toMatch(/entfällt/i)
  })

  it('states the 120 € floor on the Altersvorsorgedepot page', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    assertMindesteigenbeitragCopy(container.textContent ?? '')
    assertCurrentSection86Source(container)
    expect(container.textContent).toMatch(/4\s*% des Vorjahreseinkommens minus Zulagen/)
    expect(container.textContent).toMatch(/gilt hier nicht mehr/)
  })

  it('states the 120 € floor on the Riester-vs-AVD page', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    assertMindesteigenbeitragCopy(container.textContent ?? '')
    assertCurrentSection86Source(container)
    expect(container.textContent).toMatch(/gilt nicht mehr/)
  })

  it('points the Riester page § 86 link at the promulgated replacement', () => {
    const { container } = render(<RiesterRechnerPage />)
    assertCurrentSection86Source(container)
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
