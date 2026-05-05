import '../../ui/forms.css'
import '../../ui/fees.css'
import { useState } from 'react'
import type React from 'react'
import type {
  BavDurchfuehrungsweg,
  BavFundingResult,
  BavLumpSumTaxMode,
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { BavWaterfall } from '../../ui/BavWaterfall'
import { InfoTip } from '../../ui/InfoTip'
import { formatCurrency, formatPercent } from '../../utils/format'
import { BAV_FEE_PRESETS } from '../../app/productPresentation'
import { careEmployeeRateForChildren } from '../../engine/salary'
import { getTerm } from '../../content/terms'
import { PayoutModeSection } from './sections/PayoutModeSection'
import { OfferCapitalCompareField } from './sections/OfferCapitalCompareField'
import { BeitragsdynamikField } from './sections/BeitragsdynamikField'
import { FeeSection, type FeeInputMode } from './sections/FeeSection'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  onSyncMonthlyContribution: (targetNet: number) => void
  profile: PersonalProfile
  bavFunding: BavFundingResult
  selectedResults: ProductResult[]
  kvdrMember: boolean
  bavLumpSumTaxMode: BavLumpSumTaxMode
  tarifgebunden: boolean
  onTarifgebundenChange: (v: boolean) => void
  bavMinAnnual: number
  bavMinMonthly: number
  bavEntitlementMax: number
  rules: GermanRules
}

const DFW_SHORT: Record<BavDurchfuehrungsweg, string> = {
  direktversicherung_3_63: 'Direktversicherung',
  pensionskasse_3_63: 'Pensionskasse',
  pensionsfonds_3_63: 'Pensionsfonds',
  direktversicherung_40b_alt: 'Direktversicherung (Alt)',
  direktzusage: 'Direktzusage',
  unterstuetzungskasse: 'Unterstützungskasse',
}

export function BavInputs({
  assumptions,
  onAssumptionsChange,
  onSyncMonthlyContribution,
  profile,
  bavFunding,
  selectedResults,
  kvdrMember,
  bavLumpSumTaxMode,
  tarifgebunden,
  onTarifgebundenChange,
  bavMinAnnual,
  bavEntitlementMax,
  rules,
}: Props) {
  const bavProduct = selectedResults.find((r) => r.productId === 'bav')
  const riy = bavProduct?.accumulationRiy ?? 0
  const [feeInputMode, setFeeInputMode] = useState<FeeInputMode>('aufgeschluesselt')
  const [offerCapital, setOfferCapital] = useState<number | null>(null)
  const modelCapital = bavProduct?.capitalAtRetirement ?? 0
  const dfwShort = DFW_SHORT[assumptions.bav.durchfuehrungsweg]
  const kvdrShort = !profile.publicHealthInsurance
    ? 'PKV in Rente'
    : kvdrMember
    ? 'KVdR'
    : 'freiwillig GKV in Rente'
  const erweitertSummary = `${dfwShort} · ${kvdrShort}${riy > 0 ? ` · Kosten: ${formatPercent(riy)}` : ''}`

  return (
    <>
      <div className="field-grid">
        <NumberField
          label="Netto-Aufwand mtl."
          value={bavFunding.monthlyNetCost}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) => onSyncMonthlyContribution(Number(value))}
        />
        <NumberField
          label="AG-Zuschuss laut Vertrag (%)"
          feedbackTargetId="inputs.bav.employerSubsidy.label"
          value={assumptions.bav.contractualMatchPercent * 100}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: {
                ...current.bav,
                contractualMatchPercent: Math.max(0, Number(value) / 100),
              },
            }))
          }
        />
        <NumberField
          label="AG-Festbetrag laut Vertrag"
          value={assumptions.bav.contractualFixedMonthly}
          min={0}
          step={5}
          suffix="EUR mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, contractualFixedMonthly: Math.max(0, Number(value)) },
            }))
          }
        />
      </div>
      <label className="field field-inline">
        <input
          type="checkbox"
          checked={assumptions.bav.statutoryMinimumSubsidyEnabled}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, statutoryMinimumSubsidyEnabled: event.target.checked },
            }))
          }
        />
        <span>Gesetzlicher AG-Pflichtzuschuss (15 % Ihres Beitrags)</span>
      </label>
      <p className="field-hint">
        Effektiver AG-Beitrag:{' '}
        {formatCurrency(bavFunding.monthlyEmployerContribution, 0)}/Monat
        {' '}(gesetzlich {formatCurrency(bavFunding.monthlyStatutoryEmployerSubsidy, 0)}
        {' '}+ vertraglich {formatCurrency(bavFunding.monthlyContractualEmployerContribution, 0)}).
      </p>

      {assumptions.bav.monthlyGrossConversion > 0 &&
        assumptions.bav.monthlyGrossConversion * 12 < bavMinAnnual && (
          <p className="field-warning">
            Unterschreitet das gesetzliche Minimum von {formatCurrency(bavMinAnnual, 2)}/Jahr
            für den gesetzlichen Umwandlungsanspruch (§1a BetrAVG).
          </p>
        )}
      {assumptions.bav.monthlyGrossConversion > bavEntitlementMax && (
        <p className="field-warning">
          Überschreitet den gesetzlichen Entgeltumwandlungsanspruch (
          {formatCurrency(bavEntitlementMax, 0)}/Monat). Höhere Beträge erfordern
          Arbeitgebereinverständnis (§1a BetrAVG: 4 % der Beitragsbemessungsgrenze).
        </p>
      )}

      <BavWaterfall f={bavFunding} />

      <PayoutModeSection
        productLabel="bAV"
        payoutMode={assumptions.bav.payoutMode}
        onChangePayoutMode={(mode) =>
          onAssumptionsChange((current) => ({
            ...current,
            bav: { ...current.bav, payoutMode: mode },
          }))
        }
        rentenfaktor={assumptions.bav.rentenfaktor}
        onChangeRentenfaktor={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            bav: { ...current.bav, rentenfaktor: value },
          }))
        }
        rentenfaktorDefault={30}
        zeitrenteYears={assumptions.bav.zeitrenteYears}
        onChangeZeitrenteYears={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            bav: { ...current.bav, zeitrenteYears: value },
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
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={tarifgebunden}
              onChange={(event) => onTarifgebundenChange(event.target.checked)}
            />
            <span>Tarifvertrag im Arbeitsverhältnis</span>
          </label>
          {tarifgebunden && (
            <p className="field-warning">
              Bei Tarifvertrag kann die Entgeltumwandlung eingeschränkt oder ausgeschlossen sein — im Zweifel beim Arbeitgeber oder Betriebsrat nachfragen (BetrAVG §17 Abs. 3 / §20).
            </p>
          )}

          <div className="field-grid">
            <BeitragsdynamikField
              rate={assumptions.bav.annualContributionGrowthRate}
              onChangeRate={(rate) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: { ...current.bav, annualContributionGrowthRate: rate },
                }))
              }
              activeHint={
                <>
                  Entgeltumwandlung steigt jedes Jahr um diesen Prozentsatz. §3 Nr. 63
                  EStG / §1 SvEV-Cap und gesetzlicher AG-Zuschuss werden im Modell auf
                  Jahr 1 fixiert (Näherung).
                </>
              }
            />
          </div>

          <div className="subsection-heading">
            <h3>bAV-Rentenphase</h3>
            <p>Grenzsteuer- und GRV-Optionen für die Auszahlungsphase.</p>
          </div>
          <p className="field-hint">
            bAV-Renten profitieren in der Einkommensteuer vom Versorgungsfreibetrag
            <InfoTip text={getTerm('versorgungsfreibetrag')!.shortHelp} label="Versorgungsfreibetrag erklären" />
            {' '}— der Wert ist im Modell automatisch berücksichtigt.
          </p>

          <div className="field-grid">
            <NumberField
              label="Andere Renteneinkommen mtl."
              value={assumptions.bav.monthlyOtherRetirementIncome}
              min={0}
              step={50}
              suffix="EUR mtl."
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: { ...current.bav, monthlyOtherRetirementIncome: Number(value) },
                }))
              }
            />
          </div>
          {assumptions.bav.monthlyOtherRetirementIncome > 0 && (
            <p className="field-hint">
              Grenzsteuer auf bAV = Steuer(bAV + {formatCurrency(assumptions.bav.monthlyOtherRetirementIncome, 0)}/Monat) −
              Steuer({formatCurrency(assumptions.bav.monthlyOtherRetirementIncome, 0)}/Monat).
            </p>
          )}

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={assumptions.bav.includeGrvReduction}
              onChange={(event) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: { ...current.bav, includeGrvReduction: event.target.checked },
                }))
              }
            />
            <span>GRV-Minderung einrechnen</span>
          </label>
          {assumptions.bav.monthlyGrossConversion > 0 && (
            <p className="field-hint">
              Geschätzte Minderung:{' '}
              ~{formatCurrency(bavFunding.estimatedMonthlyGrvReduction, 0)}/Monat
              ({profile.retirementAge - profile.age} Jahre ×{' '}
              {formatCurrency(assumptions.bav.monthlyGrossConversion, 0)}/Monat,
              Rentenwert {formatCurrency(rules.socialSecurity.aktuellerRentenwert, 2)}/EP).
            </p>
          )}

          {profile.publicHealthInsurance && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={kvdrMember}
                  onChange={(event) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      bav: { ...current.bav, kvdrMember: event.target.checked },
                    }))
                  }
                />
                <span>
                  Pflichtversicherter Rentner (KVdR)
                  <InfoTip text={getTerm('kvdr')!.shortHelp} label="KVdR erklären" />
                </span>
              </label>
              {(() => {
                const grossPayout = bavProduct?.grossMonthlyPayout ?? 0
                if (grossPayout <= 0) return null
                const healthRate = rules.socialSecurity.healthGeneralRate + profile.healthAdditionalContributionPct / 100
                const threshold = rules.socialSecurity.kvFreibetragVersorgungMonthly
                const kvBase = kvdrMember ? Math.max(0, grossPayout - threshold) : grossPayout
                const kvMonthly = kvBase * healthRate
                const retirementYearForPv = rules.year + (profile.retirementAge - profile.age)
                const pvRate = careEmployeeRateForChildren(profile.childBirthYears, retirementYearForPv, rules) + rules.socialSecurity.careEmployerRate
                const pvMonthly = grossPayout > threshold ? grossPayout * pvRate : 0
                return (
                  <p className="field-hint">
                    Brutto-bAV-Rente: ~{formatCurrency(grossPayout, 0)}/Monat ·
                    KV-Basis: {formatCurrency(kvBase, 0)} · KV: {formatCurrency(kvMonthly, 0)} ·
                    PV: {formatCurrency(pvMonthly, 0)}{' '}
                    {kvdrMember
                      ? '(Pflichtversichert in Rente: Freibetrag 197,75 EUR auf bAV-Rente)'
                      : '(Freiwillig versichert: volle bAV-Rente als Beitragsgrundlage)'}
                  </p>
                )
              })()}
            </>
          )}

          <label className="field">
            <span>
              bAV-Vertragsart (Durchführungsweg)
              <InfoTip text={getTerm('durchfuehrungsweg')!.shortHelp} label="Durchführungsweg erklären" />
            </span>
            <select
              value={assumptions.bav.durchfuehrungsweg}
              onChange={(event) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    durchfuehrungsweg: event.target.value as BavDurchfuehrungsweg,
                  },
                }))
              }
            >
              <option value="direktversicherung_3_63">Direktversicherung (ab 2005)</option>
              <option value="pensionskasse_3_63">Pensionskasse</option>
              <option value="pensionsfonds_3_63">Pensionsfonds</option>
              <option value="direktversicherung_40b_alt">Direktversicherung Altvertrag (vor 2005)</option>
              <option value="direktzusage">Direktzusage</option>
              <option value="unterstuetzungskasse">Unterstützungskasse</option>
            </select>
            <small className="field-hint">
              {bavLumpSumTaxMode === 'voll_versorgungsbezug' && (
                <>Kapitalabfindung: voller persönlicher Steuersatz (keine Fünftelregelung). Rechtsgrundlage: §22 Nr. 5 EStG.</>
              )}
              {bavLumpSumTaxMode === 'fuenftelregelung' && (
                <>Kapitalabfindung: Fünftelregelung anwendbar — steuerliche Glättung der Einmalzahlung. Rechtsgrundlage: §34 Abs. 2 Nr. 4 EStG.</>
              )}
              {bavLumpSumTaxMode === 'pre2005_steuerfrei' && (
                <>Kapitalabfindung: steuerfrei (Altvertrag vor 2005, Mindestlaufzeit erfüllt). KV/PV gilt weiterhin (§229 SGB V).</>
              )}
            </small>
          </label>
          {assumptions.bav.durchfuehrungsweg === 'direktversicherung_40b_alt' && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={assumptions.bav.pre2005EligibleTaxFree}
                  onChange={(event) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      bav: { ...current.bav, pre2005EligibleTaxFree: event.target.checked },
                    }))
                  }
                />
                <span>Altvertrag steuerfrei (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre, Kapitalleistung)</span>
              </label>
              {!assumptions.bav.pre2005EligibleTaxFree && (
                <p className="field-hint">
                  Steuerfreiheit abgewählt — voller Steuersatz auf Kapitalabfindung.
                </p>
              )}
            </>
          )}

          <div className="divider" />

          <div className="subsection-heading">
            <h3>bAV-Kosten</h3>
            <p>Kosteneingabe direkt aus dem Produktinformationsblatt (Effektivkosten all-in) oder als Einzelposten.</p>
          </div>
          <FeeSection
            fees={assumptions.bav.fees}
            onChangeFees={(fees: FeeModel) =>
              onAssumptionsChange((current) => ({
                ...current,
                bav: { ...current.bav, fees },
              }))
            }
            presets={BAV_FEE_PRESETS}
            riy={riy}
            feeInputMode={feeInputMode}
            setFeeInputMode={setFeeInputMode}
          />
        </div>
      </details>
    </>
  )
}
