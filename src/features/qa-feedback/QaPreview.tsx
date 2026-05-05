import { useMemo, useState } from 'react'
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

/**
 * Final review screen for the QA-feedback ticket (PRD US-20).
 *
 * Composes the full `FeedbackReport` from draft + environment + screenshot,
 * renders the metadata + privacy flags inline, and exposes two export paths:
 *
 *   1. **Markdown kopieren** — `navigator.clipboard.writeText`. Synchronous
 *      DOM operation, no network.
 *   2. **Bundle herunterladen** — saves the markdown + screenshot as two
 *      separate downloads using `URL.createObjectURL`. Issue 07 (Lane E)
 *      replaces this with a real `.zip` bundle.
 *
 * The "no network" guarantee (acceptance criterion 10) holds because both
 * paths are synchronous DOM-only — see `buildMarkdown.test.ts` for the
 * `fetch` spy.
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
  /**
   * Scenario-state opt-in (DECISIONS / issue 03). Default OFF — the share URL
   * and scenario JSON are only attached after the tester ticks this box. We
   * never read `window.location.href` preemptively.
   */
  const [includeScenario, setIncludeScenario] = useState(false)

  const report = useMemo<FeedbackReport>(
    () => buildReport({ target, draft, screenshot, includeScenario, collectScenarioJson, collectWorkspaceContext }),
    [target, draft, screenshot, includeScenario, collectScenarioJson, collectWorkspaceContext],
  )

  const markdown = useMemo(() => buildMarkdownTicket(report), [report])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setDownloaded(false)
    } catch {
      // Clipboard API may be unavailable (insecure context, denied permission).
      // Fallback: prompt the user to use the download button.
      setCopied(false)
    }
  }

  function handleDownload() {
    // TODO(issue 07): replace the two-file dance with a single .zip bundle.
    // Issue 07 (Lane E) owns the bundle format; for Phase 1 we simplify.
    triggerBlobDownload(
      new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
      sanitizeFileName(report.target.id) + '.md',
    )
    if (screenshot && draft.includeScreenshot) {
      triggerBlobDownload(screenshot.blob, sanitizeFileName(report.target.id) + '.png')
    }
    setDownloaded(true)
    setCopied(false)
  }

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

        {(copied || downloaded) && (
          <p className="qa-preview__copy-state" role="status">
            {copied ? 'Markdown in Zwischenablage kopiert.' : 'Bundle heruntergeladen.'}
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
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Free the object URL on the next tick so the click handler has a chance
  // to start the download before we revoke it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
