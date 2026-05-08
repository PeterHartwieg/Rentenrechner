import './CalculationWarnings.css'
import { CALCULATION_WARNINGS, BADGE_LABEL } from '../../app/productPresentation';
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

export function CalculationWarnings() {
  const { enabled: qaEnabled } = useQaMode()
  return (
    <section className="warnings-panel">
      <h2>Berechnungshinweise</h2>
      <div className="warnings-grid">
        {CALCULATION_WARNINGS.map((w) => (
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
    </section>
  );
}
