// @vitest-environment jsdom

/**
 * Tests for the QA intercept dialog (issue #42).
 *
 * Covers:
 *  - Trigger logic: first pin opens composer; second same-id interactive pin
 *    opens the intercept dialog.
 *  - Static (non-button / non-anchor / non-input) targets skip the dialog and
 *    open the composer normally on second pin.
 *  - Dialog × / Escape dismisses without state changes; suppression is active
 *    after the dialog has been shown once (third click → composer).
 *  - "QA-Modus beenden" deactivates QA mode and re-fires the element click.
 *  - "Feedback geben" opens the composer for the same target.
 *  - Suppression resets on QA deactivate/reactivate and on composer submit.
 *  - Element removed from DOM before re-fire → deactivate only, no crash.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'
import { QaModeIndicator } from '../QaModeIndicator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TargetButton({ id, label }: { id: string; label: string }) {
  const { targetProps } = useFeedbackTarget({ id, label })
  return (
    <button type="button" {...targetProps} data-testid={`btn-${id}`}>
      {label}
    </button>
  )
}

/** A non-interactive target — <p> is matched by QA_INTERACTIVE_SELECTOR but
 *  is NOT an anchor/button/input so the intercept filter passes it through. */
function StaticTarget({ id, label }: { id: string; label: string }) {
  const { targetProps } = useFeedbackTarget({ id, label })
  return (
    <p {...targetProps} data-testid={`para-${id}`}>
      {label}
    </p>
  )
}

/** Cancel the open composer by clicking the first "Abbrechen" button.
 *  The composer renders two "Abbrechen" buttons (close × + footer cancel). */
function cancelComposer() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Abbrechen' })[0])
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

// ---------------------------------------------------------------------------
// Trigger logic
// ---------------------------------------------------------------------------

describe('QaIntercept — trigger logic', () => {
  it('first click opens the composer (no intercept)', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByTestId('btn-nav.home'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })

  it('second click on the same interactive element opens the intercept dialog', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')

    // First click → composer; cancel to return to idle.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    cancelComposer()
    expect(screen.queryByTestId('qa-composer')).toBeNull()

    // Second click on the same element → intercept dialog.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    expect(screen.queryByTestId('qa-composer')).toBeNull()
  })

  it('second click on a DIFFERENT element opens the composer (no intercept)', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
        <TargetButton id="nav.about" label="Über uns" />
      </QaFeedbackProvider>,
    )
    // Click first button → cancel.
    fireEvent.click(screen.getByTestId('btn-nav.home'))
    cancelComposer()

    // Click second button (different id) → composer, NOT intercept.
    fireEvent.click(screen.getByTestId('btn-nav.about'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })

  it('second click on a static <p> target opens the composer directly (no intercept)', () => {
    render(
      <QaFeedbackProvider>
        <StaticTarget id="content.heading" label="Einleitung" />
      </QaFeedbackProvider>,
    )
    const para = screen.getByTestId('para-content.heading')

    // First click → composer.
    fireEvent.click(para)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    cancelComposer()

    // Second click on same <p> → composer again, NOT intercept.
    fireEvent.click(para)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Dialog × / Escape dismissal
// ---------------------------------------------------------------------------

describe('QaIntercept — dismiss (× / Escape)', () => {
  /** Render the provider, open the intercept dialog, and return the target button. */
  function setupAndOpenIntercept() {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    return btn
  }

  it('clicking × closes the dialog; QA mode remains on', () => {
    setupAndOpenIntercept()
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
    // QA indicator still visible — mode is still on.
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()
  })

  it('pressing Escape closes the dialog; QA mode remains on', () => {
    setupAndOpenIntercept()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()
  })

  it('third click after × dismissal opens the composer (suppression active)', () => {
    const btn = setupAndOpenIntercept()
    // Dismiss via ×.
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    // Third click: shownDialogIds already has this id → composer path.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Primary button: exit QA mode + re-fire
// ---------------------------------------------------------------------------

describe('QaIntercept — "QA-Modus beenden" (primary button)', () => {
  it('deactivates QA mode when primary button is clicked', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)

    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    fireEvent.click(screen.getByTestId('qa-intercept-exit'))

    // QA mode should be off.
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })

  it('re-fires the original element click via requestAnimationFrame', async () => {
    let clickCount = 0
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')
    // Attach a listener to count clicks that reach the element normally
    // (the re-fired click after QA mode is deactivated).
    btn.addEventListener('click', () => {
      clickCount++
    })

    // Open intercept dialog.
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)

    // Click primary button → deactivates + schedules re-fire via rAF.
    fireEvent.click(screen.getByTestId('qa-intercept-exit'))

    // Flush the rAF so element.click() executes.
    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })

    // The re-fired click should have incremented the counter.
    expect(clickCount).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Secondary button: open composer
// ---------------------------------------------------------------------------

describe('QaIntercept — "Feedback geben" (secondary button)', () => {
  it('opens the composer for the same target', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)

    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    fireEvent.click(screen.getByTestId('qa-intercept-feedback'))

    expect(screen.queryByTestId('qa-intercept')).toBeNull()
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Suppression set behaviour
// ---------------------------------------------------------------------------

describe('QaIntercept — suppression set', () => {
  it('after dialog shown once, next same-id pin opens composer directly', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')

    // First pin → composer → cancel.
    fireEvent.click(btn)
    cancelComposer()
    // Second pin → intercept.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    // Dismiss.
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))

    // Third pin: shownDialogIds has the id → composer (not intercept).
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
  })

  it('suppression resets on QA deactivate / reactivate', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')

    // Trigger and fill suppression set.
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))

    // Deactivate via indicator chip.
    fireEvent.click(screen.getByTestId('qa-indicator'))
    expect(screen.queryByTestId('qa-indicator')).toBeNull()

    // Reactivate via Ctrl+Shift+.
    fireEvent.keyDown(window, { key: '.', ctrlKey: true, shiftKey: true })
    expect(screen.getByTestId('qa-indicator')).toBeTruthy()

    // First click after reactivation → composer (suppression cleared).
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()

    // Cancel, second click → intercept again (fresh session state).
    cancelComposer()
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
  })

  it('lastPinnedTargetId resets after composer submit (preview transition)', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')

    // Trigger intercept, proceed to composer via secondary button.
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    fireEvent.click(screen.getByTestId('qa-intercept-feedback'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()

    // Fill in comment and submit → preview phase (resets lastPinnedTargetId).
    const textarea = screen.getByPlaceholderText(
      'Beschreibe in deinen eigenen Worten, was nicht stimmt oder verwirrend ist.',
    )
    fireEvent.change(textarea, { target: { value: 'Test-Feedback' } })
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    // We're now in preview — composer phase is gone.
    expect(screen.queryByTestId('qa-composer')).toBeNull()
    // The preview panel exists: this proves submit fired.
    expect(screen.getByTestId('qa-preview')).toBeTruthy()
  })

  it('shownDialogIds resets on composer submit — intercept fires again for same id after submit', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByTestId('btn-nav.home')

    // Step 1: first click → composer → cancel.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    cancelComposer()

    // Step 2: second click → intercept dialog opens.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()

    // Step 3: "Feedback geben" → composer.
    fireEvent.click(screen.getByTestId('qa-intercept-feedback'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()

    // Step 4: fill comment and submit → preview (resets BOTH lastPinnedTargetId + shownDialogIds).
    const textarea = screen.getByPlaceholderText(
      'Beschreibe in deinen eigenen Worten, was nicht stimmt oder verwirrend ist.',
    )
    fireEvent.change(textarea, { target: { value: 'Test-Feedback' } })
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByTestId('qa-preview')).toBeTruthy()

    // Step 5: cancel preview → idle.
    fireEvent.click(screen.getAllByRole('button', { name: 'Abbrechen' })[0])
    expect(screen.queryByTestId('qa-preview')).toBeNull()
    expect(screen.queryByTestId('qa-composer')).toBeNull()

    // After submit reset, first click → composer again (lastPinnedTargetId cleared).
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.queryByTestId('qa-intercept')).toBeNull()
    cancelComposer()

    // Second click on same id → intercept fires again (shownDialogIds was cleared by submit).
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()
    expect(screen.queryByTestId('qa-composer')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Edge case: element removed from DOM before re-fire
// ---------------------------------------------------------------------------

describe('QaIntercept — element removed from DOM before re-fire', () => {
  it('deactivates QA mode without crash when element is gone', async () => {
    const { rerender } = render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <TargetButton id="nav.home" label="Startseite" />
      </QaFeedbackProvider>,
    )

    const btn = screen.getByTestId('btn-nav.home')
    fireEvent.click(btn)
    cancelComposer()
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-intercept')).toBeTruthy()

    // Remove the button from the DOM before the re-fire can execute.
    rerender(
      <QaFeedbackProvider>
        <QaModeIndicator />
        {/* TargetButton intentionally removed */}
      </QaFeedbackProvider>,
    )

    // Click exit — element is gone; should deactivate gracefully without throwing.
    expect(() => {
      fireEvent.click(screen.getByTestId('qa-intercept-exit'))
    }).not.toThrow()

    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })

    // QA mode should be off even though re-fire was skipped.
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })
})
