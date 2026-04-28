import './CalculationWarnings.css'
import { CALCULATION_WARNINGS, BADGE_LABEL } from '../../app/productPresentation';

export function CalculationWarnings() {
  return (
    <section className="warnings-panel">
      <h2>Berechnungshinweise</h2>
      <div className="warnings-grid">
        {CALCULATION_WARNINGS.map((w) => (
          <div key={w.category} className="warning-item">
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
