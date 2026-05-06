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
import { STORAGE_KEY_V2 } from '../../storage'
import { collectWorkspaceContext } from './context/collectWorkspaceContext'
import { getQaWorkspaceContext } from './context/workspaceContextRef'

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

/**
 * Read the current workspace JSON from localStorage when the tester opts in.
 * Only called when the scenario opt-in checkbox is checked (never preemptively).
 * Reads STORAGE_KEY_V2 (the authoritative write key). Returns undefined when
 * no state is found. Does NOT mutate localStorage.
 */
function collectScenarioJson(): string | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_V2) : null
    return raw ?? undefined
  } catch {
    return undefined
  }
}

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

  // Ctrl+Shift+. (or Cmd+Shift+. on macOS) toggles QA mode from any state.
  // Attached unconditionally so the shortcut can also *activate* QA mode.
  // Ctrl+Shift+. has very low conflict risk on all major platforms/browsers.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey && (e.key === '.' || e.key === '>' || e.code === 'Period')) {
        e.preventDefault()
        setEnabled((prev) => {
          const next = !prev
          // Sync sessionStorage in the same microtask so callers reading it
          // immediately after the event see the up-to-date value.
          try {
            if (next) {
              sessionStorage.setItem(QA_SESSION_KEY, ACTIVATE_VALUE)
            } else {
              sessionStorage.removeItem(QA_SESSION_KEY)
            }
          } catch {
            /* ignore */
          }
          return next
        })
        // When toggling off, close the composer cleanly regardless of phase.
        if (enabled) {
          setPinned(null)
          setDraft(null)
          setScreenshot(null)
          setPhase('idle')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])

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
              collectScenarioJson={collectScenarioJson}
              collectWorkspaceContext={collectWorkspaceContextForReport}
            />
          )}
        </>
      ) : null}
    </QaFeedbackContext.Provider>
  )
}

/**
 * Collect the workspace context snapshot at report-assembly time.
 * Reads from the global ref set by the app shell and combines it with
 * DOM-detected flow context (open dialogs / disclosures).
 * Does NOT call any simulation or engine code.
 */
function collectWorkspaceContextForReport(pinnedElement?: Element | null) {
  const stored = getQaWorkspaceContext()
  return collectWorkspaceContext({ ...stored, pinnedElement })
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
