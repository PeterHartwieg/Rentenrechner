import { Check } from 'lucide-react'
import { SimpleNumber, type WizardProps } from './shared'

/**
 * Guided-setup wizard for the `low_income_parent` trigger.
 *
 * Captures part-time percentage, child birth years (up to 3), and a tight
 * monthly budget. The `onApplyAndComplete` callback in GuidedSetup.tsx writes
 * the basics back to the profile; the path-specific fields (childBirthYears,
 * partTimePct, tightBudgetMonthly) are surfaced via `extras` so GuidedSetup
 * can read them when building the nextProfile / nextAssumptions.
 *
 * Output workspace shape (enforced by unit tests):
 * - `pensionBaselineType`: 'grv' (employee)
 * - `visibleProducts`: ['riester', 'altersvorsorgedepot', 'etf']
 * - `riester.eligibility.directlyEligible`: true
 * - `profile.childBirthYears`: populated from the entered birth years
 */
export function LowIncomeParentWizard({
  basics,
  setBasics,
  extras,
  setExtras,
  onApplyAndComplete,
  onBack,
}: WizardProps) {
  // Parse child birth years from the extras string-based store.
  // We reuse PathSpecific.childBirthYear1/2/3 via the numeric fields below.
  const child1 = extras.childBirthYear1
  const child2 = extras.childBirthYear2
  const child3 = extras.childBirthYear3
  const currentYear = new Date().getFullYear()

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
          label="Brutto pro Jahr (Teilzeit)"
          value={basics.grossSalaryYear}
          min={0}
          max={200_000}
          step={1000}
          onChange={(value) => setBasics((b) => ({ ...b, grossSalaryYear: value }))}
          suffix="EUR"
          hint="Dein aktuelles Jahresbruttogehalt in Teilzeit."
        />
        <SimpleNumber
          label="Teilzeitquote"
          value={extras.partTimePct}
          min={10}
          max={100}
          step={5}
          onChange={(value) => setExtras((e) => ({ ...e, partTimePct: value }))}
          suffix="% Stelle"
          hint="Wirkt auf Riester-Mindesteigenbeitrag und Zulagen-Proration."
        />
        <SimpleNumber
          label="Monatliches Sparbudget"
          value={extras.tightBudgetMonthly}
          min={0}
          max={2000}
          step={10}
          onChange={(value) => setExtras((e) => ({ ...e, tightBudgetMonthly: value }))}
          suffix="EUR/Monat"
          hint="Was du realistisch pro Monat zurücklegen kannst."
        />
        <SimpleNumber
          label="Geburtsjahr Kind 1"
          value={child1 > 0 ? child1 : 0}
          min={0}
          max={currentYear}
          step={1}
          onChange={(value) => setExtras((e) => ({ ...e, childBirthYear1: value }))}
          suffix="Jahr"
          hint="0 eingeben, falls kein weiteres Kind."
        />
        <SimpleNumber
          label="Geburtsjahr Kind 2 (optional)"
          value={child2 > 0 ? child2 : 0}
          min={0}
          max={currentYear}
          step={1}
          onChange={(value) => setExtras((e) => ({ ...e, childBirthYear2: value }))}
          suffix="Jahr"
          hint="0 = kein weiteres Kind."
        />
        <SimpleNumber
          label="Geburtsjahr Kind 3 (optional)"
          value={child3 > 0 ? child3 : 0}
          min={0}
          max={currentYear}
          step={1}
          onChange={(value) => setExtras((e) => ({ ...e, childBirthYear3: value }))}
          suffix="Jahr"
          hint="0 = kein weiteres Kind."
        />
      </div>

      <p className="guided-setup-note">
        Riester-Zulagen (Grundzulage 175 €/Jahr + 185–300 €/Kind/Jahr) werden automatisch
        berechnet. Du kannst Beiträge und Anbieter-Kosten danach im Dashboard anpassen.
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
