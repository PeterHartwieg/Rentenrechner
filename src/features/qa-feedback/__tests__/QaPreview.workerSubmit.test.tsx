// @vitest-environment jsdom

/**
 * Phase 3 — QaPreview "Direkt an GitHub einreichen" worker-submit tests.
 *
 * Sibling `no-network-e2e.test.tsx` pins the no-network guarantee for the
 * other four export paths (clipboard, bundle, mailto, GitHub-prefilled-URL).
 * This file covers the only export path that DOES network: the
 * `submitToWorker` POST to `qa.rentenwiki.de/submit`.
 *
 * Coverage:
 *   1. Happy path — consent ticked → fake Turnstile token → submit POST
 *      reaches the Worker URL → success status renders the issue URL.
 *   2. Error path — Worker responds 4xx with German error message; status
 *      surfaces the German message.
 *   3. No-network when consent unticked — even mounting QaPreview does not
 *      call fetch until the consent box is ticked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'

// html-to-image is dynamically imported by capture/screenshot.ts; mock it.
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,' + btoa('fake-png')),
}))

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // QA mode on; the provider reads ?qa=1 on mount.
  window.history.replaceState(null, '', '/?qa=1')

  // Stub window.open so any incidental mailto/github clicks don't pop tabs.
  vi.spyOn(window, 'open').mockReturnValue(null)

  // Stub a synchronous Turnstile API. The composer renders the widget into
  // a div; our fake `render` invokes the supplied callback on the next
  // microtask so the React state setter fires inside `act()`.
  ;(window as unknown as { turnstile: TurnstileApiStub }).turnstile = {
    render: (_el, opts) => {
      queueMicrotask(() => opts.callback('fake-turnstile-token'))
      return 'widget-1'
    },
  }

  // navigator.clipboard isn't in jsdom; stub it so the existing copy
  // button doesn't blow up if it's incidentally clicked.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (window as unknown as { turnstile?: TurnstileApiStub }).turnstile
  // Remove any Turnstile script tag the component appended.
  document.getElementById('qa-turnstile-script')?.remove()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

interface TurnstileApiStub {
  render(
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void },
  ): string
}

function HostedTarget() {
  const { targetProps } = useFeedbackTarget({
    id: 'inputs.bav.employerSubsidy.label',
    label: 'AG-Zuschuss',
  })
  return (
    <button type="button" {...targetProps} data-testid="host">
      AG-Zuschuss laut Vertrag
    </button>
  )
}

function TestApp() {
  return (
    <QaFeedbackProvider>
      <HostedTarget />
    </QaFeedbackProvider>
  )
}

async function navigateToPreview() {
  render(<TestApp />)
  fireEvent.click(screen.getByTestId('host'))
  const composer = await screen.findByTestId('qa-composer')

  // Skip screenshot capture so the preview doesn't depend on the html-to-image mock.
  const screenshotCheckbox = composer.querySelector(
    'input[type="checkbox"]',
  ) as HTMLInputElement | null
  if (screenshotCheckbox?.checked) fireEvent.click(screenshotCheckbox)

  const textarea = composer.querySelector('textarea') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: 'Worker submit test feedback.' } })

  const previewBtn = composer.querySelector(
    '.qa-panel__btn--primary',
  ) as HTMLButtonElement
  fireEvent.click(previewBtn)
  await screen.findByTestId('qa-preview')
}

describe('QaPreview — Direkt an GitHub einreichen (worker submit)', () => {
  it('happy path: consent → Turnstile token → POST reaches Worker, success status shows issue URL', async () => {
    fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            issueUrl: 'https://github.com/PeterHartwieg/Rentenrechner/issues/42',
            issueNumber: 42,
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await navigateToPreview()

    // Tick the consent checkbox — that triggers Turnstile widget render
    // (our stub immediately produces a token).
    const consent = screen.getByTestId('qa-preview-worker-consent')
    fireEvent.click(consent)

    // Wait for the fake Turnstile callback to fire and the submit button to enable.
    await waitFor(() => {
      const submitBtn = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
      expect(submitBtn.disabled).toBe(false)
    })

    // Submit.
    fireEvent.click(screen.getByTestId('qa-preview-worker-submit'))

    // The POST hits the Worker URL.
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] ?? []
    expect(calledUrl).toBe('https://qa.rentenwiki.de/submit')
    expect(calledInit?.method).toBe('POST')
    expect(calledInit?.headers).toMatchObject({ 'content-type': 'application/json' })
    const body = JSON.parse(calledInit?.body as string)
    expect(body.turnstileToken).toBe('fake-turnstile-token')
    expect(body.title).toBeTruthy()
    expect(body.body).toContain('Worker submit test feedback.')

    // Success status renders the issue link.
    await waitFor(() => {
      const status = screen.getByTestId('qa-preview-status')
      expect(status.textContent).toContain('Issue erstellt')
      const link = status.querySelector('a')
      expect(link?.getAttribute('href')).toBe(
        'https://github.com/PeterHartwieg/Rentenrechner/issues/42',
      )
    })

    // Submit button now disabled (already submitted).
    const submitBtn = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('error path: Worker responds 403; German error surfaces in status', async () => {
    fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'turnstile_failed',
            message: 'Spam-Schutz-Prüfung fehlgeschlagen.',
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await navigateToPreview()
    fireEvent.click(screen.getByTestId('qa-preview-worker-consent'))

    await waitFor(() => {
      expect(
        (screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })

    fireEvent.click(screen.getByTestId('qa-preview-worker-submit'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    await waitFor(() => {
      const status = screen.getByTestId('qa-preview-status')
      expect(status.textContent).toContain('Spam-Schutz-Prüfung fehlgeschlagen')
    })
  })

  it('no-network when consent stays unticked: mounting QaPreview does not call fetch', async () => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('fetch should not be called')))
    vi.stubGlobal('fetch', fetchSpy)

    await navigateToPreview()
    // Consent NOT ticked. Submit button stays disabled.
    expect(
      (screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    // No Turnstile widget rendered yet.
    expect(screen.queryByTestId('qa-preview-worker-turnstile')).toBeNull()
    // No fetch called.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
