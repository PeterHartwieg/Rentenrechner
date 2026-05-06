// @vitest-environment jsdom

/**
 * QaPreview rendering tests for the simplified send-to-GitHub flow.
 *
 * The Worker submission path itself (Turnstile + fetch) is covered by the
 * sibling `QaPreview.workerSubmit.test.tsx`. This file pins:
 *   - The intro copy explains where the feedback goes.
 *   - The composed comment is shown back to the tester.
 *   - The screenshot section appears only when an image was captured.
 *   - The Turnstile container is rendered immediately (no consent gate).
 *   - The Senden button is disabled until a Turnstile token arrives.
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
}

function renderPreview(overrides: RenderOverrides = {}) {
  return render(
    <QaPreview
      target={TARGET}
      draft={{ ...DRAFT, ...(overrides.draft ?? {}) }}
      screenshot={overrides.screenshot ?? null}
      onBack={overrides.onBack ?? (() => undefined)}
      onCancel={overrides.onCancel ?? (() => undefined)}
    />,
  )
}

describe('QaPreview — friendly send-to-GitHub layout', () => {
  it('shows a plain-language intro that names GitHub', () => {
    renderPreview()
    expect(screen.getByText(/GitHub-Issue/i)).toBeTruthy()
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

  it('mounts the Turnstile container immediately (no consent checkbox)', () => {
    renderPreview()
    expect(screen.getByTestId('qa-preview-worker-turnstile')).toBeTruthy()
  })

  it('disables the Senden button until a Turnstile token has been issued', () => {
    renderPreview()
    const submit = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
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
