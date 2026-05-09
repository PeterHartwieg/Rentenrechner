// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QaFeedbackProvider, QA_SESSION_KEY } from '../QaFeedbackProvider'
import { QaModeIndicator } from '../QaModeIndicator'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  // Reset the URL so each test starts from a clean search string.
  window.history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-qa-mode')
})

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('QaFeedbackProvider — activation', () => {
  it('does NOT activate without ?qa=1', () => {
    render(
      <QaFeedbackProvider>
        <div data-testid="child">child</div>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
    expect(document.documentElement.getAttribute('data-qa-mode')).toBeNull()
  })

  it('activates when ?qa=1 is present in the URL', () => {
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <div data-testid="child">child</div>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()
    expect(document.documentElement.getAttribute('data-qa-mode')).toBe('true')
  })

  it('writes the active flag to sessionStorage', () => {
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <div>child</div>
      </QaFeedbackProvider>,
    )
    expect(sessionStorage.getItem(QA_SESSION_KEY)).toBe('1')
  })

  it('honours an existing sessionStorage flag without ?qa=1 (round-trip)', () => {
    sessionStorage.setItem(QA_SESSION_KEY, '1')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()
  })

  it('clears the session flag when ?qa=0 is present', () => {
    sessionStorage.setItem(QA_SESSION_KEY, '1')
    window.history.replaceState(null, '', '/?qa=0')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(sessionStorage.getItem(QA_SESSION_KEY)).toBeNull()
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('NEVER writes the QA flag to localStorage (sessionStorage-only contract)', () => {
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    // The provider may not be the only writer to localStorage globally, but
    // for the QA-mode flag specifically: localStorage must remain empty in
    // these isolated tests (we cleared it in beforeEach).
    expect(localStorage.length).toBe(0)
  })

  it('removes the data-qa-mode attribute when the provider unmounts', () => {
    window.history.replaceState(null, '', '/?qa=1')
    const { unmount } = render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(document.documentElement.getAttribute('data-qa-mode')).toBe('true')
    unmount()
    expect(document.documentElement.getAttribute('data-qa-mode')).toBeNull()
  })

  it('renders QaModeIndicator with native button semantics, no role override', () => {
    // P3 review fix: previously the chip had role="status" which overrode
    // its implicit button role for assistive tech. The chip is now a plain
    // <button> with its German aria-label.
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    const indicator = screen.getByTestId('qa-indicator')
    expect(indicator.tagName).toBe('BUTTON')
    expect(indicator.getAttribute('role')).toBeNull()
    expect(indicator.getAttribute('aria-live')).toBeNull()
    expect(indicator.getAttribute('aria-label')).toMatch(/Feedback Modus aktiv/)
  })
})

describe('QaFeedbackProvider — Ctrl+Shift+. keyboard shortcut', () => {
  function fireShortcut() {
    fireEvent.keyDown(window, { key: '.', ctrlKey: true, shiftKey: true })
  }

  it('activates QA mode when pressing Ctrl+Shift+. with QA off', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-indicator')).toBeNull()

    fireShortcut()

    expect(screen.getByTestId('qa-indicator')).toBeTruthy()
    expect(document.documentElement.getAttribute('data-qa-mode')).toBe('true')
    expect(sessionStorage.getItem(QA_SESSION_KEY)).toBe('1')
  })

  it('deactivates QA mode when pressing Ctrl+Shift+. with QA on', () => {
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()

    fireShortcut()

    expect(screen.queryByTestId('qa-indicator')).toBeNull()
    expect(document.documentElement.getAttribute('data-qa-mode')).toBeNull()
    expect(sessionStorage.getItem(QA_SESSION_KEY)).toBeNull()
  })

  it('toggles QA mode on and off in two successive keystrokes', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-indicator')).toBeNull()

    fireShortcut()
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()

    fireShortcut()
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('does NOT activate for Ctrl+. (missing Shift)', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    fireEvent.keyDown(window, { key: '.', ctrlKey: true, shiftKey: false })
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('does NOT activate for Ctrl+Shift+Q (wrong key)', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    fireEvent.keyDown(window, { key: 'q', ctrlKey: true, shiftKey: true })
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('indicator chip title attribute shows the shortcut hint', () => {
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
      </QaFeedbackProvider>,
    )
    const indicator = screen.getByTestId('qa-indicator')
    // title contains the shortcut (Ctrl+Shift+. or ⌘+Shift+.)
    expect(indicator.getAttribute('title')).toMatch(/Shift\+\./)
  })
})
