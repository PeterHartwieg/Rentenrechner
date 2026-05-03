import type { Route } from '../../app/useRoute'
import './legal.css'

interface Props {
  navigate: (target: Route) => void
}

export function LegalFooter({ navigate }: Props) {
  function go(target: Route) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      navigate(target)
    }
  }

  return (
    <footer className="app-footer">
      <span className="app-footer-copy">
        Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.
      </span>
      <nav className="app-footer-nav">
        <a href="/impressum" onClick={go('/impressum')}>
          Impressum
        </a>
        <span aria-hidden="true">·</span>
        <a href="/datenschutz" onClick={go('/datenschutz')}>
          Datenschutzerklärung
        </a>
        <span aria-hidden="true">·</span>
        <span title="PolyForm Noncommercial 1.0.0 — kommerzielle Nutzung lizenzpflichtig">
          Lizenz: PolyForm Noncommercial 1.0.0
        </span>
      </nav>
    </footer>
  )
}
