// @vitest-environment jsdom
/**
 * Tests for the temporary VITE_QA_FOOTER_BUTTON flag-gated QA activator button
 * in LegalFooter (issue #18).
 *
 * Three render states under test:
 *   1. Flag unset (default)         → button absent.
 *   2. Flag 'true' + QA mode off    → button present; aria-label matches spec.
 *   3. Flag 'true' + QA mode on     → button hidden (indicator chip owns the UI).
 *
 * Cleanup task: .scratch/qa-feedback-mode/issues/18-temporary-footer-button-to-activate-qa.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QaFeedbackProvider } from '../qa-feedback/QaFeedbackProvider'
import { LegalFooter } from './LegalFooter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderFooter() {
  return render(
    <QaFeedbackProvider>
      <LegalFooter navigate={() => undefined} />
    </QaFeedbackProvider>,
  )
}

/** aria-label on the QA activate button, per the German copy spec. */
const QA_BUTTON_ARIA_LABEL =
  'Aktiviert den Feedback-Modus. Klicken Sie anschließend ein UI-Element an, um Feedback zu geben.'

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-qa-mode')
  vi.unstubAllEnvs()
})

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

// ---------------------------------------------------------------------------
// State 1: Flag unset → button absent
// ---------------------------------------------------------------------------

describe('LegalFooter — VITE_QA_FOOTER_BUTTON unset', () => {
  it('renders standard footer links', () => {
    renderFooter()
    expect(screen.getByText('Impressum')).toBeTruthy()
    expect(screen.getByText('Datenschutzerklärung')).toBeTruthy()
  })

  it('does NOT render the QA-Modus button', () => {
    renderFooter()
    expect(screen.queryByRole('button', { name: QA_BUTTON_ARIA_LABEL })).toBeNull()
  })

  it('does NOT render the helper text', () => {
    renderFooter()
    expect(screen.queryByText(/Sie testen für uns/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// State 2: Flag 'true' + QA mode off → button present and functional
// ---------------------------------------------------------------------------

describe('LegalFooter — VITE_QA_FOOTER_BUTTON=true, QA mode off', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_QA_FOOTER_BUTTON', 'true')
  })

  it('renders the QA-Modus starten button', () => {
    renderFooter()
    expect(screen.getByRole('button', { name: QA_BUTTON_ARIA_LABEL })).toBeTruthy()
  })

  it('button label text is "Feedback Modus starten"', () => {
    renderFooter()
    const btn = screen.getByRole('button', { name: QA_BUTTON_ARIA_LABEL })
    expect(btn.textContent).toBe('Feedback Modus starten')
  })

  it('button aria-label matches the German copy spec exactly', () => {
    renderFooter()
    const btn = screen.getByRole('button', { name: QA_BUTTON_ARIA_LABEL })
    expect(btn.getAttribute('aria-label')).toBe(QA_BUTTON_ARIA_LABEL)
  })

  it('renders the helper text alongside the button', () => {
    renderFooter()
    expect(screen.getByText(/Sie testen für uns/)).toBeTruthy()
  })

  it('clicking the button activates QA mode', () => {
    renderFooter()
    const btn = screen.getByRole('button', { name: QA_BUTTON_ARIA_LABEL })
    fireEvent.click(btn)
    // After activation the indicator chip should appear (rendered by
    // QaModeIndicator inside QaFeedbackProvider) and the button should
    // disappear (conditional !qaEnabled).
    expect(document.documentElement.getAttribute('data-qa-mode')).toBe('true')
  })

  it('button disappears after being clicked (QA mode now on)', () => {
    renderFooter()
    const btn = screen.getByRole('button', { name: QA_BUTTON_ARIA_LABEL })
    fireEvent.click(btn)
    expect(screen.queryByRole('button', { name: QA_BUTTON_ARIA_LABEL })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// State 3: Flag 'true' + QA mode on → button hidden
// ---------------------------------------------------------------------------

describe('LegalFooter — VITE_QA_FOOTER_BUTTON=true, QA mode already on', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_QA_FOOTER_BUTTON', 'true')
    // Activate QA mode via URL so the provider sets enabled=true before render.
    window.history.replaceState(null, '', '/?qa=1')
  })

  it('does NOT render the QA-Modus button when QA mode is already active', () => {
    renderFooter()
    expect(screen.queryByRole('button', { name: QA_BUTTON_ARIA_LABEL })).toBeNull()
  })

  it('does NOT render the helper text when QA mode is already active', () => {
    renderFooter()
    expect(screen.queryByText(/Sie testen für uns/)).toBeNull()
  })
})
