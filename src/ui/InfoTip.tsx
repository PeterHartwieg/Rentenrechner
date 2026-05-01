import { useId, useState, useRef, useEffect, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import './InfoTip.css'

interface Props {
  /** One short sentence shown in the popover. */
  text?: string
  /** Optional rich content; takes precedence over `text` when provided. */
  children?: ReactNode
  /** Optional aria-label override for the trigger. Defaults to "Erklärung anzeigen". */
  label?: string
}

/**
 * Tiny inline `(?)` icon that opens a one-sentence explanation popover on click.
 * Use next to jargon labels that block comprehension for non-experts (Effektivkosten,
 * Rentenfaktor, Teilfreistellung, Netto-Rente). For longer explanations, link to the
 * Glossar panel in the Angebot tab instead.
 */
export function InfoTip({ text, children, label = 'Erklärung anzeigen' }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle size={13} aria-hidden="true" />
      </button>
      {open && (
        <span className="info-tip-popover" id={id} role="tooltip">
          {children ?? text}
        </span>
      )}
    </span>
  )
}
