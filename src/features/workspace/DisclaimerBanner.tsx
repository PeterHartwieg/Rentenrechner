import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export function DisclaimerBanner() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem('disclaimer-dismissed') !== '1',
  )
  const [showPopup, setShowPopup] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    localStorage.setItem('disclaimer-dismissed', '1')
    setVisible(false)
    setShowPopup(false)
  }

  if (!visible) return null

  return (
    <div className="disclaimer-wrap" ref={ref}>
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
            Alle Berechnungen verwenden gesetzliche Werte mit Stand 2026 (Steuersätze,
            Sozialversicherungsbeiträge, Rentenwert; Quellen: BMF, Deutsche Rentenversicherung, GKV-Spitzenverband).
            Die Ergebnisse sind Schätzungen unter Ihren Annahmen — Renditen, Inflation,
            Lebenserwartung und künftige Gesetzesänderungen sind unbekannt.
          </p>
        </div>
      )}
      <button
        type="button"
        className="disclaimer-dismiss"
        aria-label="Hinweis ausblenden"
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  )
}
