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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('flips localStorageIncluded and userInputsRedacted when scenario JSON is attached', () => {
    // P1#2 review fix: the scenario JSON is read from STORAGE_KEY_V2 and
    // contains user-entered profile/assumption inputs. The privacy summary
    // must reflect that — without this fix, the preview would tell the
    // tester "userInputsRedacted: true" while the bundle ships their salary.
    renderPreview({ collectScenarioJson: () => '{"profile":{"salary":75000}}' })
    fireEvent.click(screen.getByTestId('qa-preview-include-scenario'))
    const privacy = screen.getByTestId('qa-preview-privacy')
    const localStorageRow = within(privacy).getByText(/localStorage enthalten/i).closest('li')
    const inputsRow = within(privacy).getByText(/Eingaben aus dem Bericht ausgeschlossen/i).closest('li')
    expect(localStorageRow?.textContent ?? '').toMatch(/ja/i)
    expect(inputsRow?.textContent ?? '').toMatch(/nein/i)
  })

  it('keeps localStorageIncluded false when opt-in is checked but only a share URL is attached', () => {
    // Share URL alone doesn't read localStorage and doesn't ship user inputs.
    // Only a non-empty scenario JSON warrants flipping those flags.
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-include-scenario'))
    const privacy = screen.getByTestId('qa-preview-privacy')
    const localStorageRow = within(privacy).getByText(/localStorage enthalten/i).closest('li')
    const inputsRow = within(privacy).getByText(/Eingaben aus dem Bericht ausgeschlossen/i).closest('li')
    expect(localStorageRow?.textContent ?? '').toMatch(/nein/i)
    expect(inputsRow?.textContent ?? '').toMatch(/ja/i)
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

// ─── Issue 08 Lane F: outbound destination buttons ────────────────────────────

describe('QaPreview — mailto and GitHub-issue buttons (issue 08)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the "Per E-Mail senden" button', () => {
    renderPreview()
    expect(screen.getByTestId('qa-preview-mailto')).toBeTruthy()
  })

  it('renders the "GitHub-Issue öffnen" button', () => {
    renderPreview()
    expect(screen.getByTestId('qa-preview-github')).toBeTruthy()
  })

  it('clicking mailto button calls window.open with _blank and noopener,noreferrer', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-mailto'))
    expect(openSpy).toHaveBeenCalledOnce()
    const [url, target, features] = openSpy.mock.calls[0] as [string, string, string]
    expect(url.startsWith('mailto:')).toBe(true)
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')
  })

  it('clicking GitHub button calls window.open with _blank and noopener,noreferrer', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-github'))
    expect(openSpy).toHaveBeenCalledOnce()
    const [url, target, features] = openSpy.mock.calls[0] as [string, string, string]
    expect(url).toContain('github.com')
    expect(url).toContain('/issues/new')
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')
  })

  it('mailto URL opened by the button contains the correct subject', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-mailto'))
    const [url] = openSpy.mock.calls[0] as [string]
    const match = /subject=([^&]+)/.exec(url)
    expect(match).not.toBeNull()
    const subject = decodeURIComponent(match![1])
    // Should contain the target id from DRAFT/TARGET.
    expect(subject).toContain('inputs.bav.employerSubsidy.label')
  })

  it('GitHub URL opened by the button contains title and body params', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-github'))
    const [url] = openSpy.mock.calls[0] as [string]
    const parsed = new URL(url)
    expect(parsed.searchParams.has('title')).toBe(true)
    expect(parsed.searchParams.has('body')).toBe(true)
  })

  it('shows a status message after opening the mailto destination', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-mailto'))
    const status = document.querySelector('[role="status"]')
    expect(status?.textContent).toContain('E-Mail')
  })

  it('shows a status message after opening the GitHub destination', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderPreview()
    fireEvent.click(screen.getByTestId('qa-preview-github'))
    const status = document.querySelector('[role="status"]')
    expect(status?.textContent).toContain('GitHub')
  })
})
