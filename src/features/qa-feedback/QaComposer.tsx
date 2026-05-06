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

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string }> = [
  { value: 'blocker', label: 'Funktioniert gar nicht' },
  { value: 'major', label: 'Großes Problem' },
  { value: 'minor', label: 'Kleines Problem' },
  { value: 'nit', label: 'Nur eine Kleinigkeit' },
]

/** Fallback selector: the QA indicator chip. */
const INDICATOR_SELECTOR = '.qa-indicator'

/**
 * Compact composer panel. Renders directly to the right corner of the
 * viewport while QA mode is active and a target is pinned.
 *
 * The form is intentionally short for non-technical testers: severity,
 * comment, screenshot toggle. The report `type` is fixed to `'other'`
 * because asking testers to classify their feedback (copy / layout /
 * a11y / …) added friction without improving triage.
 */
export function QaComposer({ target, draft, onChangeDraft, onCancel, onSubmit }: ComposerProps) {
  const [submitting, setSubmitting] = useState(false)
  const titleId = useId()
  const descId = useId()

  // Restore focus on unmount (cancel or forward to preview).
  useFocusReturn(INDICATOR_SELECTOR)

  // Move focus into the comment textarea on mount so testers can type immediately.
  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      commentRef.current?.focus()
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
  // includes the pinned target. The async resolver writes to state; the
  // synchronous "off" branch is handled inline in the toggle handler.
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
          Hilf uns, RentenWiki zu verbessern
        </span>
        <span id={descId} className="qa-panel__desc">
          Zu: {target.label || target.id}
        </span>
        <button type="button" className="qa-panel__close" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
      </header>
      <div className="qa-panel__body">
        <label className="qa-panel__field">
          <span>Was möchtest du uns mitteilen?</span>
          <textarea
            ref={commentRef}
            value={draft.comment}
            onChange={(event) => update('comment', event.target.value)}
            placeholder="Beschreibe in deinen eigenen Worten, was nicht stimmt oder verwirrend ist."
            rows={5}
            required
          />
        </label>

        <label className="qa-panel__field">
          <span>Wie schlimm ist es?</span>
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

        <label className="qa-panel__field qa-panel__field--checkbox">
          <input
            type="checkbox"
            checked={draft.includeScreenshot}
            onChange={(event) => {
              const next = event.target.checked
              if (!next) setScreenshot(null)
              update('includeScreenshot', next)
            }}
          />
          <span>Screenshot der aktuellen Seite mitschicken</span>
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
          Weiter
        </button>
      </footer>
    </section>
  )
}
