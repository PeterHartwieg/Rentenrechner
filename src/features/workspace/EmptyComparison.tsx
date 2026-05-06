import { ArrowRight } from 'lucide-react'
import { useFeedbackTarget } from '../qa-feedback'

interface Props {
  onOpenAngebot: () => void
}

/**
 * UX10: empty-state shown in the Vergleich view when no private products are
 * selected. The GRV baseline always projects, but a comparison only makes
 * sense once the user picks at least one Vorsorgeprodukt.
 */
export function EmptyComparison({ onOpenAngebot }: Props) {
  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: 'workspace.emptyComparison.section',
    label: 'Empty-State Vergleich',
    precision: 'section',
  })
  const { targetProps: headingProps } = useFeedbackTarget({
    id: 'workspace.emptyComparison.heading',
    label: 'Empty-State Überschrift',
  })
  const { targetProps: ctaProps } = useFeedbackTarget({
    id: 'workspace.emptyComparison.cta',
    label: 'CTA Produkte auswählen',
  })
  return (
    <section className="empty-comparison" role="note" {...sectionTargetProps}>
      <h3 {...headingProps}>Wähle mindestens ein Vorsorgeprodukt zum Vergleich</h3>
      <p>
        Die gesetzliche Rente bildet den Sockel. Ergänze ein privates Produkt — z. B.
        ETF-Depot oder bAV — um den Mehrwert für deine Situation zu sehen.
      </p>
      <button type="button" className="empty-comparison-cta" onClick={onOpenAngebot} {...ctaProps}>
        Produkte auswählen
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </section>
  )
}
