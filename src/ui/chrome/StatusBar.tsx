import { useViewport } from './useViewport'
/**
 * Slim, dark mono status bar fixed at the top of every page. Three internal
 * viewport variants:
 *   - desktop: full text (rentenwiki.de · independent project · source · build).
 *   - tablet:  full text, tighter horizontal padding.
 *   - phone:   URL + build date only.
 *
 * Build date is injected by Vite (see vite.config.ts `define`) so the
 * prerendered HTML and the hydrated bundle agree on the same UTC date.
 *
 * PolyForm Noncommercial is source-available, not an OSI open-source licence.
 * Keep the public label precise and avoid implying recognised charitable
 * status unless the project actually obtains it.
 */
declare const __RW_BUILD_DATE__: string

const BUILD_DATE = __RW_BUILD_DATE__
const SOURCE_LABEL = 'Quellcode offen'

export function StatusBar() {
  const viewport = useViewport()

  if (viewport === 'phone') {
    return (
      <div className="rw-status-bar rw-status-bar--phone" role="contentinfo" aria-label="Site-Statusleiste">
        <span className="rw-status-bar__dim">rentenwiki.de</span>
        <span className="rw-status-bar__dim">Stand {BUILD_DATE}</span>
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
      <span className="rw-status-bar__dim">Unabhängiges Projekt</span>
      <span className="rw-status-bar__sep">·</span>
      <span className="rw-status-bar__dim">{SOURCE_LABEL}</span>
      <span className="rw-status-bar__trailing rw-status-bar__dim">
        Stand {BUILD_DATE}
      </span>
    </div>
  )
}
