// @vitest-environment jsdom

/**
 * Lane C (issue 06) — accessibility tests for QaComposer.
 *
 * Covers:
 *   - Focus moves into the type-radiogroup on mount.
 *   - `role="dialog"` is present.
 *   - ESC cancels.
 *   - Ctrl+Enter submits when comment is non-empty.
 *   - Focus is restored to the previously-focused element on cancel.
 *   - `qa-composer--sheet` class is present when window.innerWidth <= 640.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaComposer, type ComposerDraft } from '../QaComposer'
import type { ResolvedTarget } from '../report'
import { mockViewport } from '../../../test/viewport'

const TARGET: ResolvedTarget = {
  id: 'inputs.bav.employerSubsidy.label',
  label: 'AG-Zuschuss',
  precision: 'exact',
}

const DRAFT: ComposerDraft = {
  type: 'other',
  severity: 'minor',
  comment: '',
  suggestedText: '',
  includeScreenshot: false,
}

function makeDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return { ...DRAFT, ...overrides }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Reset viewport to desktop so a thrown assertion in a phone-mode test
  // does not leak innerWidth into the next test.
  mockViewport('desktop')
})

beforeEach(() => {
  // Reset viewport to desktop by default. PR 11 — replaces the previous
  // ad-hoc `Object.defineProperty(window, 'innerWidth', ...)` stub with the
  // shared `mockViewport` helper so all viewport mocking goes through one
  // canonical implementation.
  mockViewport('desktop')
})

describe('QaComposer — role and ARIA', () => {
  it('renders with role="dialog"', () => {
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('dialog has aria-labelledby pointing to the title element', () => {
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const titleEl = document.getElementById(labelId!)
    expect(titleEl?.textContent).toContain('Hilf uns, RentenWiki zu verbessern')
  })

  it('dialog has aria-describedby pointing to the target description', () => {
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const descId = dialog.getAttribute('aria-describedby')
    expect(descId).toBeTruthy()
    const descEl = document.getElementById(descId!)
    expect(descEl?.textContent).toContain('AG-Zuschuss')
  })
})

describe('QaComposer — focus management', () => {
  it('moves focus into the comment textarea on mount (requestAnimationFrame)', () => {
    vi.useFakeTimers()
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    // Flush all pending rAF callbacks.
    vi.runAllTimers()
    const textarea = document.querySelector<HTMLElement>('textarea')
    expect(document.activeElement).toBe(textarea)
    vi.useRealTimers()
  })

  it('restores focus to the previously-focused element on cancel', async () => {
    // Create an external button that will be focused before the composer mounts.
    const externalBtn = document.createElement('button')
    externalBtn.textContent = 'External'
    document.body.appendChild(externalBtn)
    externalBtn.focus()
    expect(document.activeElement).toBe(externalBtn)

    const onCancel = vi.fn()
    const { unmount } = render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={onCancel}
        onSubmit={() => undefined}
      />,
    )

    // Unmount (simulating cancel).
    unmount()

    // Focus should return to the external button.
    expect(document.activeElement).toBe(externalBtn)
    document.body.removeChild(externalBtn)
  })
})

describe('QaComposer — keyboard handlers', () => {
  it('ESC calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={onCancel}
        onSubmit={() => undefined}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter submits when comment is non-empty', () => {
    const onSubmit = vi.fn()
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft({ comment: 'Something is wrong' })}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter does NOT submit when comment is empty', () => {
    const onSubmit = vi.fn()
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft({ comment: '' })}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Cmd+Enter (metaKey) also submits when comment is non-empty', () => {
    const onSubmit = vi.fn()
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft({ comment: 'Bug here' })}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keyboard submission uses the latest comment value (no stale closure)', () => {
    // P2#2 review fix: the keydown listener was previously bound to a closure
    // over an older `handleSubmit`, which (with `screenshot` and `submitting`
    // omitted from the deps array) could drop the just-captured screenshot
    // or the latest comment text when the user fires Ctrl+Enter while the
    // composer was actively re-rendering.
    const onSubmit = vi.fn()
    const initial = makeDraft({ comment: '' })
    const updated = makeDraft({ comment: 'fresh comment after re-render' })
    const { rerender } = render(
      <QaComposer
        target={TARGET}
        draft={initial}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )
    // Re-render with the updated draft, simulating the parent passing a new
    // comment (which is the path that used to leave the keydown closure stale).
    rerender(
      <QaComposer
        target={TARGET}
        draft={updated}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(updated)
  })
})

describe('QaComposer — mobile sheet class', () => {
  it('adds qa-composer--sheet class on phone viewport', () => {
    // PR 11 — replaced the previous `Object.defineProperty(window, 'innerWidth', ...)`
    // stub with `mockViewport('phone')` so all viewport mocking routes through
    // the canonical helper. `mockViewport('phone')` sets `innerWidth = 390`
    // which is well below QaComposer's 640px sheet breakpoint.
    mockViewport('phone')
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const composer = screen.getByTestId('qa-composer')
    expect(composer.classList.contains('qa-composer--sheet')).toBe(true)
  })

  it('does NOT add qa-composer--sheet class on desktop viewport', () => {
    mockViewport('desktop')
    render(
      <QaComposer
        target={TARGET}
        draft={makeDraft()}
        onChangeDraft={() => undefined}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const composer = screen.getByTestId('qa-composer')
    expect(composer.classList.contains('qa-composer--sheet')).toBe(false)
  })
})
