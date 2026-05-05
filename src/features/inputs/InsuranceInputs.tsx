import '../../ui/forms.css'
import '../../ui/fees.css'
import './InsuranceInputs.css'
import { useState } from 'react'
import type React from 'react'
import type {
  FeeModel,
  GermanRules,
  InsuranceProductResult,
  InsuranceTaxMode,
  PersonalProfile,
  ScenarioAssumptions,
} from '../../domain';
import { NumberField } from '../../ui/NumberField';
import { InfoTip } from '../../ui/InfoTip';
import { formatCurrency, formatPercent } from '../../utils/format';
import { PAV_FEE_PRESETS } from '../../app/productPresentation';
import { getTerm } from '../../content/terms';
import { PayoutModeSection } from './sections/PayoutModeSection';
import { OfferCapitalCompareField } from './sections/OfferCapitalCompareField';
import { BeitragsdynamikField } from './sections/BeitragsdynamikField';
import { FeeSection, type FeeInputMode } from './sections/FeeSection';

type Props = {
  assumptions: ScenarioAssumptions;
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>;
  profile: PersonalProfile;
  insuranceTaxMode: InsuranceTaxMode;
  insuranceProductResult: InsuranceProductResult | undefined;
  rules: GermanRules;
};

const TAX_MODE_SHORT: Record<InsuranceTaxMode, string> = {
  pre2005: 'steuerfrei (vor 2005)',
  halbeinkuenfte: 'Halbeinkünfteverfahren',
  abgeltungsteuer: 'Abgeltungsteuer',
  ertragsanteil: 'Ertragsanteil (Leibrente)',
}

export function InsuranceInputs({
  assumptions,
  onAssumptionsChange,
  profile,
  insuranceTaxMode,
  insuranceProductResult,
}: Props) {
  const ins = assumptions.insurance;
  const riy = insuranceProductResult?.accumulationRiy ?? 0
  const [feeInputMode, setFeeInputMode] = useState<FeeInputMode>('aufgeschluesselt')
  const [offerCapital, setOfferCapital] = useState<number | null>(null)
  const modelCapital = insuranceProductResult?.capitalAtRetirement ?? 0
  const erweitertSummary = `${TAX_MODE_SHORT[insuranceTaxMode]}${riy > 0 ? ` · Kosten: ${formatPercent(riy)}` : ''}${ins.capitalGuarantee.enabled ? ` · Garantie: ${(ins.capitalGuarantee.floorPctOfContributions * 100).toFixed(0)} %` : ''}`

  return (
    <>
      <NumberField
        label="Vertragsbeginn (Jahr)"
        value={ins.contractStartYear}
        min={1970}
        max={2030}
        step={1}
        labelSuffix={
          insuranceTaxMode === 'halbeinkuenfte' ? (
            <InfoTip text={getTerm('halbeinkuenfte')!.shortHelp} label="Halbeinkünfteverfahren erklären" />
          ) : null
        }
        onChange={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            insurance: { ...current.insurance, contractStartYear: Number(value) },
          }))
        }
      />
      <small className="field-hint">
        {insuranceTaxMode === 'pre2005' && (
          <>Altvertrag (vor 2005): Kapitalwahl steuerfrei. Rechtsgrundlage: §52 Abs. 28 EStG a.F.</>
        )}
        {insuranceTaxMode === 'halbeinkuenfte' && (
          <>Nur die Hälfte des Ertrags wird mit Ihrem persönlichen Steuersatz versteuert (≥ 12 Jahre Laufzeit, Auszahlung ab 62). Rechtsgrundlage: §20 Abs. 1 Nr. 6 EStG.</>
        )}
        {insuranceTaxMode === 'abgeltungsteuer' && (
          <>Voller Ertrag mit 25 % Abgeltungsteuer + Soli (Bedingungen für Halbeinkünfteverfahren nicht erfüllt). Rechtsgrundlage: §20 Abs. 2 EStG.</>
        )}
      </small>

      <PayoutModeSection
        productLabel="pAV"
        payoutMode={ins.payoutMode}
        onChangePayoutMode={(mode) =>
          onAssumptionsChange((current) => ({
            ...current,
            insurance: { ...current.insurance, payoutMode: mode },
          }))
        }
        rentenfaktor={ins.rentenfaktor}
        onChangeRentenfaktor={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            insurance: { ...current.insurance, rentenfaktor: value },
          }))
        }
        rentenfaktorDefault={28}
        zeitrenteYears={ins.zeitrenteYears}
        onChangeZeitrenteYears={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            insurance: { ...current.insurance, zeitrenteYears: value },
          }))
        }
      />

      <OfferCapitalCompareField
        modelCapital={modelCapital}
        offerCapital={offerCapital}
        onChangeOfferCapital={setOfferCapital}
      />

      {riy > 0 && (
        <p className="field-hint">
          Effektivkosten:{' '}
          <strong className={riy > 0.015 ? 'riy-warn' : ''}>{formatPercent(riy)}</strong>
          {riy > 0.015 && ' — Nettotarife erzielen typisch 0,6–1,0 %'}
        </p>
      )}

      <details className="erweitert-section">
        <summary>
          <span className="erweitert-toggle">Erweitert</span>
          <span className="erweitert-assumption">{erweitertSummary}</span>
        </summary>
        <div className="erweitert-content">
          {ins.contractStartYear < 2005 && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={ins.oldContractTaxFreeEligible}
                  onChange={(event) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        oldContractTaxFreeEligible: event.target.checked,
                      },
                    }))
                  }
                />
                <span>Altvertrag steuerfrei (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre)</span>
              </label>
              {ins.contractStartYear < 2005 && !ins.oldContractTaxFreeEligible && (
                <p className="field-hint">
                  Steuerfreiheit abgewählt — es gelten die Post-2004-Regeln (Halbeinkünfteverfahren oder Abgeltungsteuer).
                </p>
              )}
            </>
          )}

          <div className="field-grid">
            <BeitragsdynamikField
              rate={ins.annualContributionGrowthRate}
              onChangeRate={(rate) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    annualContributionGrowthRate: rate,
                  },
                }))
              }
              activeHint={
                <>
                  Beitrag steigt jedes Jahr um diesen Prozentsatz. Wirkt sich auch
                  auf Abschlusskosten aus (Beitragssumme wächst).
                </>
              }
            />
          </div>

          <div className="subsection-heading">
            <h3>Kapitalgarantie</h3>
            <p>Modelliert eine vertragliche Mindestleistung bei Rentenbeginn. Kosten bleiben unveraendert im Kostenblock.</p>
          </div>

          <div className="field-grid">
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={ins.capitalGuarantee.enabled}
                onChange={(event) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: {
                      ...current.insurance,
                      capitalGuarantee: {
                        ...current.insurance.capitalGuarantee,
                        enabled: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Beitragsgarantie beruecksichtigen</span>
            </label>
            {ins.capitalGuarantee.enabled && (
              <NumberField
                label="Garantiertes Mindestkapital"
                value={ins.capitalGuarantee.floorPctOfContributions * 100}
                min={0}
                max={100}
                step={5}
                suffix="% der Beiträge"
                onChange={(value) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: {
                      ...current.insurance,
                      capitalGuarantee: {
                        ...current.insurance.capitalGuarantee,
                        floorPctOfContributions: Math.min(1, Math.max(0, Number(value) / 100)),
                      },
                    },
                  }))
                }
              />
            )}
          </div>

          {insuranceTaxMode === 'halbeinkuenfte' && (
            <>
              <NumberField
                label="Andere Renteneinkommen mtl. (pAV)"
                value={ins.monthlyOtherRetirementIncome}
                min={0}
                step={50}
                suffix="EUR mtl."
                onChange={(value) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: { ...current.insurance, monthlyOtherRetirementIncome: Number(value) },
                  }))
                }
              />
              {ins.monthlyOtherRetirementIncome > 0 && (
                <p className="field-hint">
                  Steuer(½ Ertrag + {formatCurrency(ins.monthlyOtherRetirementIncome, 0)}/Monat) −
                  Steuer({formatCurrency(ins.monthlyOtherRetirementIncome, 0)}/Monat).
                </p>
              )}
            </>
          )}

          <div className="subsection-heading">
            <h3>Beiträge ruhen lassen / Kündigung (pAV)</h3>
            <p>Modelliert das vorzeitige Ende der Beitragszahlung. Das Kapital wächst danach unter laufenden Kosten weiter bis zum Rentenbeginn. Die Kündigung ermittelt den geschätzten Rückkaufswert zum gewählten Alter.</p>
          </div>

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={ins.paidUpAge !== undefined}
              onChange={(event) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    paidUpAge: event.target.checked
                      ? Math.max(profile.age + 1, Math.min(profile.retirementAge - 1, profile.age + Math.floor((profile.retirementAge - profile.age) / 2)))
                      : undefined,
                  },
                }))
              }
            />
            <span>Beiträge ruhen lassen / Kündigung modellieren</span>
          </label>

          {ins.paidUpAge !== undefined && (
            <>
              <NumberField
                label="Beitragsfrei ab Alter"
                value={ins.paidUpAge}
                min={profile.age + 1}
                max={profile.retirementAge - 1}
                step={1}
                suffix="Jahre"
                onChange={(value) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: {
                      ...current.insurance,
                      paidUpAge: Math.max(profile.age + 1, Math.min(profile.retirementAge - 1, Number(value))),
                    },
                  }))
                }
              />
              <NumberField
                label="Stornoabzug bei Kündigung"
                value={ins.surrenderHaircutPct * 100}
                min={0}
                max={50}
                step={0.5}
                suffix="%"
                onChange={(value) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: {
                      ...current.insurance,
                      surrenderHaircutPct: Number(value) / 100,
                    },
                  }))
                }
              />
              <small className="field-hint">
                Rückkaufswert = Kapital bei Beitragsfreistellung × (1 − Stornoabschlag). Nach Beitragsfreistellung wachsen noch Mantel- und Fondsgebühren; keine Beitrags-, Fixkosten oder Abschlussgebühren mehr.
              </small>
            </>
          )}

          {(() => {
            const pu = insuranceProductResult?.paidUpScenario;
            if (!pu) return null;
            return (
              <div className="paid-up-summary">
                <h4>Beitragsfreistellung ab Alter {pu.paidUpAge}</h4>
                <table className="paid-up-table">
                  <tbody>
                    <tr>
                      <td>Kapital bei Beitragsfreistellung</td>
                      <td className="num">{formatCurrency(pu.capitalAtPaidUp, 0)}</td>
                    </tr>
                    <tr>
                      <td>Rückkaufswert (Kündigung jetzt)</td>
                      <td className="num">{formatCurrency(pu.surrenderValue, 0)}</td>
                    </tr>
                    <tr>
                      <td>Kosten bis Alter {pu.paidUpAge}</td>
                      <td className="num">{formatCurrency(pu.feesAtPaidUp, 0)}</td>
                    </tr>
                    <tr className="paid-up-separator">
                      <td colSpan={2}>Weiterlaufendes Kapital bis Rentenbeginn (beitragsfrei)</td>
                    </tr>
                    <tr>
                      <td>Kapital bei Rentenbeginn (beitragsfrei)</td>
                      <td className="num">{formatCurrency(pu.retirementCapital, 0)}</td>
                    </tr>
                    <tr>
                      <td>Brutto-Rente (beitragsfrei)</td>
                      <td className="num">{formatCurrency(pu.grossMonthlyPayout, 0)} / Monat</td>
                    </tr>
                    <tr>
                      <td>Netto-Rente (beitragsfrei)</td>
                      <td className="num">{formatCurrency(pu.netMonthlyPayout, 0)} / Monat</td>
                    </tr>
                    {pu.afterTaxLumpSum !== null && (
                      <tr>
                        <td>Kapitalwahl nach Steuer (beitragsfrei)</td>
                        <td className="num">{formatCurrency(pu.afterTaxLumpSum, 0)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="subsection-heading">
            <h3>Kosten der Rentenversicherung</h3>
            <p>Kosteneingabe direkt aus dem Produktinformationsblatt (Effektivkosten all-in) oder als Einzelposten.</p>
          </div>
          <FeeSection
            fees={ins.fees}
            onChangeFees={(fees: FeeModel) =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: { ...current.insurance, fees },
              }))
            }
            presets={PAV_FEE_PRESETS}
            riy={riy}
            feeInputMode={feeInputMode}
            setFeeInputMode={setFeeInputMode}
          />
        </div>
      </details>
    </>
  );
}
