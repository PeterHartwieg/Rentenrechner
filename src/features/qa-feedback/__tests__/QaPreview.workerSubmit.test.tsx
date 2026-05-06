// @vitest-environment jsdom

/**
 * QaPreview "Senden" button — Worker submission tests.
 *
 * The simplified preview no longer has a consent checkbox: QA mode itself
 * is opt-in (`?qa=1`), so reaching the preview already means the tester
 * intends to send. Turnstile renders immediately and the Senden button
 * unlocks once the token arrives.
 *
 * Coverage:
 *   1. Happy path — Turnstile callback fires → Senden enables → POST
 *      reaches the Worker URL → success closes the panel.
 *   2. Error path — Worker responds 4xx with a German message; the panel
 *      stays open and surfaces it via role="alert".
 *   3. No-network until the user clicks Senden — mounting the preview does
 *      not call fetch.
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

describe('QaPreview — Senden (worker submit)', () => {
  it('happy path: Turnstile token arrives → POST reaches Worker → panel closes on success', async () => {
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

    // Wait for the fake Turnstile callback to fire and the Senden button to enable.
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
})
