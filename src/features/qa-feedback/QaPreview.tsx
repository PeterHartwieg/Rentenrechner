import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildMarkdownTicket,
  defaultPrivacyFlags,
  type FeedbackReport,
  type PrivacyFlags,
  type ResolvedTarget,
  type ScenarioContextSnapshot,
  type WorkspaceContext,
} from './report'
import type { ComposerDraft } from './QaComposer'
import type { CapturedScreenshot } from './capture/screenshot'
import { buildFeedbackBundle } from './export/bundleExport'
import { buildMailtoUrl, buildGithubIssueUrl } from './export/outboundDestinations'
import { saveReportLocally } from './export/localSave'
import { isLocalSaveSupported } from './export/localDirectoryHandle'
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
  /**
   * Optional scenario-state collector wired by the provider. Returns the
   * current scenario JSON when the tester has opted in, or `undefined` when
   * unavailable. Phase 1 wires `() => undefined` (TODO: issue 05 / Lane D).
   * The preview never calls this collector unless the tester ticks the
   * "Aktuelles Szenario in den Bericht einschließen" checkbox.
   */
  collectScenarioJson?: () => string | undefined
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
 * Final review screen for the QA-feedback ticket (PRD US-20).
 *
 * Composes the full `FeedbackReport` from draft + environment + screenshot,
 * renders the metadata + privacy flags inline, and exposes three export
 * lanes:
 *
 *   1. **Lokal exportieren** — Markdown clipboard, single-file bundle
 *      download (issue 07 / Lane E), and File System Access API local save
 *      (issue 14). All synchronous DOM operations, zero network.
 *   2. **Externes Ziel öffnen** — `mailto:` and GitHub-prefilled-URL
 *      builders (issue 08). Pure URL strings handed to `window.open`, zero
 *      network from this app.
 *   3. **Direkt an GitHub einreichen** — POSTs to the qa-submit Cloudflare
 *      Worker at qa.rentenwiki.de (sanctioned by ADR-0001). The Worker
 *      verifies a Turnstile token, optionally uploads the screenshot to a
 *      private R2 bucket, and creates the GitHub issue with a
 *      `needs-triage` label. Gated behind an explicit consent checkbox so
 *      the no-network default for lanes 1 + 2 still holds for any tester
 *      who doesn't opt in.
 *
 * The "no network" guarantee for lanes 1 + 2 is pinned by
 * `__tests__/no-network-e2e.test.tsx`, which exercises every export
 * EXCEPT the lane-3 button — that path has its own targeted test in
 * `__tests__/QaPreview.workerSubmit.test.tsx`.
 */
export function QaPreview({
  target,
  draft,
  screenshot,
  onBack,
  onCancel,
  collectScenarioJson,
  collectWorkspaceContext,
}: PreviewProps) {
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [externalOpened, setExternalOpened] = useState<'mailto' | 'github' | null>(null)
  const [localSaveState, setLocalSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  /**
   * Scenario-state opt-in (DECISIONS / issue 03). Default OFF — the share URL
   * and scenario JSON are only attached after the tester ticks this box. We
   * never read `window.location.href` preemptively.
   */
  const [includeScenario, setIncludeScenario] = useState(false)

  // Lane 3 (ADR-0001) — Worker submission state. All defaults preserve
  // the no-network posture: nothing leaves the page until `workerConsent`
  // flips true AND the user clicks the submit button.
  const [workerConsent, setWorkerConsent] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [workerState, setWorkerState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle')
  const [workerResult, setWorkerResult] = useState<WorkerSubmitOutcome | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)

  const report = useMemo<FeedbackReport>(
    () => buildReport({ target, draft, screenshot, includeScenario, collectScenarioJson, collectWorkspaceContext }),
    [target, draft, screenshot, includeScenario, collectScenarioJson, collectWorkspaceContext],
  )

  const markdown = useMemo(() => buildMarkdownTicket(report), [report])

  // Lazy-load the Turnstile widget script and render the widget into our
  // container — but only AFTER the tester ticks the consent box. Until then
  // no network request originates from this component.
  useEffect(() => {
    if (!workerConsent) return
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
  }, [workerConsent])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setDownloaded(false)
      setExternalOpened(null)
    } catch {
      // Clipboard API may be unavailable (insecure context, denied permission).
      // Fallback: prompt the user to use the download button.
      setCopied(false)
    }
  }

  async function handleDownload() {
    // Issue 07 (Lane E): single-file JSON envelope bundle replacing the
    // previous two-file dance (markdown + png). The bundle includes the
    // Markdown ticket, the full FeedbackReport as JSON, and the screenshot
    // blob (base64-encoded) when the tester opted to include it.
    const { blob, filename } = await buildFeedbackBundle({ report, screenshot })
    triggerBlobDownload(blob, filename)
    setDownloaded(true)
    setCopied(false)
    setExternalOpened(null)
  }

  function handleMailto() {
    const url = buildMailtoUrl(report)
    window.open(url, '_blank', 'noopener,noreferrer')
    setExternalOpened('mailto')
    setCopied(false)
    setDownloaded(false)
  }

  function handleGithubIssue() {
    const url = buildGithubIssueUrl(report, { labels: ['qa-feedback'] })
    window.open(url, '_blank', 'noopener,noreferrer')
    setExternalOpened('github')
    setCopied(false)
    setDownloaded(false)
  }

  async function handleLocalSave() {
    setLocalSaveState('idle')
    setLocalSaveError(null)
    try {
      await saveReportLocally({ report, screenshot })
      setLocalSaveState('saved')
      setCopied(false)
      setDownloaded(false)
      setExternalOpened(null)
    } catch (err) {
      // AbortError means the tester cancelled the picker — not a real error.
      if (err instanceof Error && err.name === 'AbortError') {
        setLocalSaveState('idle')
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setLocalSaveState('error')
      setLocalSaveError(message)
    }
  }

  async function handleWorkerSubmit() {
    if (!turnstileToken || workerState === 'submitting') return
    setWorkerState('submitting')
    const outcome = await submitToWorker(report, screenshot, turnstileToken)
    setWorkerResult(outcome)
    setWorkerState(outcome.ok ? 'success' : 'error')
    if (outcome.ok) {
      // Clear other status messages so the success notice is unambiguous.
      setCopied(false)
      setDownloaded(false)
      setExternalOpened(null)
      setLocalSaveState('idle')
    }
  }

  // Close the panel as soon as the success state has rendered. Using a
  // 0ms setTimeout (rather than calling onCancel synchronously inside
  // handleWorkerSubmit) gives React one paint to commit the success
  // styling before the panel unmounts — user gets a single-frame
  // confirmation flash, no lingering "what happened" delay.
  useEffect(() => {
    if (workerState !== 'success') return
    const timer = window.setTimeout(() => onCancel(), 0)
    return () => window.clearTimeout(timer)
  }, [workerState, onCancel])

  const statusNode = renderStatus({
    copied,
    downloaded,
    externalOpened,
    localSaveState,
    localSaveError,
    workerState,
    workerResult,
  })

  return (
    <section
      className="qa-panel"
      role="dialog"
      aria-label="QA-Feedback Vorschau"
      data-qa-overlay
      data-testid="qa-preview"
    >
      <header className="qa-panel__header">
        <span className="qa-panel__title">Vorschau und Export</span>
        <button type="button" className="qa-panel__close" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
      </header>
      <div className="qa-panel__body">
        <dl className="qa-preview__meta">
          <dt>Target</dt>
          <dd>
            <code>{report.target.id}</code>
          </dd>
          {report.target.label && (
            <>
              <dt>Label</dt>
              <dd>{report.target.label}</dd>
            </>
          )}
          {report.target.visibleText && (
            <>
              <dt>Text</dt>
              <dd>{report.target.visibleText}</dd>
            </>
          )}
          <dt>Route</dt>
          <dd>{report.environment.route}</dd>
          <dt>Viewport</dt>
          <dd>
            {report.environment.viewport.width}×{report.environment.viewport.height}
          </dd>
          <dt>Browser</dt>
          <dd>{report.environment.userAgentFamily}</dd>
          <dt>Build</dt>
          <dd>{report.environment.appBuild}</dd>
          <dt>Zeit</dt>
          <dd>{report.environment.timestamp}</dd>
          <dt>Präzision</dt>
          <dd>{report.target.precision}</dd>
          <dt>Modus</dt>
          <dd>{report.workspaceContext?.mode ?? '—'}</dd>
          <dt>Aktive Ansicht</dt>
          <dd>{report.workspaceContext?.activeView ?? '—'}</dd>
          <dt>Produkt</dt>
          <dd>{report.workspaceContext?.activeProductId ?? '—'}</dd>
          <dt>Flow</dt>
          <dd>{report.workspaceContext?.flow ?? '—'}</dd>
        </dl>

        <div className="qa-panel__field" data-testid="qa-preview-privacy">
          <span>Datenschutz</span>
          <ul
            className="qa-preview__privacy-list"
            style={{ margin: '4px 0 0', paddingLeft: 18, listStyle: 'none' }}
          >
            <PrivacyRow
              label="Sensible Felder maskiert"
              flag={report.privacyFlags.sensitiveFieldsRedacted}
            />
            <PrivacyRow
              label="Eingaben aus dem Bericht ausgeschlossen"
              flag={report.privacyFlags.userInputsRedacted}
            />
            <PrivacyRow
              label="Szenario-Daten enthalten"
              flag={report.privacyFlags.scenarioStateIncluded}
            />
            <PrivacyRow
              label="Screenshot enthalten"
              flag={report.privacyFlags.screenshotIncluded}
            />
            <PrivacyRow
              label="localStorage enthalten"
              flag={report.privacyFlags.localStorageIncluded}
            />
          </ul>
        </div>

        <div className="qa-panel__field">
          <label className="qa-preview__opt-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={includeScenario}
              onChange={(event) => setIncludeScenario(event.target.checked)}
              data-testid="qa-preview-include-scenario"
            />
            <span>
              <strong>Aktuelles Szenario in den Bericht einschließen</strong>{' '}
              <span style={{ opacity: 0.7 }}>(Standard: aus)</span>
              <br />
              <span style={{ fontSize: 11.5, opacity: 0.85 }}>
                Eingeschlossen werden die aktuelle Share-URL und – sofern verfügbar – das
                Szenario als JSON. Beides verlässt den Browser nur, wenn du die Markdown-
                bzw. Bundle-Ausgabe selbst weitergibst.
              </span>
            </span>
          </label>
          {includeScenario && !report.scenarioContext?.scenarioJson && (
            <p
              data-testid="qa-preview-scenario-excluded"
              style={{ margin: '4px 0 0 26px', fontSize: 11.5, opacity: 0.85 }}
            >
              (scenario excluded — kein Szenario-JSON verfügbar)
            </p>
          )}
        </div>

        {report.screenshot && screenshot && (
          <div className="qa-preview__screenshot" data-testid="qa-preview-screenshot">
            <img src={screenshot.dataUrl} alt="QA-Screenshot der aktuellen Ansicht" />
          </div>
        )}

        <details>
          <summary>Markdown anzeigen</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, marginTop: 8 }}>{markdown}</pre>
        </details>

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
        <div className="qa-preview__footer-nav">
          <button type="button" className="qa-panel__btn" onClick={onBack}>
            Zurück
          </button>
          <button type="button" className="qa-panel__btn" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
        <div className="qa-preview__export-groups">
          <div className="qa-preview__export-group">
            <span className="qa-preview__export-group-label">Lokal exportieren</span>
            <div className="qa-preview__export-group-btns">
              <button
                type="button"
                className="qa-panel__btn"
                onClick={handleDownload}
                data-testid="qa-preview-download"
              >
                Bundle herunterladen
              </button>
              <button
                type="button"
                className="qa-panel__btn qa-panel__btn--primary"
                onClick={handleCopy}
                data-testid="qa-preview-copy"
              >
                Markdown kopieren
              </button>
              {isLocalSaveSupported() && (
                <button
                  type="button"
                  className="qa-panel__btn"
                  onClick={handleLocalSave}
                  data-testid="qa-preview-local-save"
                >
                  Lokal speichern
                </button>
              )}
            </div>
          </div>
          <div className="qa-preview__export-group">
            <span className="qa-preview__export-group-label">Externes Ziel öffnen</span>
            <div className="qa-preview__export-group-btns">
              <button
                type="button"
                className="qa-panel__btn"
                onClick={handleMailto}
                data-testid="qa-preview-mailto"
              >
                Per E-Mail senden
              </button>
              <button
                type="button"
                className="qa-panel__btn"
                onClick={handleGithubIssue}
                data-testid="qa-preview-github"
              >
                GitHub-Issue öffnen
              </button>
            </div>
          </div>
          <div className="qa-preview__export-group">
            <span className="qa-preview__export-group-label">Direkt an GitHub einreichen</span>
            <div
              className="qa-preview__worker-consent"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <label
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5 }}
              >
                <input
                  type="checkbox"
                  checked={workerConsent}
                  onChange={(event) => setWorkerConsent(event.target.checked)}
                  data-testid="qa-preview-worker-consent"
                />
                <span>
                  Mit dem Absenden werden dein Feedback und – falls beigefügt – der
                  Screenshot über <code>qa.rentenwiki.de</code> als öffentliches
                  GitHub-Issue veröffentlicht. Du brauchst kein GitHub-Konto. Spam-Schutz
                  via Cloudflare Turnstile.
                </span>
              </label>
              {workerConsent && (
                <div
                  ref={turnstileContainerRef}
                  data-testid="qa-preview-worker-turnstile"
                  className="qa-preview__worker-turnstile"
                  style={{ minHeight: 65 }}
                />
              )}
              <div className="qa-preview__export-group-btns">
                <button
                  type="button"
                  className="qa-panel__btn qa-panel__btn--primary"
                  onClick={handleWorkerSubmit}
                  disabled={
                    !workerConsent ||
                    !turnstileToken ||
                    workerState === 'submitting' ||
                    workerState === 'success'
                  }
                  data-testid="qa-preview-worker-submit"
                >
                  {workerState === 'submitting'
                    ? 'Wird gesendet…'
                    : workerState === 'success'
                      ? 'Eingereicht'
                      : 'An GitHub senden'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </section>
  )
}

interface BuildReportArgs {
  target: ResolvedTarget
  draft: ComposerDraft
  screenshot: CapturedScreenshot | null
  /**
   * Tester opted into attaching scenario/share-link state. When false (the
   * default), `scenarioContext` stays undefined and we never touch
   * `window.location.href`.
   */
  includeScenario: boolean
  /** See `PreviewProps.collectScenarioJson` — only invoked on opt-in. */
  collectScenarioJson?: () => string | undefined
  /** Lane D: workspace context collector. */
  collectWorkspaceContext?: (pinnedElement?: Element | null) => WorkspaceContext
}

/**
 * Compose the full `FeedbackReport` from the composer draft, the pinned
 * target, and (optionally) the captured screenshot.
 *
 * Phase 1 Lane B wires the scenario-state opt-in here. When the tester
 * ticks the preview checkbox we read `window.location.href` and call the
 * (Lane D-supplied) scenario-JSON collector; otherwise both stay omitted
 * and the privacy flags reflect that.
 */
function buildReport({
  target,
  draft,
  screenshot,
  includeScenario,
  collectScenarioJson,
  collectWorkspaceContext,
}: BuildReportArgs): FeedbackReport {
  const includeScreenshot = draft.includeScreenshot && screenshot !== null
  const filename = sanitizeFileName(target.id) + '.png'
  const flags: PrivacyFlags = defaultPrivacyFlags(includeScreenshot)
  let scenarioContext: ScenarioContextSnapshot | undefined
  if (includeScenario) {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : undefined
    const scenarioJson = collectScenarioJson?.()
    // Only flip the flag and attach the snapshot when we actually have something
    // to surface — an empty opt-in shouldn't lie about including data.
    if (shareUrl || (scenarioJson && scenarioJson.length > 0)) {
      scenarioContext = {
        ...(shareUrl ? { shareUrl } : {}),
        ...(scenarioJson ? { scenarioJson } : {}),
      }
      flags.scenarioStateIncluded = true
      // The scenario JSON comes from STORAGE_KEY_V2 and contains user-entered
      // profile and assumption inputs. The privacy summary must reflect that:
      // localStorage was read and user inputs are no longer redacted in the
      // exported report. Without this, the preview would tell the tester
      // "userInputsRedacted: true" while the bundle ships their salary.
      if (scenarioJson && scenarioJson.length > 0) {
        flags.localStorageIncluded = true
        flags.userInputsRedacted = false
      }
    }
  }
  // Workspace context: collected synchronously at report-assembly time.
  // The collector is optional; when absent (e.g. tests that don't wire it)
  // workspaceContext stays undefined and the markdown section is omitted.
  const workspaceContext = collectWorkspaceContext?.()

  return {
    type: draft.type,
    severity: draft.severity,
    comment: draft.comment,
    suggestedText: draft.suggestedText.trim() || undefined,
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
    scenarioContext,
    workspaceContext,
  }
}

interface StatusArgs {
  copied: boolean
  downloaded: boolean
  externalOpened: 'mailto' | 'github' | null
  localSaveState: 'idle' | 'saved' | 'error'
  localSaveError: string | null
  workerState: 'idle' | 'submitting' | 'success' | 'error'
  workerResult: WorkerSubmitOutcome | null
}

/**
 * Centralised status-line renderer. Returns a React node (string or JSX
 * fragment with a link for the worker-submit success case) or null when no
 * status should display. Keeps the JSX in `QaPreview` flat.
 */
function renderStatus(args: StatusArgs): React.ReactNode {
  const {
    copied,
    downloaded,
    externalOpened,
    localSaveState,
    localSaveError,
    workerState,
    workerResult,
  } = args
  if (copied) return 'Markdown in Zwischenablage kopiert.'
  if (downloaded) return 'Bundle heruntergeladen.'
  if (externalOpened === 'mailto') return 'E-Mail-Entwurf geöffnet.'
  if (externalOpened === 'github') return 'GitHub-Issue-Formular geöffnet.'
  if (localSaveState === 'saved') return 'Issue-Datei lokal gespeichert.'
  if (localSaveState === 'error') {
    return `Fehler beim Speichern: ${localSaveError ?? 'Unbekannter Fehler'}`
  }
  if (workerState === 'submitting') return 'Wird an GitHub gesendet…'
  if (workerState === 'success' && workerResult && workerResult.ok) {
    return (
      <>
        <span aria-hidden="true" style={{ marginRight: 6, color: '#16a34a' }}>
          ✓
        </span>
        <strong>Erfolgreich eingereicht.</strong>
      </>
    )
  }
  if (workerState === 'error' && workerResult && !workerResult.ok) {
    return (
      <span style={{ color: '#b91c1c' }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>
          ⚠
        </span>
        <strong>Einreichen fehlgeschlagen.</strong> {workerResult.message}
      </span>
    )
  }
  return null
}

/**
 * Single-row privacy display: bold label + status icon. Defined here (not as
 * a separate file) because it is exclusively a `QaPreview` rendering helper.
 */
function PrivacyRow({ label, flag }: { label: string; flag: boolean }) {
  return (
    <li className="qa-preview__privacy-row" style={{ marginBottom: 2 }}>
      <span aria-hidden="true" style={{ marginRight: 6 }}>
        {flag ? '✓' : '✗'}
      </span>
      <strong>{label}:</strong> {flag ? 'ja' : 'nein'}
    </li>
  )
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

function triggerBlobDownload(blob: Blob, fileName: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  // Mark the synthetic anchor as overlay infrastructure so QaOverlay's
  // capture-phase click handler does NOT intercept the download click.
  // Without this, the catch-all interactive selector (`a[href]`) would match
  // the anchor and call preventDefault, blocking the download.
  anchor.setAttribute('data-qa-overlay', '')
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Free the object URL on the next tick so the click handler has a chance
  // to start the download before we revoke it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
