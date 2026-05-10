import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { RULES_YEAR } from '../../rules'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

export const DISMISS_KEY = 'disclaimer-dismissed'

export function DisclaimerBanner() {
  const [visible, setVisible] = useState(() => {
    // One-time migration: prior versions persisted dismissal in localStorage
    // (across sessions). Per the launch guardrails the banner must not be
    // permanently dismissible — clear any leftover value so the user sees it
    // again at least once per session.
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(DISMISS_KEY)
      } catch {
        /* ignore */
      }
    }
    if (typeof sessionStorage === 'undefined') return true
    return sessionStorage.getItem(DISMISS_KEY) !== '1'
  })
  const [showPopup, setShowPopup] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { targetProps: bodyTargetProps } = useFeedbackTarget({
    id: 'workspace.disclaimer.body',
    label: 'Disclaimer Banner',
    precision: 'section',
  })
  const { targetProps: dismissTargetProps } = useFeedbackTarget({
    id: 'workspace.disclaimer.dismiss',
    label: 'Disclaimer ausblenden',
  })

  useEffect(() => {
    if (!showPopup) return
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setShowPopup(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPopup])

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore — banner stays visible for the rest of the page lifecycle */
    }
    setVisible(false)
    setShowPopup(false)
  }

  if (!visible) return null

  return (
    <div className="disclaimer-wrap" ref={ref} {...bodyTargetProps}>
      <button
        type="button"
        className="disclaimer-btn"
        aria-label="Weitere Details anzeigen"
        onClick={() => setShowPopup((v) => !v)}
      >
        <Info size={14} aria-hidden="true" />
        <strong>Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.</strong>
      </button>
      {showPopup && (
        <div className="disclaimer-popup" role="note">
          <p>
            Alle Berechnungen verwenden gesetzliche Werte mit Stand {RULES_YEAR} (Steuersätze,
            Sozialversicherungsbeiträge, Rentenwert; Quellen: BMF, Deutsche Rentenversicherung, GKV-Spitzenverband).
            Die Ergebnisse sind Schätzungen unter Ihren Annahmen — Renditen, Inflation,
            Lebenserwartung und künftige Gesetzesänderungen sind unbekannt.
          </p>
        </div>
      )}
      <button
        type="button"
        className="disclaimer-dismiss"
        aria-label="Hinweis für diese Sitzung ausblenden"
        title="Nur für diese Sitzung ausblenden"
        onClick={dismiss}
        {...dismissTargetProps}
      >
        ✕
      </button>
    </div>
  )
}
