import { Check } from 'lucide-react'
import { SimpleNumber, type WizardProps } from './shared'

/**
 * Guided-setup wizard for the `beamter` trigger.
 *
 * Captures Versorgung type (Beamtenpension / Versorgungswerk / mixed),
 * estimated gross monthly Versorgung, and health insurance status.
 *
 * Output workspace shape (enforced by unit tests):
 * - `statutoryPension.pensionBaselineType`: 'beamtenpension' or 'versorgungswerk'
 * - `visibleProducts`: ['basisrente', 'etf', 'versicherung'] — GRV/bAV absent
 * - `statutoryPension.manualMonthlyGross`: set from user input
 * - `profile.publicHealthInsurance`: false by default (Beamte typically in PKV)
 */
export function BeamterWizard({
  basics,
  setBasics,
  extras,
  setExtras,
  onApplyAndComplete,
  onBack,
}: WizardProps) {
  const versorgungType = extras.versorgungType ?? 'beamtenpension'

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
          label="Geplanter Renteneintritt"
          value={basics.retirementAge}
          min={Math.max(55, basics.age + 1)}
          max={75}
          onChange={(value) => setBasics((b) => ({ ...b, retirementAge: value }))}
          suffix="Jahre"
          hint="Beamte können je nach Bundesland ab 62–67 in Pension."
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

        <label className="guided-field">
          <span>Versorgungsart</span>
          <div className="guided-input-shell">
            <select
              value={versorgungType}
              onChange={(e) =>
                setExtras((ex) => ({
                  ...ex,
                  versorgungType: e.target.value as 'beamtenpension' | 'versorgungswerk' | 'mixed',
                }))
              }
            >
              <option value="beamtenpension">Beamtenpension (Beamtenversorgungsgesetz)</option>
              <option value="versorgungswerk">Versorgungswerk (z. B. Ärzte, Anwälte)</option>
              <option value="mixed">Gemischt (Beamtenpension + Versorgungswerk)</option>
            </select>
          </div>
          <small className="guided-field-hint">
            Bestimmt, welche Rentenformel und welcher Steuerweg (§19 vs §22 EStG) gilt.
          </small>
        </label>

        <SimpleNumber
          label="Erwartete Brutto-Versorgung (Schätzung)"
          value={extras.estimatedBeamtenpensionMonthly}
          min={0}
          max={20_000}
          step={100}
          onChange={(value) =>
            setExtras((e) => ({ ...e, estimatedBeamtenpensionMonthly: value }))
          }
          suffix="EUR/Monat"
          hint="Grobe Schätzung aus letzter Versorgungsauskunft. Kann später präzisiert werden."
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
            <small>
              Beamte sind meist privat krankenversichert (PKV) — ausschalten, wenn das auf
              dich zutrifft.
            </small>
          </span>
        </label>
      </div>

      <p className="guided-setup-note">
        GRV und bAV werden für Beamte und Versorgungswerk-Mitglieder aus dem Vergleich
        entfernt. Basisrente ist der primäre Schicht-1-Hebel. ETF und private
        Rentenversicherung als Schicht-3-Alternativen bleiben sichtbar.
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
