import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import './legal.css'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { ProjectSupport } from './ProjectSupport'

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
      <nav className="app-footer-nav" aria-label="Weitere Informationen">
        <a href={routeToPath(ROUTES.methode)} onClick={go(ROUTES.methode)}>
          Methode &amp; Quellen
        </a>
        <a href="/impressum/" onClick={go(ROUTES.impressum)} {...impressumLinkProps}>
          Impressum
        </a>
        <a href="/datenschutz/" onClick={go(ROUTES.datenschutz)} {...datenschutzLinkProps}>
          Datenschutz
        </a>
        <a
          href="/impressum/#lizenz"
          title="PolyForm Noncommercial 1.0.0 — kommerzielle Nutzung lizenzpflichtig"
          {...lizenzProps}
        >
          Lizenz
        </a>
        <details className="app-footer-support">
          <summary>Projekt unterstützen</summary>
          <ProjectSupport />
        </details>
      </nav>
      <span className="app-footer-copy">
        Modellrechnung. Keine Anlage-, Steuer- oder Rechtsberatung.
      </span>
    </footer>
  )
}
