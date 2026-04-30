import { ArrowRight } from 'lucide-react'

interface Props {
  onOpenAngebot: () => void
}

/**
 * UX10: empty-state shown in the Vergleich view when no private products are
 * selected. The GRV baseline always projects, but a comparison only makes
 * sense once the user picks at least one Vorsorgeprodukt.
 */
export function EmptyComparison({ onOpenAngebot }: Props) {
  return (
    <section className="empty-comparison" role="note">
      <h3>Wähle mindestens ein Vorsorgeprodukt zum Vergleich</h3>
      <p>
        Die gesetzliche Rente bildet den Sockel. Ergänze ein privates Produkt — z. B.
        ETF-Depot oder bAV — um den Mehrwert für deine Situation zu sehen.
      </p>
      <button type="button" className="empty-comparison-cta" onClick={onOpenAngebot}>
        Produkte auswählen
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </section>
  )
}
