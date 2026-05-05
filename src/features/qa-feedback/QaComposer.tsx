import { useEffect, useId, useRef, useState } from 'react'
import type { FeedbackType, ResolvedTarget, Severity } from './report'
import { captureViewportScreenshot, type CapturedScreenshot } from './capture/screenshot'
import { useFocusReturn } from './useFocusReturn'

/**
 * Mutable composer state. Lives in the provider's memory only — discarded
 * on cancel and never persisted to localStorage / sessionStorage
 * (DECISIONS §7).
 */
export interface ComposerDraft {
  type: FeedbackType
  severity: Severity
  comment: string
  suggestedText: string
  includeScreenshot: boolean
}

interface ComposerProps {
  target: ResolvedTarget
  draft: ComposerDraft
  onChangeDraft(next: ComposerDraft): void
  onCancel(): void
  onSubmit(next: ComposerDraft, screenshot: CapturedScreenshot | null): void
}

const TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: 'copy', label: 'Text' },
  { value: 'layout', label: 'Layout' },
  { value: 'flow', label: 'Flow' },
  { value: 'interaction', label: 'Interaktion' },
  { value: 'value', label: 'Wert' },
  { value: 'a11y', label: 'A11y' },
  { value: 'other', label: 'Sonstiges' },
]

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string }> = [
  { value: 'blocker', label: 'Blocker' },
  { value: 'major', label: 'Schwerwiegend' },
  { value: 'minor', label: 'Gering' },
  { value: 'nit', label: 'Kleinigkeit' },
]

/** Fallback selector: the QA indicator chip. */
const INDICATOR_SELECTOR = '.qa-indicator'

/**
 * Compact composer panel. Renders directly to the right corner of the
 * viewport while QA mode is active and a target is pinned.
 *
 * Lane C a11y additions:
 *   - `role="dialog"` with `aria-labelledby` and `aria-describedby`.
 *   - Focus moves into the type radiogroup on mount (requestAnimationFrame).
 *   - Focus returns to the previously-focused element (or the indicator chip)
 *     on cancel / submit via `useFocusReturn`.
 *   - ESC cancels; Ctrl/Cmd+Enter submits when comment is non-empty.
 *   - `qa-composer--sheet` class added when window.innerWidth <= 640 for
 *     mobile-sheet layout and test detection.
 */
export function QaComposer({ target, draft, onChangeDraft, onCancel, onSubmit }: ComposerProps) {
  const [submitting, setSubmitting] = useState(false)
  const titleId = useId()
  const descId = useId()

  // Restore focus on unmount (cancel or forward to preview).
  useFocusReturn(INDICATOR_SELECTOR)

  // Move focus into the type-radiogroup on mount.
  const typeGroupRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = typeGroupRef.current?.querySelector<HTMLElement>('[role="radio"]')
      first?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  // Mobile sheet detection — jsdom doesn't compute CSS media queries so we
  // use a class driven by JS for both layout and test assertions.
  const [isSheet, setIsSheet] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    function update() {
      setIsSheet(window.innerWidth <= 640)
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Phase 1 baseline: capture happens once on first render so the screenshot
  // includes the pinned target. Lane B will refine the capture sequencing
  // (e.g. allow a manual mask pass before the rasteriser runs).
  //
  // The effect only writes state from the async resolver; the synchronous
  // "off" branch is handled by clearing the captured screenshot inside the
  // include-screenshot toggle handler so we never call setState in the body
  // of the effect (lint rule react-hooks/set-state-in-effect).
  const [screenshot, setScreenshot] = useState<CapturedScreenshot | null>(null)
  useEffect(() => {
    if (!draft.includeScreenshot) return
    let cancelled = false
    void captureViewportScreenshot().then((shot) => {
      if (cancelled) return
      setScreenshot(shot)
    })
    return () => {
      cancelled = true
    }
  }, [draft.includeScreenshot])

  function update<K extends keyof ComposerDraft>(key: K, value: ComposerDraft[K]) {
    onChangeDraft({ ...draft, [key]: value })
  }

  function handleSubmit() {
    if (draft.comment.trim().length === 0) return
    setSubmitting(true)
    onSubmit(draft, draft.includeScreenshot ? screenshot : null)
  }

  // The keydown handler runs as a stable listener bound once for the
  // composer's lifetime. To avoid a stale closure on `handleSubmit` (which
  // would drop a freshly-captured screenshot if the listener was registered
  // before the async capture resolved), we read through a ref that is kept
  // up-to-date in a passive effect after every render.
  const handleSubmitRef = useRef(handleSubmit)
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  })

  // Global keydown handler attached while the composer is mounted.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      // Ctrl+Enter or Cmd+Enter submits when a comment is present.
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        handleSubmitRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const canSubmit = draft.comment.trim().length > 0 && !submitting

  return (
    <section
      className={['qa-panel', isSheet ? 'qa-composer--sheet' : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-qa-overlay
      data-testid="qa-composer"
    >
      <header className="qa-panel__header">
        <span id={titleId} className="qa-panel__title">
          Feedback geben
        </span>
        <span id={descId} className="qa-panel__desc">
          Zu: {target.label || target.id}
        </span>
        <button type="button" className="qa-panel__close" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
      </header>
      <div className="qa-panel__body">
        <div className="qa-panel__field">
          <span>Art</span>
          <div
            className="qa-panel__chips"
            role="radiogroup"
            aria-label="Feedback-Art"
            ref={typeGroupRef}
          >
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={draft.type === opt.value}
                className={
                  draft.type === opt.value ? 'qa-panel__chip qa-panel__chip--active' : 'qa-panel__chip'
                }
                onClick={() => update('type', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="qa-panel__field">
          <span>Schweregrad</span>
          <select
            value={draft.severity}
            onChange={(event) => update('severity', event.target.value as Severity)}
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="qa-panel__field">
          <span>Kommentar</span>
          <textarea
            value={draft.comment}
            onChange={(event) => update('comment', event.target.value)}
            placeholder="Was ist falsch oder verwirrend?"
            required
          />
        </label>

        <label className="qa-panel__field">
          <span>Textvorschlag (optional)</span>
          <textarea
            value={draft.suggestedText}
            onChange={(event) => update('suggestedText', event.target.value)}
            placeholder="Bessere Formulierung, falls vorhanden."
          />
        </label>

        <label className="qa-panel__field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={draft.includeScreenshot}
            onChange={(event) => {
              const next = event.target.checked
              if (!next) setScreenshot(null)
              update('includeScreenshot', next)
            }}
          />
          <span style={{ fontWeight: 500 }}>Screenshot einbinden</span>
        </label>
      </div>
      <footer className="qa-panel__footer">
        <button type="button" className="qa-panel__btn" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          type="button"
          className="qa-panel__btn qa-panel__btn--primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          Vorschau
        </button>
      </footer>
    </section>
  )
}
