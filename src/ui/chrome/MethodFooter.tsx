import { useViewport } from './useViewport'

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
 */
export function MethodFooter() {
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
      <span className="rw-method-footer__link">↗ Methode im Detail</span>
    </footer>
  )
}
