import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import './qa-feedback.css'
import { QaFeedbackContext, type QaFeedbackContextValue, type QaPinState } from './QaFeedbackContext'
import type { ResolvedTarget } from './report'
import { QaOverlay } from './QaOverlay'
import { QaComposer } from './QaComposer'
import { QaPreview } from './QaPreview'
import type { ComposerDraft } from './QaComposer'
import type { CapturedScreenshot } from './capture/screenshot'

/**
 * Session-storage key that mirrors the `?qa=1` URL flag (DECISIONS §2).
 * Mirrors `DisclaimerBanner.DISMISS_KEY` — both use sessionStorage so QA mode
 * never becomes a permanent property of the browser.
 */
export const QA_SESSION_KEY = 'qa-feedback-mode'

const ACTIVATE_VALUE = '1'
const DEACTIVATE_VALUE = '0'

/** Phase of the feedback flow currently visible to the tester. */
type Phase = 'idle' | 'composer' | 'preview'

interface ProviderProps {
  children: ReactNode
}

/**
 * Top-level QA feedback provider.
 *
 * - Reads `?qa=1` / `?qa=0` from `window.location.search` on mount and writes
 *   the resolved value into `sessionStorage` (DECISIONS §2). The flag survives
 *   in-session navigation but never persists across browser sessions.
 * - When disabled, the provider renders only `children` — **no** event
 *   listeners, **no** overlay, **no** indicator chip. (PRD US-33 / "inert
 *   when disabled".)
 * - When enabled, mounts the overlay (hover outline + click-to-pin),
 *   composer, and preview. Drafts live in memory only — a page reload
 *   discards them (DECISIONS §7).
 */
export function QaFeedbackProvider({ children }: ProviderProps) {
  const [enabled, setEnabled] = useState<boolean>(() => readInitialFlag())
  const [pinned, setPinned] = useState<QaPinState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const [screenshot, setScreenshot] = useState<CapturedScreenshot | null>(null)

  // Persist enable/disable transitions back to sessionStorage so a fresh tab
  // (same session) honours the active state.
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return
    try {
      if (enabled) {
        sessionStorage.setItem(QA_SESSION_KEY, ACTIVATE_VALUE)
      } else {
        sessionStorage.removeItem(QA_SESSION_KEY)
      }
    } catch {
      /* ignore — provider stays consistent for the page lifecycle */
    }
  }, [enabled])

  // Tag the document root so CSS rules can scope themselves under
  // `[data-qa-mode="true"]`. Only attached when QA mode is active so the
  // attribute disappears entirely once the tester deactivates.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (enabled) {
      document.documentElement.setAttribute('data-qa-mode', 'true')
      return () => document.documentElement.removeAttribute('data-qa-mode')
    }
    return undefined
  }, [enabled])

  const activate = useCallback(() => setEnabled(true), [])
  const deactivate = useCallback(() => {
    setEnabled(false)
    setPinned(null)
    setDraft(null)
    setScreenshot(null)
    setPhase('idle')
  }, [])

  const onPickTarget = useCallback((target: ResolvedTarget, rect: DOMRect) => {
    setPinned({ target, rect: serializeRect(rect) })
    setDraft({
      type: 'copy',
      severity: 'minor',
      comment: '',
      suggestedText: '',
      includeScreenshot: true,
    })
    setPhase('composer')
  }, [])

  const cancelDraft = useCallback(() => {
    setPinned(null)
    setDraft(null)
    setScreenshot(null)
    setPhase('idle')
  }, [])

  const submitDraft = useCallback(
    (next: ComposerDraft, capturedScreenshot: CapturedScreenshot | null) => {
      setDraft(next)
      setScreenshot(capturedScreenshot)
      setPhase('preview')
    },
    [],
  )

  const ctx = useMemo<QaFeedbackContextValue>(
    () => ({
      enabled,
      pinned,
      activate,
      deactivate,
      pickTarget: onPickTarget,
    }),
    [enabled, pinned, activate, deactivate, onPickTarget],
  )

  // The provider value is always available; consumers (NumberField via
  // useFeedbackTarget) check `enabled` to decide whether to wire DOM hooks.
  return (
    <QaFeedbackContext.Provider value={ctx}>
      {children}
      {enabled ? (
        <>
          <QaOverlay />
          {phase === 'composer' && pinned && draft && (
            <QaComposer
              target={pinned.target}
              draft={draft}
              onChangeDraft={setDraft}
              onCancel={cancelDraft}
              onSubmit={submitDraft}
            />
          )}
          {phase === 'preview' && pinned && draft && (
            <QaPreview
              target={pinned.target}
              draft={draft}
              screenshot={screenshot}
              onBack={() => setPhase('composer')}
              onCancel={cancelDraft}
            />
          )}
        </>
      ) : null}
    </QaFeedbackContext.Provider>
  )
}

function readInitialFlag(): boolean {
  if (typeof window === 'undefined') return false
  // 1) URL parameter takes precedence (DECISIONS §2).
  try {
    const params = new URLSearchParams(window.location.search || '')
    const qa = params.get('qa')
    if (qa === ACTIVATE_VALUE) {
      try {
        sessionStorage.setItem(QA_SESSION_KEY, ACTIVATE_VALUE)
      } catch {
        /* ignore */
      }
      return true
    }
    if (qa === DEACTIVATE_VALUE) {
      try {
        sessionStorage.removeItem(QA_SESSION_KEY)
      } catch {
        /* ignore */
      }
      return false
    }
  } catch {
    /* fall through to sessionStorage check */
  }
  // 2) Existing session flag.
  try {
    return sessionStorage.getItem(QA_SESSION_KEY) === ACTIVATE_VALUE
  } catch {
    return false
  }
}

function serializeRect(rect: DOMRect): QaPinState['rect'] {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}
