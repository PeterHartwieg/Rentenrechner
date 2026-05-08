import type { Route } from '../../app/useRoute'
import './legal.css'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'
import { useQaMode } from '../qa-feedback/useQaMode'

interface Props {
  navigate: (target: Route) => void
}

export function LegalFooter({ navigate }: Props) {
  /**
   * TEMPORARY: QA activator button gated by VITE_QA_FOOTER_BUTTON=true.
   * Exists only for the soft-launch QA window so non-technical testers can
   * activate QA mode without editing URLs or knowing keyboard shortcuts.
   *
   * Remove this constant, the qaButtonTargetProps hook call, the qaEnabled /
   * activateQa lines, and the JSX block below once the QA window closes.
   * Also remove the useQaMode import if nothing else in this file uses it.
   *
   * Cleanup task: .scratch/qa-feedback-mode/issues/18-temporary-footer-button-to-activate-qa.md
   */
  // TEMPORARY — evaluated at render time so vitest/vi.stubEnv works in tests.
  const qaFooterButtonEnabled = import.meta.env.VITE_QA_FOOTER_BUTTON === 'true'
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
  // TEMPORARY — see JSDoc above for the cleanup instructions.
  const { targetProps: qaButtonTargetProps } = useFeedbackTarget({
    id: 'legal.footer.qa-activate',
    label: 'QA-Modus starten',
  })
  const { enabled: qaEnabled, activate: activateQa } = useQaMode()

  function go(target: Route) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      navigate(target)
    }
  }

  return (
    <footer className="app-footer" {...containerTargetProps}>
      <span className="app-footer-copy">
        Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.
      </span>
      <nav className="app-footer-nav">
        <a href="/impressum/" onClick={go('/impressum')} {...impressumLinkProps}>
          Impressum
        </a>
        <span aria-hidden="true">·</span>
        <a href="/datenschutz/" onClick={go('/datenschutz')} {...datenschutzLinkProps}>
          Datenschutzerklärung
        </a>
        <span aria-hidden="true">·</span>
        <span
          title="PolyForm Noncommercial 1.0.0 — kommerzielle Nutzung lizenzpflichtig"
          {...lizenzProps}
        >
          Lizenz: PolyForm Noncommercial 1.0.0
        </span>
        {/* TEMPORARY — flag-gated QA activator for non-technical testers.
            Remove this block, the qaFooterButtonEnabled constant, the
            qaButtonTargetProps hook call, and the useQaMode import once the
            QA window closes. Cleanup task ref: see JSDoc above. */}
        {qaFooterButtonEnabled && !qaEnabled && (
          <>
            <span aria-hidden="true">·</span>
            <span className="app-footer-qa-hint">
              Sie testen für uns?{' '}
              <button
                type="button"
                className="app-footer-qa-button"
                aria-label="Aktiviert den Feedback-Modus. Klicken Sie anschließend ein UI-Element an, um Feedback zu geben."
                title="Aktiviert den Feedback-Modus. Klicken Sie anschließend ein UI-Element an, um Feedback zu geben."
                onClick={activateQa}
                {...qaButtonTargetProps}
              >
                QA-Modus starten
              </button>{' '}
              — dann auf das fragliche Element klicken.
            </span>
          </>
        )}
      </nav>
    </footer>
  )
}
