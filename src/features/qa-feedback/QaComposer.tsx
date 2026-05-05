import { useEffect, useState } from 'react'
import type { FeedbackType, ResolvedTarget, Severity } from './report'
import { captureViewportScreenshot, type CapturedScreenshot } from './capture/screenshot'

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
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'nit', label: 'Nit' },
]

/**
 * Compact composer panel. Renders directly to the right corner of the
 * viewport while QA mode is active and a target is pinned.
 *
 * Lane C (a11y / mobile) will harden focus management, mobile-friendly
 * layout, and screen-reader announcements. The structure is intentionally
 * baseline — semantic form controls with labels, no exotic widgets — so
 * Lane C can layer on without rewriting.
 */
export function QaComposer({ target, draft, onChangeDraft, onCancel, onSubmit }: ComposerProps) {
  const [submitting, setSubmitting] = useState(false)

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

  const canSubmit = draft.comment.trim().length > 0 && !submitting

  return (
    <section
      className="qa-panel"
      role="dialog"
      aria-label="QA-Feedback verfassen"
      data-qa-overlay
      data-testid="qa-composer"
    >
      <header className="qa-panel__header">
        <span className="qa-panel__title">Feedback zu {target.label || target.id}</span>
        <button type="button" className="qa-panel__close" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
      </header>
      <div className="qa-panel__body">
        <div className="qa-panel__field">
          <span>Art</span>
          <div className="qa-panel__chips" role="radiogroup" aria-label="Feedback-Art">
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
