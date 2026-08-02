import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import './legal.css'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface Props {
  navigate: (target: Route) => void
}

export function LegalFooter({ navigate }: Props) {
  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'legal.footer.container',
    label: 'Rechtlicher Footer',
    precision: 'section',
  })
  const { targetProps: impressumLinkProps } = useFeedbackTarget({
    id: 'legal.footer.impressum',
    label: 'Footer-Link Impressum',
  })
  const { targetProps: datenschutzLinkProps } = useFeedbackTarget({
    id: 'legal.footer.datenschutz',
    label: 'Footer-Link Datenschutzerklärung',
  })
  const { targetProps: lizenzProps } = useFeedbackTarget({
    id: 'legal.footer.license',
    label: 'Footer Lizenzhinweis',
  })
  function go(target: Route) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Preserve native modified-click behaviour (Cmd/Ctrl/middle/Shift)
      // so footer links open in a new tab when the user expects them to;
      // only intercept plain primary-button clicks for SPA navigation.
      if (!shouldUseSpaNavigation(event)) return
      event.preventDefault()
      navigate(target)
    }
  }

  return (
    <footer className="app-footer" {...containerTargetProps}>
      <div className="app-footer__method">
        <span>[1] Annahme: 5 % Rendite p.a., 2 % Inflation</span>
        <span>[2] Steuern nach Stand 2026 (§22 EStG)</span>
        <span>[3] GRV-Werte: DRV-Renteninformation</span>
        <a
          href={routeToPath(ROUTES.methode)}
          className="app-footer__method-link"
          onClick={go(ROUTES.methode)}
        >
          ↗ Methode im Detail
        </a>
      </div>
      <div className="app-footer__legal">
        <span className="app-footer-copy">
          Modellrechnung. Keine Anlage-, Steuer- oder Rechtsberatung.
        </span>
        <nav className="app-footer-nav">
          <a href="/impressum/" onClick={go(ROUTES.impressum)} {...impressumLinkProps}>
            Impressum
          </a>
          <span aria-hidden="true">·</span>
          <a href="/datenschutz/" onClick={go(ROUTES.datenschutz)} {...datenschutzLinkProps}>
            Datenschutzerklärung
          </a>
          <span aria-hidden="true">·</span>
          <span
            title="PolyForm Noncommercial 1.0.0 — kommerzielle Nutzung lizenzpflichtig"
            {...lizenzProps}
          >
            Lizenz: PolyForm Noncommercial 1.0.0
          </span>
        </nav>
      </div>
    </footer>
  )
}
