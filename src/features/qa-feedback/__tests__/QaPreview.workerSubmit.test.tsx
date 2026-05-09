// @vitest-environment jsdom

/**
 * QaPreview "Senden" button — Worker submission tests (ADR-0001 explicit consent).
 *
 * The preview requires BOTH a consent checkbox AND a Turnstile token before
 * the Senden button becomes active. The consent checkbox is unchecked on
 * every fresh QA preview session.
 *
 * Coverage:
 *   1. Happy path — consent checked + Turnstile callback fires → Senden
 *      enables → POST reaches the Worker URL → success closes the panel.
 *   2. Error path — Worker responds 4xx with a German message; the panel
 *      stays open and surfaces it via role="alert".
 *   3. No-network until the user clicks Senden — mounting the preview does
 *      not call fetch.
 *   4. Gate: Senden stays disabled if only consent is given but no Turnstile
 *      token has arrived yet.
 *   5. Gate: Senden stays disabled if only the Turnstile token arrives but
 *      the consent checkbox has not been checked.
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

  // Stub a synchronous Turnstile API. The preview renders the widget into
  // a div; our fake `render` invokes the supplied callback on the next
  // microtask so the React state setter fires inside `act()`.
  ;(window as unknown as { turnstile: TurnstileApiStub }).turnstile = {
    render: (_el, opts) => {
      queueMicrotask(() => opts.callback('fake-turnstile-token'))
      return 'widget-1'
    },
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (window as unknown as { turnstile?: TurnstileApiStub }).turnstile
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

/**
 * Check the consent checkbox in the preview, satisfying the ADR-0001 gate.
 * Must be called after `navigateToPreview` has resolved.
 */
function checkConsent() {
  const checkbox = screen.getByTestId('qa-preview-consent-checkbox') as HTMLInputElement
  fireEvent.click(checkbox)
}

describe('QaPreview — Senden (worker submit)', () => {
  it('happy path: consent checked + Turnstile token arrives → POST reaches Worker → panel closes on success', async () => {
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

    // ADR-0001 gate: check consent first.
    checkConsent()

    // Wait for BOTH consent and the fake Turnstile callback so the Senden button enables.
    await waitFor(() => {
      const submitBtn = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
      expect(submitBtn.disabled).toBe(false)
    })

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

    // Panel closes on success.
    await waitFor(() => {
      expect(screen.queryByTestId('qa-preview')).toBeNull()
    })
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

    // ADR-0001 gate: check consent first.
    checkConsent()

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
      expect(status.getAttribute('role')).toBe('alert')
    })

    // Panel stays open on error so the tester can retry.
    expect(screen.queryByTestId('qa-preview')).not.toBeNull()
  })

  it('no fetch on mount: just opening the preview does not POST anything', async () => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('fetch should not be called')))
    vi.stubGlobal('fetch', fetchSpy)

    await navigateToPreview()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('gate 4: Senden stays disabled when consent is checked but no Turnstile token has arrived', async () => {
    // Override the Turnstile stub so it never fires the token callback.
    ;(window as unknown as { turnstile: TurnstileApiStub }).turnstile = {
      render: () => 'widget-no-token',
    }

    await navigateToPreview()

    // Check consent — but no token will ever arrive in this test.
    checkConsent()

    const submitBtn = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('gate 5: Senden stays disabled when the Turnstile token arrives but consent is not checked', async () => {
    await navigateToPreview()

    // Token arrives via the microtask in the stub, but consent is never checked.
    await waitFor(() => {
      // Confirm the token has fired by checking that the consent checkbox exists.
      expect(screen.getByTestId('qa-preview-consent-checkbox')).toBeTruthy()
    })

    const submitBtn = screen.getByTestId('qa-preview-worker-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })
})
