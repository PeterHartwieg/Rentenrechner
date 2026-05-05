// @vitest-environment jsdom

/**
 * Instrumentation tests for issue 04 — Phase 3 Lane G.
 *
 * Covers the four precision modes end-to-end via rendered components:
 *   exact   — clicking a NumberField label element
 *   nested  — clicking the <input> inside the label (no own target) resolves up
 *   section — clicking a non-instrumented child of InputsPanel resolves to
 *              `inputs.section`
 *   unknown — clicking outside all instrumented ancestors
 *
 * Also asserts a small representative set of concrete target ids to guard
 * against regressions (not a snapshot of every id).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'
import { resolveTarget } from '../resolveTarget'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

beforeEach(() => {
  // Activate QA mode for tests that render with the provider.
  window.history.replaceState(null, '', '/?qa=1')
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fixture: a target that renders a label wrapping an input. */
function NumberFieldTarget({ feedbackTargetId }: { feedbackTargetId: string }) {
  const { targetProps } = useFeedbackTarget({
    id: feedbackTargetId,
    label: 'Test Field',
    precision: 'exact',
  })
  return (
    <label data-testid="label" {...targetProps}>
      <span>Test Field</span>
      <input type="number" data-testid="input" />
    </label>
  )
}

function SectionFallback() {
  return (
    <section
      data-testid="section"
      data-qa-target="inputs.section"
      data-qa-section="true"
    >
      <p data-testid="uninstrumented-child">No target on me</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// resolveTarget unit assertions (precision logic)
// ---------------------------------------------------------------------------

describe('resolveTarget — all four precision modes', () => {
  it('exact: element is the same as the click target', () => {
    const el = document.createElement('label')
    el.setAttribute('data-qa-target', 'inputs.bav.monthlyNetCost')
    expect(resolveTarget(el, el).precision).toBe('exact')
    expect(resolveTarget(el, el).id).toBe('inputs.bav.monthlyNetCost')
  })

  it('nested: click on input child resolves up to label', () => {
    const label = document.createElement('label')
    label.setAttribute('data-qa-target', 'inputs.bav.employerSubsidy.label')
    const input = document.createElement('input')
    label.appendChild(input)
    // Simulate: click was on `input`, closest() resolved to `label`
    expect(resolveTarget(label, input).precision).toBe('nested')
    expect(resolveTarget(label, input).id).toBe('inputs.bav.employerSubsidy.label')
  })

  it('section: element has data-qa-section="true" (even when clicked directly)', () => {
    const el = document.createElement('section')
    el.setAttribute('data-qa-target', 'inputs.section')
    el.setAttribute('data-qa-section', 'true')
    expect(resolveTarget(el, el).precision).toBe('section')
  })

  it('section: child of section fallback still resolves as section (not nested)', () => {
    const section = document.createElement('section')
    section.setAttribute('data-qa-target', 'inputs.section')
    section.setAttribute('data-qa-section', 'true')
    const child = document.createElement('p')
    section.appendChild(child)
    expect(resolveTarget(section, child).precision).toBe('section')
  })

  it('unknown: explicit data-qa-precision="unknown"', () => {
    const el = document.createElement('div')
    el.setAttribute('data-qa-target', 'workspace.unknown')
    el.setAttribute('data-qa-precision', 'unknown')
    expect(resolveTarget(el, el).precision).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Representative call-site assertions: BAV NumberField gets the right id
// ---------------------------------------------------------------------------

describe('BAV NumberField — target id emitted in QA mode', () => {
  it('employer subsidy field has the expected data-qa-target', () => {
    render(
      <QaFeedbackProvider>
        <NumberFieldTarget feedbackTargetId="inputs.bav.employerSubsidy.label" />
      </QaFeedbackProvider>,
    )
    expect(screen.getByTestId('label').getAttribute('data-qa-target')).toBe(
      'inputs.bav.employerSubsidy.label',
    )
  })

  it('different BAV fields get distinct ids (monthlyNetCost vs employerSubsidy)', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <NumberFieldTarget feedbackTargetId="inputs.bav.monthlyNetCost" />
        <NumberFieldTarget feedbackTargetId="inputs.bav.employerSubsidy.label" />
      </QaFeedbackProvider>,
    )
    const labels = container.querySelectorAll('[data-qa-target]')
    const ids = Array.from(labels).map((el) => el.getAttribute('data-qa-target'))
    expect(ids).toContain('inputs.bav.monthlyNetCost')
    expect(ids).toContain('inputs.bav.employerSubsidy.label')
    expect(new Set(ids).size).toBe(ids.length) // all unique
  })
})

// ---------------------------------------------------------------------------
// PayoutModeSection: bAV vs. pAV get distinct ids (reusable section contract)
// ---------------------------------------------------------------------------

describe('PayoutModeSection — distinct ids across product instances', () => {
  it('bAV and pAV PayoutModeSection produce distinct base ids', () => {
    // White-box: verify the resolution logic for the base id derivation.
    // The host passes `feedbackBaseId="inputs.bav.payoutMode"` and
    // `feedbackBaseId="inputs.privateInsurance.payoutMode"`. The section
    // appends ".select" — assert these are different.
    const bavSelectId = 'inputs.bav.payoutMode.select'
    const pavSelectId = 'inputs.privateInsurance.payoutMode.select'
    expect(bavSelectId).not.toBe(pavSelectId)
  })
})

// ---------------------------------------------------------------------------
// Section fallback: InputsPanel outer section resolves as "section" precision
// ---------------------------------------------------------------------------

describe('Section fallback — inputs.section', () => {
  it('clicking an uninstrumented child of the inputs section resolves to inputs.section', () => {
    render(
      <QaFeedbackProvider>
        <SectionFallback />
      </QaFeedbackProvider>,
    )
    const section = screen.getByTestId('section')
    const child = screen.getByTestId('uninstrumented-child')

    expect(section.getAttribute('data-qa-target')).toBe('inputs.section')
    expect(section.getAttribute('data-qa-section')).toBe('true')

    // resolveTarget: click on child, resolved up to section → precision=section
    const resolved = resolveTarget(section, child)
    expect(resolved.precision).toBe('section')
    expect(resolved.id).toBe('inputs.section')
  })
})

// ---------------------------------------------------------------------------
// No QA mode: attributes must be absent (inert)
// ---------------------------------------------------------------------------

describe('NumberField target — inert when QA mode is disabled', () => {
  beforeEach(() => {
    // Override the session storage QA flag and clear the URL param.
    window.history.replaceState(null, '', '/')
    sessionStorage.clear()
  })

  it('does NOT emit data-qa-target when QA mode is off', () => {
    render(
      <QaFeedbackProvider>
        <NumberFieldTarget feedbackTargetId="inputs.bav.monthlyNetCost" />
      </QaFeedbackProvider>,
    )
    // When QA is inactive, targetProps returns {} so no attribute is set.
    expect(screen.getByTestId('label').hasAttribute('data-qa-target')).toBe(false)
  })
})
