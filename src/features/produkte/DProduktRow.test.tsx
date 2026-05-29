// @vitest-environment jsdom

/**
 * `DProduktRow` — ported in PR 3 from `direction-d-pages.jsx` L525-600. Tests
 * pin the visual contract (kind / title / status / fields), the CTA wiring
 * (primary + secondary callbacks), and the cron-dispatch P0 invariant that
 * the title must NOT be set via `dangerouslySetInnerHTML` (otherwise the
 * bundle's `&nbsp;` would render as literal HTML markup in our React port).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { DProduktRow } from './DProduktRow'

afterEach(() => cleanup())

describe('DProduktRow — visual contract', () => {
  it('renders the kind kicker, title, status badge, and field rows', () => {
    const { container, getByText } = render(
      <DProduktRow
        kind="ETF-Sparplan · Schicht 3"
        title="Trade Republic Depot"
        status="aktiv"
        fields={[
          { key: 'Sparrate', value: '350 EUR/Mon.' },
          { key: 'TER', value: '0,20 % p.a.' },
        ]}
        primary="Bearbeiten"
      />,
    )
    expect(getByText('ETF-Sparplan · Schicht 3')).toBeTruthy()
    expect(getByText('Trade Republic Depot')).toBeTruthy()
    expect(getByText('aktiv')).toBeTruthy()
    expect(getByText('Sparrate')).toBeTruthy()
    expect(getByText('350 EUR/Mon.')).toBeTruthy()
    expect(getByText('TER')).toBeTruthy()
    expect(getByText('0,20 % p.a.')).toBeTruthy()
    // Right sidebar copy.
    expect(
      container.textContent?.includes('Diese Werte fließen direkt'),
    ).toBe(true)
  })

  it('renders the accent line when provided', () => {
    const { getByText } = render(
      <DProduktRow
        kind="DRV · Schicht 1 · Pflicht"
        title="Rentenauskunft DRV"
        fields={[{ key: 'Stand', value: '05 / 2026' }]}
        primary="PDF erneut hochladen"
        accent="Anpassung der Werte überschreibt die Annahme aus der DRV-PDF."
      />,
    )
    expect(
      getByText(
        'Anpassung der Werte überschreibt die Annahme aus der DRV-PDF.',
      ),
    ).toBeTruthy()
  })

  it('omits the status badge when not provided', () => {
    const { container } = render(
      <DProduktRow
        kind="X"
        title="No status"
        fields={[]}
        primary="OK"
      />,
    )
    expect(container.querySelector('.d-produkt-row__status')).toBeNull()
  })
})

describe('DProduktRow — title rendering (no dangerouslySetInnerHTML)', () => {
  it('renders an HTML-entity-looking title as plain text, not as HTML markup', () => {
    // The bundle's `dangerouslySetInnerHTML` path would interpret `<b>` as
    // markup. Our React port must NOT do that — passing a string with HTML
    // characters keeps them as text.
    const { container } = render(
      <DProduktRow
        kind="K"
        title="Trade <b>Republic</b>"
        fields={[]}
        primary="OK"
      />,
    )
    const titleEl = container.querySelector('.d-produkt-row__title')
    expect(titleEl).not.toBeNull()
    // Literal text — not interpreted as HTML markup.
    expect(titleEl!.textContent).toBe('Trade <b>Republic</b>')
    expect(titleEl!.innerHTML).not.toContain('<b>Republic</b>')
  })

  it('preserves a non-breaking space character in the title', () => {
    const { container } = render(
      <DProduktRow
        kind="K"
        title={`Trade\u00A0Republic`}
        fields={[]}
        primary="OK"
      />,
    )
    const titleEl = container.querySelector('.d-produkt-row__title')
    expect(titleEl!.textContent).toBe(`Trade\u00A0Republic`)
  })
})

describe('DProduktRow — CTA wiring', () => {
  it('fires `onPrimary` when the primary button is clicked', () => {
    const onPrimary = vi.fn()
    const { getByRole } = render(
      <DProduktRow
        kind="K"
        title="T"
        fields={[]}
        primary="Bearbeiten"
        onPrimary={onPrimary}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'Bearbeiten' }))
    expect(onPrimary).toHaveBeenCalledOnce()
  })

  it('fires `onSecondary` when the secondary button is clicked', () => {
    const onSecondary = vi.fn()
    const { getByRole } = render(
      <DProduktRow
        kind="K"
        title="T"
        fields={[]}
        primary="Bearbeiten"
        secondary="Entfernen"
        destructive
        onSecondary={onSecondary}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'Entfernen' }))
    expect(onSecondary).toHaveBeenCalledOnce()
  })

  it('renders the destructive variant with the accent-coloured class', () => {
    const { getByRole } = render(
      <DProduktRow
        kind="K"
        title="T"
        fields={[]}
        primary="Bearbeiten"
        secondary="Entfernen"
        destructive
      />,
    )
    const btn = getByRole('button', { name: 'Entfernen' })
    expect(btn.className).toContain('d-produkt-row__btn--destructive')
  })

  it('renders the primary as disabled when `primaryDisabled` is true', () => {
    const onPrimary = vi.fn()
    const { getByRole } = render(
      <DProduktRow
        kind="K"
        title="T"
        fields={[]}
        primary="PDF hochladen"
        primaryDisabled
        primaryTitle="Bald verfügbar"
        onPrimary={onPrimary}
      />,
    )
    const btn = getByRole('button', { name: 'PDF hochladen' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe('Bald verfügbar')
    fireEvent.click(btn)
    expect(onPrimary).not.toHaveBeenCalled()
  })
})
