import '../../ui/forms.css'
import '../../ui/fees.css'
import type React from 'react'
import type {
  BavDurchfuehrungsweg,
  BavFundingResult,
  BavLumpSumTaxMode,
  GermanRules,
  PayoutMode,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { BavWaterfall } from '../../ui/BavWaterfall'
import { formatCurrency, formatPercent } from '../../utils/format'
import { BAV_FEE_PRESETS } from '../../app/productPresentation'
import { careEmployeeRateForChildren } from '../../engine/salary'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
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
          label="bAV Entgeltumwandlung"
          value={assumptions.bav.monthlyGrossConversion}
          min={0}
          step={25}
          suffix="EUR mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, monthlyGrossConversion: Number(value) },
            }))
          }
        />
        <NumberField
          label="Vertraglicher AG-Zuschuss"
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
          label="Vertraglicher AG-Festbetrag"
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
        <span>Gesetzlicher AG-Pflichtzuschuss (§1a Abs. 1a BetrAVG)</span>
      </label>
      <p className="field-hint">
        Effektiver AG-Beitrag:{' '}
        {formatCurrency(bavFunding.monthlyEffectiveEmployerContribution, 0)}/Monat
        {' '}(gesetzlich {formatCurrency(bavFunding.monthlyStatutoryEmployerSubsidy, 0)}
        {' '}+ vertraglich {formatCurrency(bavFunding.monthlyContractualEmployerContribution, 0)}).
      </p>

      {assumptions.bav.monthlyGrossConversion > 0 &&
        assumptions.bav.monthlyGrossConversion * 12 < bavMinAnnual && (
          <p className="field-warning">
            Unterschreitet das gesetzliche Minimum von {formatCurrency(bavMinAnnual, 2)}/Jahr
            für den §1a-BetrAVG-Anspruch.
          </p>
        )}
      {assumptions.bav.monthlyGrossConversion > bavEntitlementMax && (
        <p className="field-warning">
          Überschreitet den gesetzlichen Entgeltumwandlungsanspruch (
          {formatCurrency(bavEntitlementMax, 0)}/Monat = 4 % der BBG nach §1a BetrAVG). Höhere
          Beträge erfordern Arbeitgebereinverständnis.
        </p>
      )}

      <BavWaterfall f={bavFunding} />

      <label className="field">
        <span>Auszahlungsform (bAV)</span>
        <select
          value={assumptions.bav.payoutMode}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, payoutMode: event.target.value as PayoutMode },
            }))
          }
        >
          <option value="leibrente">Lebenslange Rente (Leibrente)</option>
          <option value="zeitrente">Zeitrente (befristete Auszahlung)</option>
          <option value="kapitalverzehr">Selbstgesteuerte Entnahme (Kapitalverzehr)</option>
        </select>
        <small className="field-hint">
          {assumptions.bav.payoutMode === 'leibrente' && (
            <>Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.</>
          )}
          {assumptions.bav.payoutMode === 'zeitrente' && (
            <>Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.</>
          )}
          {assumptions.bav.payoutMode === 'kapitalverzehr' && (
            <>Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).</>
          )}
        </small>
      </label>
      {assumptions.bav.payoutMode === 'leibrente' && (
        <NumberField
          label="Rentenfaktor (bAV)"
          value={assumptions.bav.rentenfaktor}
          min={1}
          max={80}
          step={0.5}
          suffix="EUR/10k mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, rentenfaktor: Number(value) },
            }))
          }
        />
      )}
      {assumptions.bav.payoutMode === 'zeitrente' && (
        <NumberField
          label="Zeitrente-Dauer (bAV)"
          value={assumptions.bav.zeitrenteYears}
          min={1}
          max={50}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              bav: { ...current.bav, zeitrenteYears: Number(value) },
            }))
          }
        />
      )}

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
              Bei tarifgebundenem Arbeitsverhältnis kann die Entgeltumwandlung im Tarifvertrag
              eingeschränkt oder ausgeschlossen sein (§17 Abs. 3 BetrAVG / §20 BetrAVG).
            </p>
          )}

          <div className="subsection-heading">
            <h3>bAV-Rentenphase</h3>
            <p>Grenzsteuer- und GRV-Optionen für die Auszahlungsphase.</p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Sonst. Renteneinkommen"
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
                <span>Pflichtversicherter Rentner (KVdR)</span>
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
                      ? '(KVdR: Freibetrag 197,75 EUR · §226 SGB V)'
                      : '(freiwillig: volle Rente als Grundlage · §240 SGB V)'}
                  </p>
                )
              })()}
            </>
          )}

          <label className="field">
            <span>bAV-Vertragsart (Durchführungsweg)</span>
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
              <option value="direktversicherung_3_63">Direktversicherung (§3 Nr. 63 EStG, ab 2005)</option>
              <option value="pensionskasse_3_63">Pensionskasse (§3 Nr. 63 EStG)</option>
              <option value="pensionsfonds_3_63">Pensionsfonds (§3 Nr. 63 EStG)</option>
              <option value="direktversicherung_40b_alt">Direktversicherung (§40b EStG a.F., vor 2005)</option>
              <option value="direktzusage">Direktzusage (§19 EStG)</option>
              <option value="unterstuetzungskasse">Unterstützungskasse (§19 EStG)</option>
            </select>
            <small className="field-hint">
              {bavLumpSumTaxMode === 'voll_versorgungsbezug' && (
                <>Kapitalabfindung: voller Steuersatz nach §22 Nr. 5 EStG (keine Fünftelregelung).</>
              )}
              {bavLumpSumTaxMode === 'fuenftelregelung' && (
                <>Kapitalabfindung: Fünftelregelung §34 Abs. 2 Nr. 4 EStG anwendbar.</>
              )}
              {bavLumpSumTaxMode === 'pre2005_steuerfrei' && (
                <>Kapitalabfindung: steuerfrei nach §52 Abs. 28 EStG a.F. KV/PV gilt weiterhin (§229 SGB V).</>
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
                <span>Altvertrag steuerfrei nach §52 Abs. 28 EStG a.F. (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre, Kapitalleistung)</span>
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
            <p>Benchmarkwerte: beitragsbezogene Kosten plus Kapital- und Abschlusskosten. Vorlagen setzen alle Felder.</p>
          </div>

          <div className="fee-presets">
            {BAV_FEE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-btn"
                onClick={() =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    bav: { ...current.bav, fees: preset.fees },
                  }))
                }
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="field-grid">
            <NumberField
              label="Fixkosten je Monat"
              value={assumptions.bav.fees.fixedMonthlyFee}
              min={0}
              max={50}
              step={0.5}
              suffix="EUR"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, fixedMonthlyFee: Number(value) },
                  },
                }))
              }
            />
            <NumberField
              label="Kosten je Beitrag"
              value={assumptions.bav.fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.25}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, contributionFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Mantelgebühr (Versicherer)"
              value={assumptions.bav.fees.wrapperAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, wrapperAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Fondskosten (TER)"
              value={assumptions.bav.fees.fundAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, fundAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Auszahlungsgebühr"
              value={assumptions.bav.fees.pensionPayoutFeePct * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="% je Rente"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, pensionPayoutFeePct: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Vertriebs-/Abschlusskosten"
              value={assumptions.bav.fees.acquisitionCostPct * 100}
              min={0}
              max={8}
              step={0.25}
              suffix="% Summe"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, acquisitionCostPct: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Verteilung Abschlusskosten"
              value={assumptions.bav.fees.acquisitionCostSpreadYears}
              min={1}
              max={15}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: {
                      ...current.bav.fees,
                      acquisitionCostSpreadYears: Number(value),
                    },
                  },
                }))
              }
            />
          </div>
          {(() => {
            const f = assumptions.bav.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                  (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
                </span>
                <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                </span>
                {f.contributionFee > 0.05 && (
                  <p className="field-warning">Beitragskostenquote {formatPercent(f.contributionFee)} liegt über 5 % — typische Nettotarife erheben keine Kosten je Beitrag.</p>
                )}
                {f.acquisitionCostPct > 0.025 && (
                  <p className="field-warning">Abschlusskosten {formatPercent(f.acquisitionCostPct)} übersteigen 2,5 % der Beitragssumme.</p>
                )}
                {totalAsset > 0.01 && (
                  <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 % — prüfen Sie ETF-basierte Nettotarife (typisch 0,5–0,8 % all-in).</p>
                )}
                {riy > 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — ETF-basierte Verträge über dieser Schwelle gelten i. d. R. als unwirtschaftlich.</p>
                )}
                {riy > 0.015 && riy <= 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} liegen im kritischen Bereich (1,5–2,0 %) — Nettotarife erzielen typisch 0,6–1,0 %.</p>
                )}
              </div>
            )
          })()}
        </div>
      </details>
    </>
  )
}
