// @vitest-environment jsdom

/**
 * Target-precision tests for QaOverlay (Lane D / issue 05).
 *
 * Covers all four precision values:
 *   exact   — clicked the instrumented element itself.
 *   nested  — clicked a child of a target; closest() resolved it.
 *   section — no exact target; fell back to a data-qa-section container.
 *   unknown — no target found anywhere.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function ExactTarget() {
  const { targetProps } = useFeedbackTarget({ id: 'inputs.bav.employerSubsidy.label' })
  return (
    <button type="button" data-testid="exact-btn" {...targetProps}>
      Exact
    </button>
  )
}

function NestedTarget() {
  // The parent has the qa-target; the span inside does not.
  const { targetProps } = useFeedbackTarget({ id: 'inputs.bav.section' })
  return (
    <div data-testid="nested-parent" {...targetProps}>
      <span data-testid="nested-child">Inner child</span>
    </div>
  )
}

function SectionTarget() {
  // A section-level fallback: has data-qa-section="true".
  const { targetProps } = useFeedbackTarget({ id: 'workspace.main.section', precision: 'section' })
  return (
    <main data-testid="section-container" data-qa-section="true" {...targetProps}>
      <p data-testid="section-child">No instrumented child here</p>
    </main>
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

// ---------------------------------------------------------------------------
// Helpers to read the precision from the composer that opens after a click.
// The composer header shows the target id; we verify the precision via the
// `resolveTarget` export from QaOverlay (white-box) to avoid coupling to
// rendered composer copy.
// ---------------------------------------------------------------------------

import { resolveTarget } from '../resolveTarget'

describe('resolveTarget — precision logic', () => {
  it('returns exact when the resolved element is the same as the click target', () => {
    const el = document.createElement('button')
    el.setAttribute('data-qa-target', 'inputs.bav.btn')
    const result = resolveTarget(el, el)
    expect(result.precision).toBe('exact')
  })

  it('returns nested when the resolved element is an ancestor of the click target', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-qa-target', 'inputs.bav.section')
    const child = document.createElement('span')
    parent.appendChild(child)
    // Simulate: the click was on `child`, but closest() resolved to `parent`.
    const result = resolveTarget(parent, child)
    expect(result.precision).toBe('nested')
  })

  it('returns section when the element has data-qa-section="true"', () => {
    const el = document.createElement('main')
    el.setAttribute('data-qa-target', 'workspace.main.section')
    el.setAttribute('data-qa-section', 'true')
    const result = resolveTarget(el, el)
    expect(result.precision).toBe('section')
  })

  it('returns section when only data-qa-precision="section" is set (no marker)', () => {
    // Defensive branch: hand-rolled markup using `useFeedbackTarget({precision: 'section'})`
    // emits `data-qa-precision="section"`. The hook now also emits the section
    // marker, but resolveTarget should still classify the precision attribute
    // as section even if the marker is absent. Regression: review note 2.
    const el = document.createElement('section')
    el.setAttribute('data-qa-target', 'legal.footer.container')
    el.setAttribute('data-qa-precision', 'section')
    const result = resolveTarget(el, el)
    expect(result.precision).toBe('section')
    expect(result.id).toBe('legal.footer.container')
  })

  it('returns section even when clicked from a child (section takes precedence over nested)', () => {
    const el = document.createElement('main')
    el.setAttribute('data-qa-target', 'workspace.main.section')
    el.setAttribute('data-qa-section', 'true')
    const child = document.createElement('p')
    el.appendChild(child)
    const result = resolveTarget(el, child)
    expect(result.precision).toBe('section')
  })

  it('returns unknown when precision attr is "unknown"', () => {
    const el = document.createElement('div')
    el.setAttribute('data-qa-target', 'workspace.unknown')
    el.setAttribute('data-qa-precision', 'unknown')
    const result = resolveTarget(el, el)
    expect(result.precision).toBe('unknown')
  })

  it('honours explicit data-qa-precision="exact" even when originalTarget differs', () => {
    const el = document.createElement('div')
    el.setAttribute('data-qa-target', 'inputs.section')
    el.setAttribute('data-qa-precision', 'exact')
    const child = document.createElement('span')
    // Explicit 'exact' wins over auto-detection.
    const result = resolveTarget(el, child)
    expect(result.precision).toBe('exact')
  })
})

// ---------------------------------------------------------------------------
// Integration: verify that clicking a child of a target element opens the
// composer (nested resolution works end-to-end).
// ---------------------------------------------------------------------------

describe('QaOverlay — nested resolution (integration)', () => {
  it('opens the composer after clicking a child of a target element', () => {
    render(
      <QaFeedbackProvider>
        <NestedTarget />
      </QaFeedbackProvider>,
    )
    // Click the inner child span — overlay should walk up to the parent div.
    fireEvent.click(screen.getByTestId('nested-child'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
  })

  it('opens the composer after clicking inside a section-level container', () => {
    render(
      <QaFeedbackProvider>
        <SectionTarget />
      </QaFeedbackProvider>,
    )
    // Click a child inside the section container.
    fireEvent.click(screen.getByTestId('section-child'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
  })

  it('does NOT open the composer when clicking outside all targets', () => {
    render(
      <QaFeedbackProvider>
        <ExactTarget />
        <div data-testid="no-target">Outside</div>
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByTestId('no-target'))
    expect(screen.queryByTestId('qa-composer')).toBeNull()
  })

  it('opens the composer on exact click (sanity)', () => {
    render(
      <QaFeedbackProvider>
        <ExactTarget />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByTestId('exact-btn'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
  })
})
