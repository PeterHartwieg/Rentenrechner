import '../../ui/forms.css'
import '../../ui/fees.css'
import './InsuranceInputs.css'
import { useState } from 'react'
import type React from 'react'
import type {
  GermanRules,
  InsuranceProductResult,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
  ScenarioAssumptions,
} from '../../domain';
import { NumberField } from '../../ui/NumberField';
import { InfoTip } from '../../ui/InfoTip';
import { formatCurrency, formatPercent } from '../../utils/format';
import { PAV_FEE_PRESETS } from '../../app/productPresentation';
import { getTerm } from '../../content/terms';

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
  const [feeInputMode, setFeeInputMode] = useState<'effektivkosten' | 'aufgeschluesselt'>('aufgeschluesselt')
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

      <label className="field">
        <span>Auszahlungsform (pAV)</span>
        <select
          value={ins.payoutMode}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: { ...current.insurance, payoutMode: event.target.value as PayoutMode },
            }))
          }
        >
          <option value="leibrente">Lebenslange Rente (Leibrente)</option>
          <option value="zeitrente">Zeitrente (befristete Auszahlung)</option>
          <option value="kapitalverzehr">Selbstgesteuerte Entnahme (Kapitalverzehr)</option>
        </select>
        <small className="field-hint">
          {ins.payoutMode === 'leibrente' && (
            <>Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.</>
          )}
          {ins.payoutMode === 'zeitrente' && (
            <>Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.</>
          )}
          {ins.payoutMode === 'kapitalverzehr' && (
            <>Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).</>
          )}
        </small>
      </label>

      {ins.payoutMode === 'leibrente' && (
        <>
          <NumberField
            label="Garantierter Rentenfaktor (pAV)"
            value={ins.rentenfaktor}
            min={1}
            max={80}
            step={0.5}
            suffix="EUR/10k mtl."
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: { ...current.insurance, rentenfaktor: Number(value) },
              }))
            }
          />
          {ins.rentenfaktor === 28 && (
            <p className="field-hint">
              Standardwert — für eine genaue Rentenberechnung den garantierten Rentenfaktor aus dem Angebot übernehmen (steht im PIB oder in der Beispielsrechnung).
            </p>
          )}
        </>
      )}

      {ins.payoutMode === 'zeitrente' && (
        <NumberField
          label="Zeitrente-Dauer (pAV)"
          value={ins.zeitrenteYears}
          min={1}
          max={50}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: { ...current.insurance, zeitrenteYears: Number(value) },
            }))
          }
        />
      )}

      {modelCapital > 0 && (
        <>
          <NumberField
            label="Kapital lt. Angebot bei Rentenbeginn (optional)"
            value={offerCapital ?? 0}
            min={0}
            step={1000}
            suffix="EUR"
            onChange={(value) => {
              const v = Number(value)
              setOfferCapital(v > 0 ? v : null)
            }}
          />
          {offerCapital !== null && offerCapital > 0 && (
            <p className="offer-capital-compare">
              Rechnerkapital (Basis-Szenario): {formatCurrency(modelCapital, 0)} ·{' '}
              Angebotskapital: {formatCurrency(offerCapital, 0)} ·{' '}
              Abweichung: {offerCapital >= modelCapital ? '+' : ''}
              {formatCurrency(offerCapital - modelCapital, 0)}{' '}
              ({(((offerCapital - modelCapital) / modelCapital) * 100).toFixed(1)} %)
            </p>
          )}
        </>
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
            <NumberField
              label="Beitragsdynamik p.a."
              value={ins.annualContributionGrowthRate * 100}
              min={0}
              max={10}
              step={0.1}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    annualContributionGrowthRate: Math.max(0, Number(value) / 100),
                  },
                }))
              }
            />
          </div>
          {ins.annualContributionGrowthRate > 0 && (
            <p className="field-hint">
              Beitrag steigt jedes Jahr um diesen Prozentsatz. Wirkt sich auch auf Abschlusskosten aus (Beitragssumme wächst).
            </p>
          )}

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
                suffix="% der Beitraege"
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
          <div className="fee-mode-tabs">
            <button
              type="button"
              className={`fee-mode-tab${feeInputMode === 'aufgeschluesselt' ? ' fee-mode-tab--active' : ''}`}
              onClick={() => setFeeInputMode('aufgeschluesselt')}
            >
              Einzelposten
            </button>
            <button
              type="button"
              className={`fee-mode-tab${feeInputMode === 'effektivkosten' ? ' fee-mode-tab--active' : ''}`}
              onClick={() => setFeeInputMode('effektivkosten')}
            >
              Effektivkosten (all-in)
            </button>
          </div>

          {feeInputMode === 'aufgeschluesselt' && (
            <>
              <div className="fee-presets">
                {PAV_FEE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="preset-btn"
                    onClick={() =>
                      onAssumptionsChange((current) => ({
                        ...current,
                        insurance: { ...current.insurance, fees: preset.fees },
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
                  value={ins.fees.fixedMonthlyFee}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix="EUR"
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, fixedMonthlyFee: Number(value) },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Kosten je Beitrag"
                  value={ins.fees.contributionFee * 100}
                  min={0}
                  max={20}
                  step={0.25}
                  suffix="%"
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, contributionFee: Number(value) / 100 },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Mantelgebühr (Versicherer)"
                  value={ins.fees.wrapperAssetFee * 100}
                  min={0}
                  max={3}
                  step={0.05}
                  suffix="% p.a."
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, wrapperAssetFee: Number(value) / 100 },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Fondskosten (TER)"
                  value={ins.fees.fundAssetFee * 100}
                  min={0}
                  max={3}
                  step={0.05}
                  suffix="% p.a."
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, fundAssetFee: Number(value) / 100 },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Auszahlungsgebühr"
                  value={ins.fees.pensionPayoutFeePct * 100}
                  min={0}
                  max={5}
                  step={0.05}
                  suffix="% je Rente"
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, pensionPayoutFeePct: Number(value) / 100 },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Vertriebs-/Abschlusskosten"
                  value={ins.fees.acquisitionCostPct * 100}
                  min={0}
                  max={8}
                  step={0.25}
                  suffix="% Summe"
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: { ...current.insurance.fees, acquisitionCostPct: Number(value) / 100 },
                      },
                    }))
                  }
                />
                <NumberField
                  label="Verteilung Abschlusskosten"
                  value={ins.fees.acquisitionCostSpreadYears}
                  min={1}
                  max={15}
                  step={1}
                  suffix="Jahre"
                  onChange={(value) =>
                    onAssumptionsChange((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        fees: {
                          ...current.insurance.fees,
                          acquisitionCostSpreadYears: Number(value),
                        },
                      },
                    }))
                  }
                />
              </div>
            </>
          )}

          {feeInputMode === 'effektivkosten' && (
            <>
              <NumberField
                label="Effektivkosten aus PIB/KID (Renditeminderung p.a.)"
                value={(ins.fees.wrapperAssetFee + ins.fees.fundAssetFee) * 100}
                min={0}
                max={5}
                step={0.05}
                suffix="% p.a."
                onChange={(value) =>
                  onAssumptionsChange((current) => ({
                    ...current,
                    insurance: {
                      ...current.insurance,
                      fees: {
                        wrapperAssetFee: Number(value) / 100,
                        fundAssetFee: 0,
                        contributionFee: 0,
                        fixedMonthlyFee: 0,
                        acquisitionCostPct: 0,
                        acquisitionCostSpreadYears: 5,
                        pensionPayoutFeePct: 0,
                      },
                    },
                  }))
                }
              />
              <p className="field-hint">
                Näherung: Die Effektivkosten aus dem PIB/KID werden als gleichmäßige jährliche Renditeminderung eingestellt. Abschluss- und beitragsbezogene Kosten sind darin bereits enthalten.{' '}
                <button type="button" className="link-btn" onClick={() => setFeeInputMode('aufgeschluesselt')}>
                  Auf Einzelposten wechseln
                </button>
              </p>
            </>
          )}

          {(() => {
            const f = ins.fees;
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee;
            return (
              <div className="fee-summary">
                {feeInputMode === 'aufgeschluesselt' && (
                  <span>
                    Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                    (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
                  </span>
                )}
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
            );
          })()}
        </div>
      </details>
    </>
  );
}
