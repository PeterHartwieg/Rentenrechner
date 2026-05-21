import { useViewport } from './useViewport'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface MethodFooterProps {
  /** Navigate to a route (passed in from useRoute via AppShell). */
  navigate: (target: Route) => void
}

/**
 * Methodology footer. Three internal viewport variants:
 *   - desktop: full three-footnote row + "Methode im Detail" link on the right.
 *   - tablet:  same row, tighter padding.
 *   - phone:   hidden entirely; an inline "Methode im Detail" link appears at
 *              the end of the body content instead (rendered by the page).
 *
 * Footnotes here are placeholders for PR 1 (chrome skeleton). PR 4 will
 * replace them with citations driven from the rule-year tables in
 * src/rules/de2026.ts so the wording stays in sync with statutory values.
 *
 * R1.1: the "Methode im Detail" link is a real anchor (keyboard-tabbable,
 * crawlable, middle-click-openable). Plain primary clicks SPA-navigate;
 * modifier clicks fall through to the browser's native open-in-new-tab.
 */
export function MethodFooter({ navigate }: MethodFooterProps) {
  const viewport = useViewport()

  if (viewport === 'phone') {
    // Page bodies render their own "↗ Methode im Detail" link at content
    // end on phone to keep the footer area uncluttered.
    return null
  }

  const isTablet = viewport === 'tablet'

  return (
    <footer
      className={`rw-method-footer ${isTablet ? 'rw-method-footer--tablet' : 'rw-method-footer--desktop'}`}
      role="contentinfo"
      aria-label="Methodik-Fußzeile"
    >
      <span>[1] Annahme: 5 % Rendite p.a., 2 % Inflation</span>
      <span>[2] Steuern nach Stand 2026 (§22 EStG)</span>
      <span>[3] GRV-Werte: DRV-Renteninformation</span>
      <a
        href={routeToPath(ROUTES.methode)}
        className="rw-method-footer__link"
        onClick={(event) => {
          if (!shouldUseSpaNavigation(event)) return
          event.preventDefault()
          navigate(ROUTES.methode)
        }}
      >
        ↗ Methode im Detail
      </a>
    </footer>
  )
}
