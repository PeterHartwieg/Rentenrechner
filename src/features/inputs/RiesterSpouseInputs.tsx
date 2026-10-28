import type { RiesterAssumptions } from '../../domain'
import { NumberField } from '../../ui/NumberField'

export function RiesterSpouseInputs({ riester, onChange }: {
  riester: RiesterAssumptions
  onChange: (next: RiesterAssumptions) => void
}) {
  const spouse = riester.spouse
  const patch = (value: Partial<NonNullable<RiesterAssumptions['spouse']>>) => {
    if (spouse) onChange({ ...riester, spouse: { ...spouse, ...value } })
  }
  return <fieldset className="field-grid">
    <legend>Riester-Förderung als Paar</legend>
    <label className="field field-inline">
      <input type="checkbox" checked={!!spouse} onChange={(e) => onChange({ ...riester,
        spouse: e.target.checked ? {
          grossSalaryYear: 0, taxableIncomeAnnual: 0, monthlyOwnContribution: 0, jointAssessment: true,
          eligibility: { directlyEligible: false, indirectSpouseEligible: false,
            claimsChildAllowance: false, careerStarterBonusUsed: true, ageAtContractStart: riester.eligibility.ageAtContractStart },
        } : undefined,
      })} />
      Zweiten Riester-Vertrag für die Förderberechnung erfassen
    </label>
    {spouse && <>
      <p className="field-hint">Bitte die Angaben der zweiten Person ergänzen. Hier wird nur deren Einfluss auf die Förderung deines Vertrags berechnet. Für beide Vertragsvermögen nutze den Kombinieren-Modus.</p>
      <NumberField label="Partner: Bruttoeinkommen pro Jahr" value={spouse.grossSalaryYear} min={0} step={1000}
        onChange={(v) => patch({ grossSalaryYear: Number(v) })} />
      <NumberField label="Partner: zu versteuerndes Einkommen vor Riester" value={spouse.taxableIncomeAnnual} min={0} step={100}
        onChange={(v) => patch({ taxableIncomeAnnual: Number(v) })} />
      <NumberField label="Partner: relevantes Vorjahreseinkommen" value={spouse.eligibility.priorYearRelevantIncome ?? spouse.grossSalaryYear} min={0} step={100}
        onChange={(v) => patch({ eligibility: { ...spouse.eligibility, priorYearRelevantIncome: Number(v) } })} />
      <NumberField label="Partner: Riester-Eigenbeitrag pro Monat" value={spouse.monthlyOwnContribution} min={0} step={1} decimals={2}
        onChange={(v) => patch({ monthlyOwnContribution: Number(v) })} />
      <label className="field">Partner: Förderberechtigung
        <select value={spouse.eligibility.directlyEligible ? 'direct' : spouse.eligibility.indirectSpouseEligible ? 'indirect' : 'none'}
          onChange={(e) => patch({ eligibility: { ...spouse.eligibility, directlyEligible: e.target.value === 'direct', indirectSpouseEligible: e.target.value === 'indirect' } })}>
          <option value="none">Nicht berechtigt</option><option value="direct">Unmittelbar berechtigt</option><option value="indirect">Mittelbar berechtigt</option>
        </select>
      </label>
      <label className="field field-inline"><input type="checkbox" checked={spouse.jointAssessment}
        onChange={(e) => patch({ jointAssessment: e.target.checked })} />Zusammenveranlagung für Riester</label>
      <label className="field field-inline"><input type="checkbox" checked={spouse.eligibility.claimsChildAllowance === true}
        onChange={(e) => onChange({ ...riester,
          eligibility: { ...riester.eligibility, claimsChildAllowance: !e.target.checked },
          spouse: { ...spouse, eligibility: { ...spouse.eligibility, claimsChildAllowance: e.target.checked } },
        })} />Kinderzulagen bei der zweiten Person</label>
      <p className="field-hint">Mittelbare Berechtigung setzt einen eigenen Vertrag vor der Auszahlung, nicht dauernd getrennt lebende Ehepartner und Wohnsitz in EU/EWR voraus. Kinderzulagen dürfen nur einer Person zugeordnet sein. Ohne vollständige Angaben sind die Förderwerte nur eine Schätzung.</p>
    </>}
  </fieldset>
}
