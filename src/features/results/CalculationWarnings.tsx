import './CalculationWarnings.css'
import { CALCULATION_WARNINGS, BADGE_LABEL, type WarningStatus } from '../../app/productPresentation';
import { qaTargetAttrs } from '../qa-feedback/useFeedbackTarget';
import { useQaMode } from '../qa-feedback/useQaMode';

/** Derive a stable dot-path id from a warning category string. */
function warnCardId(category: string): string {
  const slug = category
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `results.berechnungshinweise.card.${slug}`
}

const STATUS_ORDER: WarningStatus[] = ['implementiert', 'vereinfacht', 'nicht-modelliert']

const GROUP_HEADING: Record<WarningStatus, string> = {
  implementiert: 'Vollständig modelliert',
  vereinfacht: 'Teilweise modelliert',
  'nicht-modelliert': 'Nicht modelliert',
}

export function CalculationWarnings() {
  const { enabled: qaEnabled } = useQaMode()
  return (
    <section className="warnings-panel">
      <h2>Berechnungshinweise</h2>
      {STATUS_ORDER.map((status) => {
        const items = CALCULATION_WARNINGS.filter((w) => w.status === status)
        return (
          <div key={status} data-warning-group={status} className="warnings-group">
            <h3 className="warnings-group-heading">{GROUP_HEADING[status]}</h3>
            {items.length > 0 ? (
              <div className="warnings-grid">
                {items.map((w) => (
                  <div
                    key={w.category}
                    className="warning-item"
                    {...qaTargetAttrs(qaEnabled, { id: warnCardId(w.category), label: w.category })}
                  >
                    <div className="warning-item-header">
                      <span className="warning-item-category">{w.category}</span>
                      <span className={`badge badge-${w.status}`}>{BADGE_LABEL[w.status]}</span>
                    </div>
                    <p className="warning-item-note">{w.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="warnings-group-empty">Keine Einträge.</p>
            )}
          </div>
        )
      })}
    </section>
  );
}
