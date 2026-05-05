// @vitest-environment jsdom

/**
 * QaPreview privacy/opt-in coverage (issue 03 — Phase 1 Lane B).
 *
 * Pins:
 *   - Default render shows ALL privacy flags (scan-friendly section);
 *     localStorageIncluded must read **no** before the tester exports.
 *   - Scenario opt-in is OFF by default; the report.scenarioContext stays
 *     undefined and the markdown does not surface a Scenario section.
 *   - Toggling the opt-in populates `scenarioContext.shareUrl` (always, since
 *     `window.location.href` is available in jsdom) and propagates the
 *     `scenarioStateIncluded` flag.
 *   - When no scenario JSON is available the preview renders an inline
 *     "(scenario excluded)" notice but still attaches the share URL.
 *   - When a scenario-JSON collector is wired, the JSON appears in both the
 *     report payload and the rendered Markdown.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  type: 'copy',
  severity: 'minor',
  comment: 'Wrong word.',
  suggestedText: '',
  includeScreenshot: false,
}

const SCREENSHOT: CapturedScreenshot | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

function renderPreview(overrides: {
  collectScenarioJson?: () => string | undefined
} = {}) {
  return render(
    <QaPreview
      target={TARGET}
      draft={DRAFT}
      screenshot={SCREENSHOT}
      onBack={() => undefined}
      onCancel={() => undefined}
      collectScenarioJson={overrides.collectScenarioJson}
    />,
  )
}

function getMarkdown(): string {
  // The full Markdown is rendered inside a <details><pre> — easiest to read
  // out the textContent.
  const pre = document.querySelector('details pre')
  return pre?.textContent ?? ''
}

describe('QaPreview — privacy display (default render)', () => {
  it('lists all five privacy flags in the Datenschutz section', () => {
    renderPreview()
    const privacy = screen.getByTestId('qa-preview-privacy')
    const within_ = within(privacy)
    expect(within_.getByText(/Sensible Felder maskiert/i)).toBeTruthy()
    expect(within_.getByText(/Eingaben aus dem Bericht ausgeschlossen/i)).toBeTruthy()
    expect(within_.getByText(/Szenario-Daten enthalten/i)).toBeTruthy()
    expect(within_.getByText(/Screenshot enthalten/i)).toBeTruthy()
    expect(within_.getByText(/localStorage enthalten/i)).toBeTruthy()
  })

  it('renders localStorageIncluded as "nein" before the tester exports', () => {
    renderPreview()
    const privacy = screen.getByTestId('qa-preview-privacy')
    const localStorageRow = within(privacy).getByText(/localStorage enthalten/i).closest('li')
    expect(localStorageRow).not.toBeNull()
    expect(localStorageRow?.textContent ?? '').toMatch(/nein/i)
  })

  it('renders scenarioStateIncluded as "nein" by default', () => {
    renderPreview()
    const privacy = screen.getByTestId('qa-preview-privacy')
    const row = within(privacy).getByText(/Szenario-Daten enthalten/i).closest('li')
    expect(row?.textContent ?? '').toMatch(/nein/i)
  })

  it('does not include a Scenario section in the rendered markdown by default', () => {
    renderPreview()
    const md = getMarkdown()
    expect(md).not.toContain('## Scenario share URL')
    expect(md).not.toContain('## Scenario JSON')
  })
})

describe('QaPreview — scenario opt-in toggle', () => {
  it('starts unchecked', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-include-scenario') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('attaches the current href as shareUrl when checked (no scenario JSON collector)', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-include-scenario') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    const md = getMarkdown()
    // Share URL surfaces in the Markdown when opted in.
    expect(md).toContain('## Scenario share URL')
    // The rendered preview also flips the flag display to "ja".
    const privacy = screen.getByTestId('qa-preview-privacy')
    const row = within(privacy).getByText(/Szenario-Daten enthalten/i).closest('li')
    expect(row?.textContent ?? '').toMatch(/ja/i)
  })

  it('shows the inline "(scenario excluded)" note when no JSON is available', () => {
    renderPreview() // No collector wired → returns undefined
    const checkbox = screen.getByTestId('qa-preview-include-scenario') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.getByTestId('qa-preview-scenario-excluded').textContent).toContain('scenario excluded')
  })

  it('does not show the "(scenario excluded)" note when a JSON collector returns content', () => {
    renderPreview({ collectScenarioJson: () => '{"foo":1}' })
    const checkbox = screen.getByTestId('qa-preview-include-scenario') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.queryByTestId('qa-preview-scenario-excluded')).toBeNull()
    const md = getMarkdown()
    expect(md).toContain('## Scenario JSON')
    expect(md).toContain('{"foo":1}')
  })

  it('round-trips: ticking then unticking the checkbox restores the default privacy posture', () => {
    renderPreview()
    const checkbox = screen.getByTestId('qa-preview-include-scenario') as HTMLInputElement

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(getMarkdown()).toContain('## Scenario share URL')

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    const md = getMarkdown()
    expect(md).not.toContain('## Scenario share URL')
    expect(md).not.toContain('## Scenario JSON')
    const privacy = screen.getByTestId('qa-preview-privacy')
    const row = within(privacy).getByText(/Szenario-Daten enthalten/i).closest('li')
    expect(row?.textContent ?? '').toMatch(/nein/i)
  })

  it('never reads window.location.href until the opt-in is checked', () => {
    // The environment.route field captures pathname + search, so we use a
    // hash fragment (which lives only in `href`) as a unique marker. With
    // the box unchecked the marker must not appear anywhere in the Markdown.
    window.history.replaceState(null, '', '/?qa=1#scenario-href-leak-marker')
    renderPreview()
    const md = getMarkdown()
    expect(md).not.toContain('scenario-href-leak-marker')
    // After opt-in, the share URL section appears and includes the marker.
    fireEvent.click(screen.getByTestId('qa-preview-include-scenario'))
    expect(getMarkdown()).toContain('scenario-href-leak-marker')
  })
})
