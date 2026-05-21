// @vitest-environment jsdom
/**
 * Tests for ErrorStatePanel (R3.2 / audit C7 + H9) — Sober D recovery +
 * empty-state primitive.
 *
 * Coverage:
 *   - error tone wears role="alert" + aria-live="polite" + warning icon
 *   - empty tone wears role="status" + has no warning icon
 *   - dismiss button fires onDismiss + uses the supplied / default
 *     aria-label
 *   - CTA renders as a <button> when onClick is supplied
 *   - CTA renders as an <a href=…> when only href is supplied
 *   - CTA falls back to neither when no onClick / href is supplied
 *     (defensive — empty-state without action is a valid composition)
 *   - className passes through to the root for per-consumer layout
 *     overrides (`.rw-error-state--centered`, `--banner`, etc.)
 *   - title is omittable; the title node is then absent
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorStatePanel } from './ErrorStatePanel'

afterEach(() => cleanup())

describe('ErrorStatePanel — tone semantics', () => {
  it('error tone renders role="alert", aria-live="polite", and the warning icon', () => {
    const { container } = render(
      <ErrorStatePanel tone="error" message="Etwas ist schiefgegangen." />,
    )
    const root = container.querySelector('.rw-error-state')
    expect(root).not.toBeNull()
    expect(root!.getAttribute('role')).toBe('alert')
    expect(root!.getAttribute('aria-live')).toBe('polite')
    expect(root!.classList.contains('rw-error-state--error')).toBe(true)
    // AlertTriangle from lucide-react renders an <svg> child; we check for
    // the icon's wrapper class so we don't couple to lucide's internal markup.
    expect(container.querySelector('.rw-error-state__icon')).not.toBeNull()
  })

  it('empty tone renders role="status", no aria-live, and no warning icon', () => {
    const { container } = render(
      <ErrorStatePanel tone="empty" message="Noch nichts zum Vergleichen." />,
    )
    const root = container.querySelector('.rw-error-state')
    expect(root).not.toBeNull()
    expect(root!.getAttribute('role')).toBe('status')
    expect(root!.getAttribute('aria-live')).toBeNull()
    expect(root!.classList.contains('rw-error-state--empty')).toBe(true)
    expect(container.querySelector('.rw-error-state__icon')).toBeNull()
  })
})

describe('ErrorStatePanel — title + message', () => {
  it('renders the title when supplied', () => {
    render(
      <ErrorStatePanel
        tone="error"
        title="Link ungültig"
        message="Dieser Link ist abgelaufen."
      />,
    )
    expect(screen.getByText('Link ungültig')).not.toBeNull()
    expect(screen.getByText('Dieser Link ist abgelaufen.')).not.toBeNull()
  })

  it('omits the title node when not supplied', () => {
    const { container } = render(
      <ErrorStatePanel tone="error" message="Nur die Body-Copy." />,
    )
    expect(container.querySelector('.rw-error-state__title')).toBeNull()
    expect(screen.getByText('Nur die Body-Copy.')).not.toBeNull()
  })
})

describe('ErrorStatePanel — dismiss affordance', () => {
  it('renders an "X" button and fires onDismiss when clicked', () => {
    const onDismiss = vi.fn()
    render(
      <ErrorStatePanel
        tone="error"
        message="Dismiss-Test"
        onDismiss={onDismiss}
      />,
    )
    const btn = screen.getByLabelText('Hinweis schließen')
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('honours a custom dismissLabel', () => {
    render(
      <ErrorStatePanel
        tone="error"
        message="Custom-Label-Test"
        onDismiss={() => {}}
        dismissLabel="Banner ausblenden"
      />,
    )
    expect(screen.getByLabelText('Banner ausblenden')).not.toBeNull()
  })

  it('omits the dismiss button when onDismiss is not supplied', () => {
    const { container } = render(
      <ErrorStatePanel tone="empty" message="Kein Dismiss-Button erwartet." />,
    )
    expect(container.querySelector('.rw-error-state__dismiss')).toBeNull()
  })
})

describe('ErrorStatePanel — CTA', () => {
  it('renders the CTA as a <button> and fires onClick when supplied', () => {
    const onClick = vi.fn()
    render(
      <ErrorStatePanel
        tone="empty"
        message="CTA-Button-Test"
        cta={{ label: 'Produkte auswählen', onClick }}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Produkte auswählen' })
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders the CTA as a <a href> when only href is supplied', () => {
    const { container } = render(
      <ErrorStatePanel
        tone="error"
        message="CTA-Link-Test"
        cta={{ label: 'Zurück zum Plan', href: '/' }}
      />,
    )
    const link = container.querySelector<HTMLAnchorElement>('a.rw-error-state__cta')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/')
    expect(link!.textContent).toBe('Zurück zum Plan')
  })

  it('renders the CTA as an <a> when href is supplied, even if onClick is also given', () => {
    const onClick = vi.fn()
    const { container } = render(
      <ErrorStatePanel
        tone="error"
        message="CTA-Priorität-Test"
        cta={{ label: 'Weiter', href: '/foo', onClick }}
      />,
    )
    const link = container.querySelector<HTMLAnchorElement>('a.rw-error-state__cta')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/foo')
    expect(container.querySelector('button.rw-error-state__cta')).toBeNull()
    fireEvent.click(link!)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders neither button nor link when no CTA is supplied', () => {
    const { container } = render(
      <ErrorStatePanel tone="empty" message="Kein CTA erwartet." />,
    )
    expect(container.querySelector('.rw-error-state__cta')).toBeNull()
  })
})

describe('ErrorStatePanel — composition', () => {
  it('appends className to the root without replacing the base class', () => {
    const { container } = render(
      <ErrorStatePanel
        tone="empty"
        message="ClassName-Test"
        className="rw-error-state--centered"
      />,
    )
    const root = container.querySelector('.rw-error-state')
    expect(root).not.toBeNull()
    expect(root!.classList.contains('rw-error-state--empty')).toBe(true)
    expect(root!.classList.contains('rw-error-state--centered')).toBe(true)
  })
})
