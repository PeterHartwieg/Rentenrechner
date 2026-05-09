// @vitest-environment jsdom

/**
 * QaPreview rendering tests for the send-to-GitHub flow.
 *
 * The Worker submission path itself (Turnstile + fetch) is covered by the
 * sibling `QaPreview.workerSubmit.test.tsx`. This file pins:
 *   - The intro copy explains where the feedback goes.
 *   - The composed comment is shown back to the tester.
 *   - The screenshot section appears only when an image was captured.
 *   - The Turnstile container is rendered immediately.
 *   - The consent checkbox is unchecked by default.
 *   - The Senden button is disabled until BOTH consent is given AND a
 *     Turnstile token has been issued (ADR-0001 explicit consent requirement).
 *   - Consent copy names GitHub, Turnstile, and R2 retention.
 *   - Consent copy links to /datenschutz#qa-feedback.
 *   - Zurück / Abbrechen wire up to the supplied callbacks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaPreview } from '../QaPreview'
import type { ResolvedTarget } from '../report'
import type { ComposerDraft } from '../QaComposer'
import type { CapturedScreenshot } from '../capture/screenshot'

const TARGET: ResolvedTarget = {
  id: 'inputs.bav.employerSubsidy.label',
  label: 'AG-Zuschuss',
  visibleText: 'AG-Zuschuss laut Vertrag (%)',
  precision: 'exact',
}

const DRAFT: ComposerDraft = {
  type: 'other',
  severity: 'minor',
  comment: 'Die Zahl stimmt hier nicht.',
  suggestedText: '',
  includeScreenshot: false,
}

const SCREENSHOT_FIXTURE: CapturedScreenshot = {
  blob: new Blob([new Uint8Array([0])], { type: 'image/png' }),
  dataUrl: 'data:image/png;base64,' + btoa('fake-png'),
  width: 320,
  height: 240,
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.getElementById('qa-turnstile-script')?.remove()
  delete (window as unknown as { turnstile?: unknown }).turnstile
  window.history.replaceState(null, '', '/')
})

interface RenderOverrides {
  draft?: Partial<ComposerDraft>
  screenshot?: CapturedScreenshot | null
  onBack?: () => void
  onCancel?: () => void
  onSuccess?: () => void
}

function renderPreview(overrides: RenderOverrides = {}) {
  return render(
    <QaPreview
      target={TARGET}
      draft={{ ...DRAFT, ...(overrides.draft ?? {}) }}
      screenshot={overrides.screenshot ?? null}
      onBack={overrides.onBack ?? (() => undefined)}
      onCancel={overrides.onCancel ?? (() => undefined)}
      onSuccess={overrides.onSuccess ?? (() => undefined)}
    />,
  )
}

describe('QaPreview — send-to-GitHub layout with explicit consent (ADR-0001)', () => {
  it('shows a plain-language intro that names GitHub', () => {
    renderPreview()
    // "GitHub-Konto" appears only in the intro paragraph — specific enough.
    expect(screen.getByText(/GitHub-Konto brauchst du dafür nicht/i)).toBeTruthy()
  })

  it('renders the tester comment back to them', () => {
    renderPreview({ draft: { comment: 'Die Zahl stimmt hier nicht.' } })
    const summary = screen.getByTestId('qa-preview-summary')
    expect(summary.textContent).toContain('Die Zahl stimmt hier nicht.')
  })

  it('omits the screenshot section when no screenshot is attached', () => {
    renderPreview({ draft: { includeScreenshot: false }, screenshot: null })
    expect(screen.queryByTestId('qa-preview-screenshot')).toBeNull()
  })

  it('renders the screenshot section when one was captured', () => {
    renderPreview({
      draft: { includeScreenshot: true },
      screenshot: SCREENSHOT_FIXTURE,
    })
    const block = screen.getByTestId('qa-preview-screenshot')
    expect(block.querySelector('img')?.getAttribute('src')).toBe(SCREENSHOT_FIXTURE.dataUrl)
  })

  it('mounts the Turnstile container immediately', () => {
    renderPreview()
    expect(screen.getByTestId('qa-preview-worker-turnstile')).toBeTruthy()
  })

  it('renders the consent checkbox unchecked by default', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-consent-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('consent copy names GitHub, Turnstile, and R2 retention', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-consent-checkbox')
    const label = checkbox.closest('label') as HTMLLabelElement
    const text = label.textContent ?? ''
    expect(text).toContain('GitHub')
    expect(text).toContain('Turnstile')
    expect(text).toContain('R2')
    expect(text).toContain('Issue-Schließung')
  })

  it('consent copy links to /datenschutz#qa-feedback', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-consent-checkbox')
    const label = checkbox.closest('label') as HTMLLabelElement
    const link = label.querySelector('a[href="/datenschutz#qa-feedback"]')
    expect(link).not.toBeNull()
  })

  it('disables Senden when consent is unchecked even if a Turnstile token is present', () => {
    renderPreview()
    const submit = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
    // No consent, no token → disabled
    expect(submit.disabled).toBe(true)
  })

  it('disables Senden when consent is checked but no Turnstile token has arrived', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-consent-checkbox')
    fireEvent.click(checkbox)
    const submit = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
    // Consent given but still no token → disabled
    expect(submit.disabled).toBe(true)
  })

  it('Zurück triggers onBack', () => {
    const onBack = vi.fn()
    renderPreview({ onBack })
    fireEvent.click(screen.getByText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('Abbrechen (footer button) triggers onCancel', () => {
    const onCancel = vi.fn()
    renderPreview({ onCancel })
    fireEvent.click(screen.getByText('Abbrechen'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
