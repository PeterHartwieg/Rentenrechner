// @vitest-environment jsdom

/**
 * Phase 4 — End-to-end no-network regression (issue 10).
 *
 * Drives the complete QA feedback flow with `QaFeedbackProvider` mounted in
 * QA-on mode (`?qa=1` set before render):
 *   1. Hover and click a registered target to pin it.
 *   2. Composer opens; fill in a comment; advance to preview.
 *   3. Exercise every export path:
 *      - Markdown clipboard (`navigator.clipboard.writeText`).
 *      - Bundle download (`buildFeedbackBundle` -> blob anchor).
 *      - mailto: URL (`buildMailtoUrl` -> `window.open`).
 *      - GitHub issue URL (`buildGithubIssueUrl` -> `window.open`).
 *
 * The whole flow runs with `fetch` and `XMLHttpRequest.prototype.open/.send`
 * spied. Any non-zero call count fails the test — that's the
 * publication-blocking guarantee for the local-only path.
 *
 * Sibling tests (`bundleExport.test.ts`, `outboundDestinations.test.ts`,
 * `privacy-localStorage.test.ts`) pin the same contract at the unit level.
 * This file is the integration safety net: it is the only test that puts
 * the entire pipeline together with a real provider, real DOM events, and
 * a single set of fetch/XHR spies running across every export path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'

// ---------------------------------------------------------------------------
// Mock the dynamic html-to-image import so the screenshot capture resolves
// synchronously to a fake PNG. The screenshot.ts module imports lazily so
// the mock only needs to register the module id; vi.mock hoists it.
// ---------------------------------------------------------------------------

vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue(
    'data:image/png;base64,' + btoa('fake-png-bytes-for-test'),
  ),
}))

// ---------------------------------------------------------------------------
// Network spies: keep references at module scope so each test can read the
// observed call counts after the flow completes.
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.fn>
let xhrOpenSpy: ReturnType<typeof vi.spyOn>
let xhrSendSpy: ReturnType<typeof vi.spyOn>
let originalFetch: typeof fetch | undefined
let openSpy: ReturnType<typeof vi.spyOn>
let writeTextSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Activate QA mode for this whole flow. The provider reads the URL on mount.
  window.history.replaceState(null, '', '/?qa=1')

  // Spy on globalThis.fetch — note we need to keep the spy installable even
  // when the runtime fetch is undefined (jsdom default). We set a stubbed
  // function so any caller would have to go through it.
  originalFetch = (globalThis as { fetch?: typeof fetch }).fetch
  fetchSpy = vi.fn(() =>
    // If anyone calls it, return a never-resolving rejection so the test
    // surfaces the leak through the explicit assertion AND the spy.
    Promise.reject(new Error('fetch should never be called')),
  )
  vi.stubGlobal('fetch', fetchSpy)

  // Spy on XHR. We can't stub XMLHttpRequest constructor because some test
  // libraries or jsdom internals rely on it; instead spy on the two methods
  // any caller must invoke.
  xhrOpenSpy = vi.spyOn(window.XMLHttpRequest.prototype, 'open')
  xhrSendSpy = vi.spyOn(window.XMLHttpRequest.prototype, 'send')

  // Spy on window.open so mailto/GitHub clicks don't actually pop a tab.
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

  // navigator.clipboard.writeText doesn't exist in jsdom — install a stub.
  writeTextSpy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeTextSpy },
  })

  // URL.createObjectURL / revokeObjectURL aren't implemented in jsdom; stub
  // both so the bundle download path completes without throwing.
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mock'),
    })
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalFetch === undefined) {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  } else {
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  }
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

// ---------------------------------------------------------------------------
// Test harness — a tiny app that registers a feedback target. Keeps the test
// self-contained: no calculator, no other features, no engine code.
// ---------------------------------------------------------------------------

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

/**
 * Drive the full flow up to the preview screen:
 *   render -> click target -> fill comment -> click "Vorschau".
 *
 * Returns once the preview is on screen. The screenshot capture is
 * skipped (composer's checkbox is unchecked) so the flow doesn't depend
 * on the html-to-image mock being awaited.
 */
async function openPreview() {
  render(<TestApp />)

  // Sanity: provider activated.
  expect(document.documentElement.getAttribute('data-qa-mode')).toBe('true')

  // Click the registered target — the QaOverlay's capture-phase click
  // handler picks it up and the provider transitions to "composer".
  const host = screen.getByTestId('host')
  fireEvent.click(host)

  // Composer is mounted.
  const composer = await screen.findByTestId('qa-composer')
  expect(composer).toBeTruthy()

  // Disable the screenshot toggle so the preview doesn't block on the
  // mocked html-to-image resolution.
  const screenshotCheckbox = composer.querySelector(
    'input[type="checkbox"]',
  ) as HTMLInputElement | null
  if (screenshotCheckbox?.checked) {
    fireEvent.click(screenshotCheckbox)
  }

  // Fill the comment so the "Vorschau" button enables.
  const textarea = composer.querySelector('textarea') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: 'Test feedback comment.' } })

  // Click the primary "Vorschau" button.
  const previewBtn = composer.querySelector(
    '.qa-panel__btn--primary',
  ) as HTMLButtonElement
  fireEvent.click(previewBtn)

  // Preview is mounted.
  await screen.findByTestId('qa-preview')
}

// ---------------------------------------------------------------------------
// The actual end-to-end test — runs every export path under one set of spies.
// ---------------------------------------------------------------------------

describe('QaFeedbackProvider — full flow no-network regression', () => {
  it('drives the complete flow (target -> composer -> preview -> all four exports) with zero fetch/XHR calls', async () => {
    await openPreview()

    // ─── Export #1: Markdown clipboard ────────────────────────────────────
    fireEvent.click(screen.getByTestId('qa-preview-copy'))
    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalled()
    })
    // The clipboard payload is a non-empty string.
    const clipboardArg = writeTextSpy.mock.calls[0]?.[0]
    expect(typeof clipboardArg).toBe('string')
    expect((clipboardArg as string).length).toBeGreaterThan(0)

    // ─── Export #2: Bundle download ───────────────────────────────────────
    fireEvent.click(screen.getByTestId('qa-preview-download'))
    // The download path is async (blob.arrayBuffer + base64). Wait for the
    // status message to flip so the helper has finished.
    await waitFor(() => {
      const status = document.querySelector('[role="status"]')
      expect(status?.textContent ?? '').toContain('Bundle')
    })

    // ─── Export #3: mailto URL ────────────────────────────────────────────
    fireEvent.click(screen.getByTestId('qa-preview-mailto'))
    // window.open invoked synchronously with a mailto: URL.
    const mailtoCall = openSpy.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].startsWith('mailto:'),
    )
    expect(mailtoCall).toBeDefined()

    // ─── Export #4: GitHub-issue URL ──────────────────────────────────────
    fireEvent.click(screen.getByTestId('qa-preview-github'))
    const githubCall = openSpy.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('github.com'),
    )
    expect(githubCall).toBeDefined()

    // ─── The contract: zero network across the entire flow ───────────────
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrOpenSpy).not.toHaveBeenCalled()
    expect(xhrSendSpy).not.toHaveBeenCalled()
  })

  it('also enforces zero network when the screenshot capture path runs', async () => {
    // Render and pin a target — this time leaving the screenshot checkbox
    // ticked so the html-to-image mock executes inside the composer effect.
    render(<TestApp />)
    fireEvent.click(screen.getByTestId('host'))
    const composer = await screen.findByTestId('qa-composer')

    // Comment + advance.
    const textarea = composer.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Screenshot path.' } })
    const previewBtn = composer.querySelector(
      '.qa-panel__btn--primary',
    ) as HTMLButtonElement
    fireEvent.click(previewBtn)
    await screen.findByTestId('qa-preview')

    // Bundle download (the path that consumes the screenshot blob).
    fireEvent.click(screen.getByTestId('qa-preview-download'))
    await waitFor(() => {
      const status = document.querySelector('[role="status"]')
      expect(status?.textContent ?? '').toContain('Bundle')
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrOpenSpy).not.toHaveBeenCalled()
    expect(xhrSendSpy).not.toHaveBeenCalled()
  })

  it('does not call fetch or XHR while the provider mounts/unmounts in QA-off mode', () => {
    // Sanity: even outside the active flow, mounting the provider with the
    // session flag absent must not kick off any network probe.
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    const { unmount } = render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    unmount()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrOpenSpy).not.toHaveBeenCalled()
    expect(xhrSendSpy).not.toHaveBeenCalled()
  })
})
