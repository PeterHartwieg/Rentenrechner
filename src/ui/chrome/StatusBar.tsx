import { useViewport } from './useViewport'
import packageJson from '../../../package.json'

/**
 * Slim, dark mono status bar fixed at the top of every page. Three internal
 * viewport variants:
 *   - desktop: full text (rentenwiki.de · Gemeinnütziges Projekt · source · build).
 *   - tablet:  full text, tighter horizontal padding.
 *   - phone:   URL + version only.
 *
 * Version comes from package.json. Build date is injected by Vite (see
 * vite.config.ts `define`) so the prerendered HTML and the hydrated
 * bundle agree on the same UTC date — without that pin the value would
 * recompute at client load time and drift across UTC midnight.
 *
 * The public-facing string deliberately says "Open Source" (not the
 * GitHub repo path) so the chrome doesn't leak the internal working
 * name (CLAUDE.md "Brand in public copy" P0 guardrail).
 */
declare const __RW_BUILD_DATE__: string

const VERSION = packageJson.version
const BUILD_DATE = __RW_BUILD_DATE__
const SOURCE_LABEL = 'Open Source'

export function StatusBar() {
  const viewport = useViewport()

  if (viewport === 'phone') {
    return (
      <div className="rw-status-bar rw-status-bar--phone" role="contentinfo" aria-label="Site-Statusleiste">
        <span className="rw-status-bar__dim">rentenwiki.de</span>
        <span className="rw-status-bar__dim">v{VERSION} · {BUILD_DATE}</span>
      </div>
    )
  }

  const isTablet = viewport === 'tablet'
  return (
    <div
      className={`rw-status-bar ${isTablet ? 'rw-status-bar--tablet' : 'rw-status-bar--desktop'}`}
      role="contentinfo"
      aria-label="Site-Statusleiste"
    >
      <span className="rw-status-bar__dim">rentenwiki.de</span>
      <span className="rw-status-bar__sep">·</span>
      <span className="rw-status-bar__dim">Gemeinnütziges Projekt</span>
      <span className="rw-status-bar__sep">·</span>
      <span className="rw-status-bar__dim">{SOURCE_LABEL}</span>
      <span className="rw-status-bar__trailing rw-status-bar__dim">
        v{VERSION} · {BUILD_DATE}
      </span>
    </div>
  )
}
