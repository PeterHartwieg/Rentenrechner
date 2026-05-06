import { useId, useState, useRef, useEffect, type ReactNode } from 'react'
import { HelpCircle, Info } from 'lucide-react'
import './InfoTip.css'
import { useFeedbackTarget, useQaMode } from '../features/qa-feedback'

interface Props {
  /** One short sentence shown in the popover. */
  text?: string
  /** Optional rich content; takes precedence over `text` when provided. */
  children?: ReactNode
  /** Optional aria-label override for the trigger. */
  label?: string
  icon?: 'help' | 'info'
  /**
   * QA-feedback target id. When set, the trigger button carries a
   * `data-qa-target` attribute so QA mode can pin this tooltip as a feedback
   * subject. Inert when QA mode is disabled.
   *
   * The popover body also gets its own target with id `<feedbackTargetId>.popover`
   * so QA testers can select the popover content independently of the trigger.
   *
   * Convention: `<surface>.<region>.<element>.tooltip`
   */
  feedbackTargetId?: string
}

/**
 * Tiny inline icon that opens an explanation popover on click. Use next to
 * jargon labels that block comprehension for non-experts.
 */
export function InfoTip({
  text,
  children,
  label = 'Erklärung anzeigen',
  icon = 'help',
  feedbackTargetId,
}: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const Icon = icon === 'info' ? Info : HelpCircle
  const { enabled: qaEnabled } = useQaMode()

  const { targetProps: triggerTargetProps } = useFeedbackTarget({
    id: feedbackTargetId ?? '',
    label,
    precision: 'exact',
  })
  const triggerQaProps = feedbackTargetId ? triggerTargetProps : {}

  // Popover body gets a separate target id so QA testers can pin it independently.
  const { targetProps: popoverTargetProps } = useFeedbackTarget({
    id: feedbackTargetId ? `${feedbackTargetId}.popover` : '',
    label: feedbackTargetId ? `${label} (Erklärungstext)` : '',
    precision: 'exact',
  })
  const popoverQaProps = feedbackTargetId ? popoverTargetProps : {}

  useEffect(() => {
    if (!open) return
    function handlePointer(e: MouseEvent) {
      // In QA mode, clicks on [data-qa-target] elements inside the popover are
      // intercepted by the overlay (capture phase, stopPropagation). The mousedown
      // event fires before the QA overlay click handler — so we must not close
      // the popover if the click target is inside a [data-qa-target] element when
      // QA mode is active. This preserves the "pinning inside a popover does not
      // close the popover" invariant (issue 17).
      if (qaEnabled) {
        const target = e.target as HTMLElement | null
        if (target?.closest('[data-qa-target]')) return
      }
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
  }, [open, qaEnabled])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        {...triggerQaProps}
      >
        <Icon size={13} aria-hidden="true" />
      </button>
      {open && (
        <span className="info-tip-popover" id={id} role="tooltip" {...popoverQaProps}>
          {children ?? text}
        </span>
      )}
    </span>
  )
}
