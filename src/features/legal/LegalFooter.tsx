import type { Route } from '../../app/useRoute'
import './legal.css'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

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
      event.preventDefault()
      navigate(target)
    }
  }

  return (
    <footer className="app-footer" {...containerTargetProps} data-qa-section="true">
      <span className="app-footer-copy">
        Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.
      </span>
      <nav className="app-footer-nav">
        <a href="/impressum" onClick={go('/impressum')} {...impressumLinkProps}>
          Impressum
        </a>
        <span aria-hidden="true">·</span>
        <a href="/datenschutz" onClick={go('/datenschutz')} {...datenschutzLinkProps}>
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
    </footer>
  )
}
