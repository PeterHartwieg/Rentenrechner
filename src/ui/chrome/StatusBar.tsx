import { useViewport } from './useViewport'
import packageJson from '../../../package.json'

/**
 * Slim, dark mono status bar fixed at the top of every page. Three internal
 * viewport variants:
 *   - desktop: full text (rentenwiki.de · Gemeinnütziges Projekt · github · build).
 *   - tablet:  full text, tighter horizontal padding.
 *   - phone:   URL + version only.
 *
 * Version + build date are derived from package.json so the bar stays in
 * sync with the deployed bundle without statutory-value duplication.
 */
const VERSION = packageJson.version
const BUILD_DATE = new Date().toISOString().slice(0, 10)
const REPO_URL = 'github.com/PeterHartwieg/Rentenrechner'

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
      <span className="rw-status-bar__dim">{REPO_URL}</span>
      <span className="rw-status-bar__trailing rw-status-bar__dim">
        v{VERSION} · {BUILD_DATE}
      </span>
    </div>
  )
}
