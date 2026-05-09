import type { PersonalProfile, ScenarioAssumptions, BavFundingResult, GermanRules } from '../../domain'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  bavFunding: BavFundingResult
  rules: GermanRules
}

export function FairnessPanel({ profile, assumptions, bavFunding, rules }: Props) {
  return (
    <div className="assumption-panel">
      <h2>Annahmen zur Fairness</h2>
      <p>
        Alle Produkte werden mit demselben monatlichen Nettoaufwand verglichen wie die bAV.
        Dadurch wird die bAV gegen die echte Belastung aus deinem Nettogehalt verglichen.
      </p>
      <dl>
        <div>
          <dt>Steuerprofil</dt>
          <dd>
            Klasse I,{' '}
            {profile.childBirthYears.length === 0
              ? 'keine Kinder'
              : profile.childBirthYears.length === 1
                ? '1 Kind'
                : `${profile.childBirthYears.length} Kinder`}
            , Kirchensteuer nicht berechnet
          </dd>
        </div>
        <div>
          <dt>Krankenversicherung</dt>
          <dd>
            {profile.publicHealthInsurance
              ? `GKV, Zusatzbeitrag ${formatPercent(profile.healthAdditionalContributionPct / 100)}`
              : `PKV, ${formatCurrency(profile.pkvMonthlyPremium, 0)} KV + ${formatCurrency(profile.pPVMonthlyPremium, 0)} pPV/Monat, AG-Zuschuss zur PKV: ${formatCurrency(bavFunding.salaryWithoutBav.pkv257SubsidyMonthly, 0)}/Monat`}
          </dd>
        </div>
        <div>
          <dt>Steuervereinfachungen</dt>
          <dd>
            ETF-Einmalkapital ohne Sparerpauschbetrag; ETF-Entnahme mit jährlichem
            Sparerpauschbetrag. bAV-Einmalkapital: persönlicher Steuersatz (Fünftelregelung
            für Direktzusage/UK); KV/PV nach 1/120-Methode (§229 SGB V).
          </dd>
        </div>
        <div>
          <dt>Rechtsstand</dt>
          <dd>DE 2026, konfigurierbare Regeldatei</dd>
        </div>
        <div>
          <dt>bAV-Kostenbenchmark</dt>
          <dd>
            {formatPercent(assumptions.bav.fees.contributionFee)} je Beitrag,{' '}
            {formatPercent(assumptions.bav.fees.wrapperAssetFee + assumptions.bav.fees.fundAssetFee)} p.a. Kapitalgebühr (Mantel {formatPercent(assumptions.bav.fees.wrapperAssetFee)} + Fonds {formatPercent(assumptions.bav.fees.fundAssetFee)}),{' '}
            {formatPercent(assumptions.bav.fees.acquisitionCostPct)} Abschlusskosten
          </dd>
        </div>
        <div>
          <dt>pAV-Kostenbenchmark</dt>
          <dd>
            {formatPercent(assumptions.insurance.fees.contributionFee)} je Beitrag,{' '}
            {formatCurrency(assumptions.insurance.fees.fixedMonthlyFee, 1)} mtl.,{' '}
            {formatPercent(assumptions.insurance.fees.wrapperAssetFee + assumptions.insurance.fees.fundAssetFee)} p.a. Kapitalgebühr (Mantel {formatPercent(assumptions.insurance.fees.wrapperAssetFee)} + Fonds {formatPercent(assumptions.insurance.fees.fundAssetFee)})
          </dd>
        </div>
        <div>
          <dt>bAV-Beitragsklassifizierung</dt>
          <dd>
            {(() => {
              const f = bavFunding
              const taxFreeMonthly = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap / 12
              const svFreeMonthly = rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap / 12
              const totalMonthly = f.totalBavContributionAnnual / 12
              if (f.taxableOverflowAnnual === 0 && f.svLiableOverflowAnnual === 0) {
                return (
                  <>
                    Gesamt {formatCurrency(totalMonthly, 0)} mtl. — vollständig steuer-
                    und SV-frei (Limit: {formatCurrency(svFreeMonthly, 0)} / {formatCurrency(taxFreeMonthly, 0)} mtl.)
                  </>
                )
              }
              return (
                <>
                  Gesamt {formatCurrency(totalMonthly, 0)} mtl.
                  {f.svLiableOverflowAnnual > 0 && (
                    <> · SV-pflichtig: {formatCurrency(f.svLiableOverflowAnnual / 12, 0)} mtl. (Grenze: {formatCurrency(svFreeMonthly, 0)})</>
                  )}
                  {f.taxableOverflowAnnual > 0 && (
                    <> · Steuerpflichtig: {formatCurrency(f.taxableOverflowAnnual / 12, 0)} mtl. (Grenze: {formatCurrency(taxFreeMonthly, 0)})</>
                  )}
                </>
              )
            })()}
          </dd>
        </div>
      </dl>
    </div>
  )
}
