import { useMemo, useState } from 'react'
import {
  buildMarkdownTicket,
  defaultPrivacyFlags,
  type FeedbackReport,
  type ResolvedTarget,
} from './report'
import type { ComposerDraft } from './QaComposer'
import type { CapturedScreenshot } from './capture/screenshot'

interface PreviewProps {
  target: ResolvedTarget
  draft: ComposerDraft
  screenshot: CapturedScreenshot | null
  onBack(): void
  onCancel(): void
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
export function QaPreview({ target, draft, screenshot, onBack, onCancel }: PreviewProps) {
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const report = useMemo<FeedbackReport>(
    () => buildReport({ target, draft, screenshot }),
    [target, draft, screenshot],
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
        </dl>

        <div className="qa-panel__field">
          <span>Datenschutz</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Sensible Felder maskiert:{' '}
              <strong>{report.privacyFlags.sensitiveFieldsRedacted ? 'ja' : 'nein'}</strong>
            </li>
            <li>
              Szenario-Daten enthalten:{' '}
              <strong>{report.privacyFlags.scenarioStateIncluded ? 'ja' : 'nein'}</strong>
            </li>
            <li>
              Screenshot enthalten:{' '}
              <strong>{report.privacyFlags.screenshotIncluded ? 'ja' : 'nein'}</strong>
            </li>
          </ul>
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
}

/**
 * Compose the full `FeedbackReport` from the composer draft, the pinned
 * target, and (optionally) the captured screenshot.
 *
 * Lane B will inject privacy decisions here (e.g. allow the tester to flip
 * `sensitiveFieldsRedacted` if they explicitly opt out). Phase 1 keeps the
 * defaults from `defaultPrivacyFlags`.
 */
function buildReport({ target, draft, screenshot }: BuildReportArgs): FeedbackReport {
  const includeScreenshot = draft.includeScreenshot && screenshot !== null
  const filename = sanitizeFileName(target.id) + '.png'
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
    privacyFlags: defaultPrivacyFlags(includeScreenshot),
    screenshot: includeScreenshot && screenshot
      ? { fileName: filename, width: screenshot.width, height: screenshot.height }
      : undefined,
  }
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
