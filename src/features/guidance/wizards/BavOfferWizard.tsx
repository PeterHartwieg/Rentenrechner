import { Check } from 'lucide-react'
import {
  STATUTORY_BAV_SUBSIDY_PCT,
} from '../../../app/productPresentation'
import { SimpleNumber, type WizardProps } from './shared'

export function BavOfferWizard({ basics, setBasics, extras, setExtras, onApplyAndComplete, onBack }: WizardProps) {
  return (
    <>
      <div className="guided-form-grid">
        <SimpleNumber
          label="Alter heute"
          value={basics.age}
          min={18}
          max={70}
          onChange={(value) => setBasics((b) => ({ ...b, age: value }))}
          suffix="Jahre"
        />
        <SimpleNumber
          label="Renteneintritt"
          value={basics.retirementAge}
          min={Math.max(60, basics.age + 1)}
          max={75}
          onChange={(value) => setBasics((b) => ({ ...b, retirementAge: value }))}
          suffix="Jahre"
        />
        <SimpleNumber
          label="Brutto pro Jahr"
          value={basics.grossSalaryYear}
          min={0}
          max={500_000}
          step={1000}
          onChange={(value) => setBasics((b) => ({ ...b, grossSalaryYear: value }))}
          suffix="EUR"
        />
        <label className="guided-toggle">
          <input
            type="checkbox"
            checked={basics.publicHealthInsurance}
            onChange={(e) =>
              setBasics((b) => ({ ...b, publicHealthInsurance: e.target.checked }))
            }
          />
          <span>
            <strong>Gesetzlich krankenversichert</strong>
            <small>Ausschalten, falls privat krankenversichert (PKV).</small>
          </span>
        </label>
        <SimpleNumber
          label="bAV-Bruttoumwandlung"
          value={extras.bavGrossConversion}
          min={0}
          max={2000}
          step={10}
          onChange={(value) => setExtras((e) => ({ ...e, bavGrossConversion: value }))}
          suffix="EUR/Monat"
        />
        <SimpleNumber
          label="AG-Zuschuss (gesamt)"
          value={extras.bavTotalMatchPct}
          min={STATUTORY_BAV_SUBSIDY_PCT}
          max={100}
          step={5}
          onChange={(value) => setExtras((e) => ({ ...e, bavTotalMatchPct: value }))}
          suffix="% vom Brutto"
          hint={`Mindestens ${STATUTORY_BAV_SUBSIDY_PCT} % gesetzlicher AG-Zuschuss (§1a Abs. 1a BetrAVG).`}
        />
        <SimpleNumber
          label="ETF-TER (Vergleich)"
          value={extras.etfTerPct}
          min={0}
          max={3}
          step={0.05}
          onChange={(value) => setExtras((e) => ({ ...e, etfTerPct: value }))}
          suffix="% p.a."
        />
      </div>

      <p className="guided-setup-note">
        Standardannahme: bAV als Direktversicherung, lebenslange Rente,
        gesetzlich pflichtversichert in der Rente. Diese und weitere Punkte kannst du im
        Dashboard pro Produkt anpassen.
      </p>

      <footer className="guided-setup-footer guided-setup-actions">
        <button type="button" className="guided-setup-link" onClick={onBack}>
          Zurück
        </button>
        <button type="button" className="guided-setup-primary" onClick={onApplyAndComplete}>
          <Check size={16} aria-hidden="true" />
          Vergleich starten
        </button>
      </footer>
    </>
  )
}
