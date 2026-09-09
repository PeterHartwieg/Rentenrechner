import { useId } from 'react'
import type { UseOnboardingDraftApi } from './useOnboardingDraft'
import { type EmploymentKind, type ProfileDraftErrors } from './onboardingDraft'
import { OnboardingDisclosure, OnboardingNumberField } from './OnboardingFields'

export function OnboardingProfileStep({ draft, errors, mode, showErrors }: {
  mode: 'onboarding' | 'edit'
  draft: UseOnboardingDraftApi
  errors: ProfileDraftErrors
  showErrors: boolean
}) {
  const id = useId()
  const { profile, pension, setProfileValue, patchProfile, patchPension, setFieldUnknown } = draft
  const numberField = (key: 'age' | 'grossSalaryYear' | 'retirementAge' | 'pkvMonthlyPremium' | 'pPVMonthlyPremium', label: string) => (
    <OnboardingNumberField key={key} label={label} field={profile[key]} error={errors[key]} showErrors={showErrors}
      hideAssumed={mode === 'onboarding'} placeholder={key === 'age' ? 'z. B. 35' : key === 'grossSalaryYear' ? 'z. B. 60000' : undefined}
      step={key === 'pkvMonthlyPremium' || key === 'pPVMonthlyPremium' ? 0.01 : 1}
      onValue={(value) => setProfileValue(key, value)} onUnknown={() => setFieldUnknown('profile', key)} />
  )
  return (
    <div className="onboarding-step" data-testid="onboarding-profile-step">
      <div className="onboarding-grid">
        {numberField('age', 'Dein Alter')}
        {numberField('grossSalaryYear', profile.employment.value === 'self_employed'
          ? 'Gewinn vor Steuern pro Jahr (€)' : 'Jahreseinkommen brutto (€)')}
      </div>
      <div className="onboarding-grid">
        <label className="onboarding-select" htmlFor={`${id}-employment`}>Deine Tätigkeit
          <select id={`${id}-employment`} value={profile.employment.value ?? ''}
            onChange={(event) => {
              const employment = event.target.value as EmploymentKind
              setProfileValue('employment', employment)
              // A civil-service answer offers the matching supported pension path.
              // Other occupations retain any explicitly chosen pension system.
              if (employment === 'civil_servant' && pension.system === 'grv') {
                patchPension('system', 'beamtenpension')
                patchPension('method', 'projected-gross')
              }
            }}>
            {!profile.employment.value && <option value="" disabled>Bitte auswählen</option>}
            <option value="employee">Angestellt</option>
            <option value="self_employed">Selbstständig</option>
            <option value="civil_servant">Verbeamtet</option>
            <option value="other">Anderes</option>
          </select>
        </label>
        <label className="onboarding-select" htmlFor={`${id}-health`}>Krankenversicherung
          <select id={`${id}-health`} value={profile.publicHealthInsurance.value === null ? '' : profile.publicHealthInsurance.value ? 'gkv' : 'pkv'}
            onChange={(event) => setProfileValue('publicHealthInsurance', event.target.value === 'gkv')}>
            {profile.publicHealthInsurance.value === null && <option value="" disabled>Bitte auswählen</option>}
            <option value="gkv">Gesetzlich</option>
            <option value="pkv">Privat</option>
          </select>
        </label>
      </div>
      {profile.publicHealthInsurance.value === false && <section className="onboarding-step" aria-label="Private Versicherungsbeiträge">
        <div className="onboarding-grid">
          {numberField('pkvMonthlyPremium', 'Private Krankenversicherung (€/Monat)')}
          {numberField('pPVMonthlyPremium', 'Private Pflegeversicherung (€/Monat)')}
        </div>
        <p className="onboarding-hint">Ohne Beitrag bleibt dein Netto-Ergebnis offen.</p>
      </section>}
      <OnboardingDisclosure title="Rentenalter & weitere Angaben">
        {numberField('retirementAge', 'Rentenbeginn mit')}
        <label className="onboarding-choice">
          <input type="checkbox" checked={profile.churchTax}
            onChange={(event) => patchProfile('churchTax', event.target.checked)} />
          Kirchensteuer
        </label>
        <div>
          <p>Kinder-Geburtsjahre</p>
          <p className="onboarding-hint">{profile.childBirthYears.length
            ? profile.childBirthYears.join(', ') : 'Keine Kinder angegeben.'}</p>
        </div>
        <a href="/eingaben">Weitere Angaben unter Deine Angaben</a>
      </OnboardingDisclosure>
    </div>
  )
}
