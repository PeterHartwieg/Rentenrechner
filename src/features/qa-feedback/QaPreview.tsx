import { useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultPrivacyFlags,
  type FeedbackReport,
  type PrivacyFlags,
  type ResolvedTarget,
  type WorkspaceContext,
} from './report'
import type { ComposerDraft } from './QaComposer'
import type { CapturedScreenshot } from './capture/screenshot'
import {
  submitToWorker,
  TURNSTILE_SITE_KEY,
  type WorkerSubmitOutcome,
} from './export/workerSubmit'

interface PreviewProps {
  target: ResolvedTarget
  draft: ComposerDraft
  screenshot: CapturedScreenshot | null
  onBack(): void
  onCancel(): void
  onSuccess(): void
  /**
   * Lane D: workspace context collector. Called at report-assembly time to
   * read the current mode/view/flow. Never called preemptively.
   */
  collectWorkspaceContext?: (pinnedElement?: Element | null) => WorkspaceContext
}

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
    },
  ): string
}

const TURNSTILE_SCRIPT_ID = 'qa-turnstile-script'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

/**
 * Confirmation screen before the QA-feedback ticket goes to GitHub.
 *
 * The single submission path is the qa-submit Cloudflare Worker
 * (sanctioned by ADR-0001). The Worker verifies a Turnstile token,
 * uploads the screenshot to a private R2 bucket when present, and creates
 * the GitHub issue with a `needs-triage` label.
 *
 * QA mode is itself opt-in via `?qa=1`, so the preview no longer asks for
 * a separate "publish to GitHub" consent — the wording near the Senden
 * button states what happens, and Turnstile renders as soon as the
 * preview opens.
 */
export function QaPreview({
  target,
  draft,
  screenshot,
  onBack,
  onCancel,
  onSuccess,
  collectWorkspaceContext,
}: PreviewProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [workerState, setWorkerState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle')
  const [workerResult, setWorkerResult] = useState<WorkerSubmitOutcome | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)

  const report = useMemo<FeedbackReport>(
    () => buildReport({ target, draft, screenshot, collectWorkspaceContext }),
    [target, draft, screenshot, collectWorkspaceContext],
  )

  useEffect(() => {
    const win = window as unknown as { turnstile?: TurnstileApi }

    function renderWidget() {
      const container = turnstileContainerRef.current
      const api = win.turnstile
      if (!container || !api) return
      if (container.dataset.qaTurnstileRendered === 'true') return
      container.dataset.qaTurnstileRendered = 'true'
      api.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(null),
        'expired-callback': () => setTurnstileToken(null),
      })
    }

    if (win.turnstile) {
      renderWidget()
      return
    }

    const existing = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', renderWidget, { once: true })
      return () => existing.removeEventListener('load', renderWidget)
    }

    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', renderWidget, { once: true })
    document.head.appendChild(script)
  }, [])

  async function handleSubmit() {
    if (!turnstileToken || workerState === 'submitting') return
    setWorkerState('submitting')
    const outcome = await submitToWorker(report, screenshot, turnstileToken)
    setWorkerResult(outcome)
    setWorkerState(outcome.ok ? 'success' : 'error')
  }

  // Exit QA mode as soon as the success state has rendered. Using a
  // 0ms setTimeout gives React one paint to commit the success styling
  // before the panel unmounts.
  useEffect(() => {
    if (workerState !== 'success') return
    const timer = window.setTimeout(() => onSuccess(), 0)
    return () => window.clearTimeout(timer)
  }, [workerState, onSuccess])

  const statusNode = renderStatus({ workerState, workerResult })

  return (
    <section
      className="qa-panel"
      role="dialog"
      aria-label="Feedback senden"
      data-qa-overlay
      data-testid="qa-preview"
    >
      <header className="qa-panel__header">
        <span className="qa-panel__title">Feedback senden</span>
        <button type="button" className="qa-panel__close" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
      </header>
      <div className="qa-panel__body">
        <p className="qa-preview__intro">
          Vielen Dank! Dein Feedback wird als öffentliches GitHub-Issue an die
          Entwickler gesendet. Ein GitHub-Konto brauchst du dafür nicht.
        </p>

        <div className="qa-preview__summary" data-testid="qa-preview-summary">
          <span className="qa-preview__summary-label">Dein Kommentar</span>
          <p className="qa-preview__summary-comment">{draft.comment}</p>
        </div>

        {report.screenshot && screenshot && (
          <div className="qa-preview__screenshot" data-testid="qa-preview-screenshot">
            <span className="qa-preview__summary-label">Screenshot</span>
            <img src={screenshot.dataUrl} alt="Screenshot der aktuellen Seite" />
          </div>
        )}

        <div className="qa-preview__turnstile-block">
          <span className="qa-preview__summary-label">Bitte bestätige kurz, dass du kein Roboter bist.</span>
          <div
            ref={turnstileContainerRef}
            data-testid="qa-preview-worker-turnstile"
            className="qa-preview__worker-turnstile"
          />
        </div>

        {statusNode && (
          <p
            className="qa-preview__copy-state"
            role={workerState === 'error' ? 'alert' : 'status'}
            data-testid="qa-preview-status"
          >
            {statusNode}
          </p>
        )}
      </div>
      <footer className="qa-panel__footer">
        <button type="button" className="qa-panel__btn" onClick={onBack}>
          Zurück
        </button>
        <button type="button" className="qa-panel__btn" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          type="button"
          className="qa-panel__btn qa-panel__btn--primary"
          onClick={handleSubmit}
          disabled={
            !turnstileToken ||
            workerState === 'submitting' ||
            workerState === 'success'
          }
          data-testid="qa-preview-worker-submit"
        >
          {workerState === 'submitting'
            ? 'Wird gesendet…'
            : workerState === 'success'
              ? 'Gesendet'
              : 'Senden'}
        </button>
      </footer>
    </section>
  )
}

interface BuildReportArgs {
  target: ResolvedTarget
  draft: ComposerDraft
  screenshot: CapturedScreenshot | null
  collectWorkspaceContext?: (pinnedElement?: Element | null) => WorkspaceContext
}

function buildReport({
  target,
  draft,
  screenshot,
  collectWorkspaceContext,
}: BuildReportArgs): FeedbackReport {
  const includeScreenshot = draft.includeScreenshot && screenshot !== null
  const filename = sanitizeFileName(target.id) + '.png'
  const flags: PrivacyFlags = defaultPrivacyFlags(includeScreenshot)
  const workspaceContext = collectWorkspaceContext?.()

  return {
    type: draft.type,
    severity: draft.severity,
    comment: draft.comment,
    target,
    environment: {
      route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
      timestamp: new Date().toISOString(),
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
      },
      userAgentFamily: detectUserAgentFamily(
        typeof navigator !== 'undefined' ? navigator.userAgent : '',
      ),
      appBuild: readAppBuild(),
    },
    privacyFlags: flags,
    screenshot: includeScreenshot && screenshot
      ? { fileName: filename, width: screenshot.width, height: screenshot.height }
      : undefined,
    workspaceContext,
  }
}

interface StatusArgs {
  workerState: 'idle' | 'submitting' | 'success' | 'error'
  workerResult: WorkerSubmitOutcome | null
}

function renderStatus({ workerState, workerResult }: StatusArgs): React.ReactNode {
  if (workerState === 'submitting') return 'Wird an GitHub gesendet…'
  if (workerState === 'success' && workerResult && workerResult.ok) {
    return (
      <>
        <span aria-hidden="true" style={{ marginRight: 6, color: '#16a34a' }}>
          ✓
        </span>
        <strong>Vielen Dank! Dein Feedback wurde gesendet.</strong>
      </>
    )
  }
  if (workerState === 'error' && workerResult && !workerResult.ok) {
    return (
      <span style={{ color: '#b91c1c' }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>
          ⚠
        </span>
        <strong>Senden fehlgeschlagen.</strong> {workerResult.message}
      </span>
    )
  }
  return null
}

function readAppBuild(): string {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env
    return env?.VITE_APP_BUILD || 'dev'
  } catch {
    return 'dev'
  }
}

function detectUserAgentFamily(ua: string): string {
  if (!ua) return 'unknown'
  const edge = /Edg\/(\d+)/.exec(ua)
  const firefox = /Firefox\/(\d+)/.exec(ua)
  const chrome = /Chrome\/(\d+)/.exec(ua)
  const safari = /Version\/(\d+).*Safari/.exec(ua)
  const browser = edge
    ? `Edge ${edge[1]}`
    : firefox
      ? `Firefox ${firefox[1]}`
      : chrome
        ? `Chrome ${chrome[1]}`
        : safari
          ? `Safari ${safari[1]}`
          : 'unknown'
  const os = /Mac OS X/.test(ua)
    ? 'macOS'
    : /Windows NT/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown'
  return `${browser} / ${os}`
}

function sanitizeFileName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'qa-feedback'
}
