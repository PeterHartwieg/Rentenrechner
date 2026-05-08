import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './qa-feedback.css'
import {
  QaFeedbackContext,
  type QaFeedbackContextValue,
  type QaInterceptState,
  type QaPinState,
} from './QaFeedbackContext'
import type { ResolvedTarget } from './report'
import { QaOverlay } from './QaOverlay'
import { QaComposer } from './QaComposer'
import { QaIntercept } from './QaIntercept'
import { QaPreview } from './QaPreview'
import type { ComposerDraft } from './QaComposer'
import type { CapturedScreenshot } from './capture/screenshot'
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
type Phase = 'idle' | 'composer' | 'preview' | 'intercept'

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

  // Intercept-dialog state — tracks the last pinned target id and which ids
  // have already shown the dialog in this QA session (suppression set).
  const [interceptState, setInterceptState] = useState<QaInterceptState | null>(null)
  const lastPinnedTargetIdRef = useRef<string | null>(null)
  const shownDialogIdsRef = useRef<Set<string>>(new Set())

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
    setInterceptState(null)
    lastPinnedTargetIdRef.current = null
    shownDialogIdsRef.current = new Set()
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
          setInterceptState(null)
          lastPinnedTargetIdRef.current = null
          shownDialogIdsRef.current = new Set()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])

  const openComposerForTarget = useCallback((target: ResolvedTarget, rect: DOMRect) => {
    setPinned({ target, rect: serializeRect(rect) })
    setDraft({
      type: 'other',
      severity: 'minor',
      comment: '',
      suggestedText: '',
      includeScreenshot: true,
    })
    setInterceptState(null)
    setPhase('composer')
  }, [])

  const onPickTarget = useCallback(
    (target: ResolvedTarget, rect: DOMRect, element: HTMLElement) => {
      const targetId = target.id

      // Intercept filter: only interactive elements trigger the dialog.
      const isInteractive =
        element instanceof HTMLAnchorElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element.getAttribute('role') === 'button'

      if (
        isInteractive &&
        lastPinnedTargetIdRef.current === targetId &&
        !shownDialogIdsRef.current.has(targetId)
      ) {
        // Second consecutive pin on the same interactive element — show dialog.
        shownDialogIdsRef.current.add(targetId)
        setInterceptState({ target, element })
        setPhase('intercept')
        return
      }

      // Normal path: open composer and record the last pinned id.
      lastPinnedTargetIdRef.current = targetId
      openComposerForTarget(target, rect)
    },
    [openComposerForTarget],
  )

  const cancelDraft = useCallback(() => {
    setPinned(null)
    setDraft(null)
    setScreenshot(null)
    setPhase('idle')
    setInterceptState(null)
  }, [])

  const submitDraft = useCallback(
    (next: ComposerDraft, capturedScreenshot: CapturedScreenshot | null) => {
      setDraft(next)
      setScreenshot(capturedScreenshot)
      setPhase('preview')
      // Composer submit = clean slate for the intercept flow (both refs).
      lastPinnedTargetIdRef.current = null
      shownDialogIdsRef.current = new Set()
    },
    [],
  )

  /** Dismiss intercept dialog — no state changes, same element clicked again re-opens it. */
  const dismissIntercept = useCallback(() => {
    // Remove from shownDialogIds so the same-id suppression doesn't apply,
    // but also reset lastPinnedTargetId so the NEXT click on a different element
    // doesn't falsely trigger the dialog. The dialog itself stays unmounted.
    // Per spec: "×/Esc closes the dialog without state changes" — we only
    // unmount the dialog UI here; lastPinnedTargetId stays as the same id
    // so a third click re-opens the dialog again (until suppression kicks in).
    // The shownDialogIds.add() already happened in onPickTarget, so subsequent
    // clicks on the same id will use the normal composer path (suppression active).
    setInterceptState(null)
    setPhase('idle')
  }, [])

  /** Open the composer for the intercepted target (secondary button). */
  const proceedWithComposer = useCallback(() => {
    if (!interceptState) return
    // We need the original rect — re-query it from the live element.
    const rect = interceptState.element.getBoundingClientRect()
    openComposerForTarget(interceptState.target, rect)
    // interceptState cleared inside openComposerForTarget.
  }, [interceptState, openComposerForTarget])

  /** Deactivate QA mode and re-fire the stored element click (primary button). */
  const exitAndNavigate = useCallback(() => {
    const el = interceptState?.element ?? null
    // Deactivate first — this removes the capture-phase click listener.
    deactivate()
    if (el && document.contains(el)) {
      // Schedule re-fire after the overlay's capture listener has unregistered.
      requestAnimationFrame(() => {
        el.click()
      })
    }
    // If element no longer in DOM: graceful degradation — deactivate only.
  }, [interceptState, deactivate])

  const ctx = useMemo<QaFeedbackContextValue>(
    () => ({
      enabled,
      pinned,
      intercept: interceptState,
      activate,
      deactivate,
      pickTarget: onPickTarget,
      dismissIntercept,
      proceedWithComposer,
      exitAndNavigate,
    }),
    [
      enabled,
      pinned,
      interceptState,
      activate,
      deactivate,
      onPickTarget,
      dismissIntercept,
      proceedWithComposer,
      exitAndNavigate,
    ],
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
          {phase === 'intercept' && interceptState && (
            <QaIntercept
              target={interceptState.target}
              onDismiss={dismissIntercept}
              onProceed={proceedWithComposer}
              onExitAndNavigate={exitAndNavigate}
            />
          )}
          {phase === 'preview' && pinned && draft && (
            <QaPreview
              target={pinned.target}
              draft={draft}
              screenshot={screenshot}
              onBack={() => setPhase('composer')}
              onCancel={cancelDraft}
              onSuccess={deactivate}
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
