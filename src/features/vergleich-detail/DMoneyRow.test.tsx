// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DMoneyRow } from './DMoneyRow'

// ---------------------------------------------------------------------------
// DMoneyRow — primitive row inside a `/vergleich/details` card section (PR R2).
//
// Pure presentation tests. The component carries one numeric formatter
// (`formatCurrency(value, 0)`) and five orthogonal modifier classes
// (`muted` / `bold` / `border` / `accent` / kind). These tests pin:
//   - Currency formatting via `Intl.NumberFormat('de-DE')` (UI rounding
//     boundary — CLAUDE.md).
//   - `sub` kind prepends a leading `−` glyph.
//   - String values pass through verbatim (info rows, pre-formatted
//     percentages, etc.).
//   - Modifier classes are emitted on the root element.
//   - Label suffix renders only when present.
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

describe('DMoneyRow — primitive row component', () => {
  it('formats numeric value via Intl currency (de-DE, 0 decimals)', () => {
    const { container } = render(<DMoneyRow label="Du selbst" value={200} kind="add" />)
    const value = container.querySelector('.vd-money-row__value')!
    // Intl.NumberFormat('de-DE') yields a non-breaking space before the €.
    expect(value.textContent).toContain('200')
    expect(value.textContent).toContain('€')
  })

  it('prepends "− " to sub-kind values', () => {
    const { container } = render(<DMoneyRow label="− Kosten" value={50} kind="sub" />)
    const value = container.querySelector('.vd-money-row__value')!
    expect(value.textContent?.startsWith('− ')).toBe(true)
    expect(value.textContent).toContain('50')
    expect(value.textContent).toContain('€')
  })

  it('passes string values through verbatim (info rows, pre-formatted)', () => {
    // Used for `info` rows where the caller pre-formats (e.g. via
    // `formatPercent`). The row component must not re-format strings.
    const { container } = render(
      <DMoneyRow label="Effektivkosten" value="1,2 %" kind="info" />,
    )
    const value = container.querySelector('.vd-money-row__value')!
    expect(value.textContent).toBe('1,2 %')
  })

  it('renders the labelSuffix as a separate span when present', () => {
    const { container } = render(
      <DMoneyRow
        label="− Kosten p.a."
        labelSuffix="(1,2 %)"
        value={500}
        kind="sub"
      />,
    )
    const suffix = container.querySelector('.vd-money-row__label-suffix')
    expect(suffix).not.toBeNull()
    expect(suffix!.textContent).toContain('(1,2 %)')
  })

  it('does NOT render a labelSuffix span when the prop is absent', () => {
    const { container } = render(<DMoneyRow label="Du selbst" value={200} kind="add" />)
    expect(container.querySelector('.vd-money-row__label-suffix')).toBeNull()
  })

  it('emits kind class on the root row', () => {
    const { container: addContainer } = render(
      <DMoneyRow label="Du selbst" value={200} kind="add" />,
    )
    expect(
      addContainer.querySelector('.vd-money-row.vd-money-row--add'),
    ).not.toBeNull()

    const { container: subContainer } = render(
      <DMoneyRow label="− Kosten" value={50} kind="sub" />,
    )
    expect(
      subContainer.querySelector('.vd-money-row.vd-money-row--sub'),
    ).not.toBeNull()

    const { container: totalContainer } = render(
      <DMoneyRow label="= effektiv" value={250} kind="total" />,
    )
    expect(
      totalContainer.querySelector('.vd-money-row.vd-money-row--total'),
    ).not.toBeNull()

    const { container: infoContainer } = render(
      <DMoneyRow label="Effektivkosten" value="1,2 %" kind="info" />,
    )
    expect(
      infoContainer.querySelector('.vd-money-row.vd-money-row--info'),
    ).not.toBeNull()
  })

  it('emits muted / bold / border / accent modifier classes when their props are truthy', () => {
    const { container } = render(
      <DMoneyRow
        label="= Netto-Rente"
        value={400}
        kind="total"
        bold
        border
        accent
      />,
    )
    const row = container.querySelector('.vd-money-row')!
    expect(row.classList.contains('vd-money-row--bold')).toBe(true)
    expect(row.classList.contains('vd-money-row--border')).toBe(true)
    expect(row.classList.contains('vd-money-row--accent')).toBe(true)
    // muted not passed → class must NOT be present.
    expect(row.classList.contains('vd-money-row--muted')).toBe(false)
  })

  it('omits all modifier classes when no flags are set', () => {
    const { container } = render(<DMoneyRow label="Du selbst" value={200} kind="add" />)
    const row = container.querySelector('.vd-money-row')!
    expect(row.classList.contains('vd-money-row--muted')).toBe(false)
    expect(row.classList.contains('vd-money-row--bold')).toBe(false)
    expect(row.classList.contains('vd-money-row--border')).toBe(false)
    expect(row.classList.contains('vd-money-row--accent')).toBe(false)
    // kind class still emitted.
    expect(row.classList.contains('vd-money-row--add')).toBe(true)
  })

  it('renders zero values without dropping the row (Intl formats 0 € correctly)', () => {
    const { container } = render(<DMoneyRow label="− KV / PV" value={0} kind="sub" />)
    const value = container.querySelector('.vd-money-row__value')!
    expect(value.textContent).toContain('0')
    expect(value.textContent).toContain('€')
  })

  it('rounds via formatCurrency at the display boundary (no engine-side toFixed)', () => {
    // Pin the UI rounding boundary: the engine returns floats, the row
    // formats via Intl 0-decimals. 1234.567 → "1.235 €" (de-DE).
    const { container } = render(
      <DMoneyRow label="Kapital brutto" value={1234.567} kind="add" />,
    )
    const value = container.querySelector('.vd-money-row__value')!
    expect(value.textContent).toContain('1.235')
    expect(value.textContent).toContain('€')
  })
})
