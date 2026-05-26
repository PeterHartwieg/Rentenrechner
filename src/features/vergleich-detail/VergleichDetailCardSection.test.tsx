// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { VergleichDetailCardSection } from './VergleichDetailCardSection'
import type { VergleichDetailSection } from './vergleichDetailRows'

// ---------------------------------------------------------------------------
// VergleichDetailCardSection — labeled section block inside a card (PR R2).
//
// Tests pin:
//   - Section heading is rendered without a `§ N` prefix (PR R2 dropped
//     the section-number chrome per direction-d design).
//   - Each row is a `DMoneyRow` (selector check on `.vd-money-row`).
//   - Label suffix on a row is forwarded into the rendered DOM.
//   - The kind discriminant on rows maps to the right modifier classes.
//   - `info` rows route through `formatPercent` when no `display` is set,
//     and use the pre-built `display` string when present.
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

function mkSection(rows: VergleichDetailSection['rows']): VergleichDetailSection {
  return { heading: 'Ansparphase, pro Monat', rows }
}

describe('VergleichDetailCardSection — labeled section block', () => {
  it('renders the heading verbatim without a § N prefix', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          { label: 'Du selbst', value: 200, kind: 'add' },
          { label: '= effektiv investiert', value: 200, kind: 'total' },
        ])}
      />,
    )
    const heading = container.querySelector('.vd-card-section__heading')!
    expect(heading.textContent).toBe('Ansparphase, pro Monat')
    // PR R2: the `.vd-card-section__num` element is gone — heading is the
    // only chrome in the section header.
    expect(container.querySelector('.vd-card-section__num')).toBeNull()
  })

  it('renders one DMoneyRow per row', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          { label: 'Du selbst', value: 200, kind: 'add' },
          { label: '+ Arbeitgeber', value: 30, kind: 'add' },
          { label: '= effektiv investiert', value: 230, kind: 'total' },
        ])}
      />,
    )
    expect(container.querySelectorAll('.vd-money-row').length).toBe(3)
  })

  it('forwards row labelSuffix into the rendered DOM', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={{
          heading: 'Mit 67, einmalig',
          rows: [
            { label: 'Kapital brutto', value: 250_000, kind: 'add' },
            {
              label: '− Kosten p.a.',
              labelSuffix: '(1,2 %)',
              value: 8_500,
              kind: 'sub',
            },
          ],
        }}
      />,
    )
    const suffix = container.querySelector('.vd-money-row__label-suffix')
    expect(suffix).not.toBeNull()
    expect(suffix!.textContent).toContain('(1,2 %)')
  })

  it('maps `total` row kind to total + border modifiers (close-row chrome)', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          { label: 'Du selbst', value: 200, kind: 'add' },
          { label: '= effektiv investiert', value: 200, kind: 'total' },
        ])}
      />,
    )
    // The `= effektiv investiert` row is `kind: total` + bold + border.
    const totals = container.querySelectorAll('.vd-money-row--total')
    expect(totals.length).toBe(1)
    expect(totals[0].classList.contains('vd-money-row--bold')).toBe(true)
    expect(totals[0].classList.contains('vd-money-row--border')).toBe(true)
  })

  it('maps accent flag on a total row to the accent modifier (net-Rente)', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={{
          heading: 'Im Alter, pro Monat',
          rows: [
            { label: 'Brutto-Rente', value: 800, kind: 'add' },
            { label: '− Einkommensteuer', value: 100, kind: 'sub' },
            { label: '− KV / PV', value: 120, kind: 'sub' },
            { label: '= Netto-Rente', value: 580, kind: 'total', accent: true },
          ],
        }}
      />,
    )
    const net = container.querySelector('.vd-money-row--accent')
    expect(net).not.toBeNull()
    // Net-Rente carries both the accent and total classes.
    expect(net!.classList.contains('vd-money-row--total')).toBe(true)
  })

  it('routes `info` rows with no display through formatPercent(value, 2)', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          { label: 'Effektivkosten p. a.', value: 0.0123, kind: 'info' },
        ])}
      />,
    )
    const value = container.querySelector('.vd-money-row--info .vd-money-row__value')!
    // de-DE percent with 2 decimals.
    expect(value.textContent).toMatch(/1,23\s?%/)
  })

  it('forwards the `display` field of `info` rows verbatim when present', () => {
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          {
            label: 'Effektivkosten p. a.',
            value: 0.0123,
            kind: 'info',
            display: '1,23 % (RIY)',
          },
        ])}
      />,
    )
    const value = container.querySelector('.vd-money-row--info .vd-money-row__value')!
    expect(value.textContent).toBe('1,23 % (RIY)')
  })

  it('renders muted on "+" summands but not on the leading plain add row', () => {
    // PR R2 mapping: `add` rows starting with `+` are summand contributions
    // (rendered muted); plain `add` rows like `Du selbst` keep full ink.
    const { container } = render(
      <VergleichDetailCardSection
        section={mkSection([
          { label: 'Du selbst', value: 200, kind: 'add' },
          { label: '+ Arbeitgeber', value: 30, kind: 'add' },
          { label: '= effektiv investiert', value: 230, kind: 'total' },
        ])}
      />,
    )
    const rows = container.querySelectorAll('.vd-money-row')
    expect(rows[0].classList.contains('vd-money-row--muted')).toBe(false)
    expect(rows[1].classList.contains('vd-money-row--muted')).toBe(true)
    expect(rows[2].classList.contains('vd-money-row--muted')).toBe(false)
  })
})
