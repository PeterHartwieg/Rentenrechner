import '../../ui/forms.css'
import '../../ui/fees.css'
import type React from 'react'
import type { BasisrenteFundingResult, GermanRules, ProductResult, ScenarioAssumptions } from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  basisrenteFunding: BasisrenteFundingResult
  basisrenteProductResult: ProductResult | undefined
  rules: GermanRules
}

export function BasisrenteInputs({
  assumptions,
  onAssumptionsChange,
  basisrenteFunding,
  basisrenteProductResult,
}: Props) {
  const riy = basisrenteProductResult?.accumulationRiy ?? 0
  const otherIncome = assumptions.basisrente.monthlyOtherRetirementIncome
  const erweitertParts: string[] = []
  if (riy > 0) erweitertParts.push(`Kosten: ${formatPercent(riy)}`)
  if (otherIncome > 0) erweitertParts.push(`+${formatCurrency(otherIncome, 0)}/Mon. sonst. Einkommen`)
  if (erweitertParts.length === 0) erweitertParts.push('Standard-Kosten')
  const erweitertSummary = erweitertParts.join(' · ')

  return (
    <>
      <div className="subsection-heading">
        <h3>Basisrente / Rürup (Schicht 1)</h3>
        <p>
          Steuergeförderte Altersvorsorge nach §10 Abs. 1 Nr. 2 EStG. Beiträge bis zum
          Schicht-1-Höchstbetrag steuerlich absetzbar. Kein Kapitalwahlrecht —
          nur lebenslange Rente oder Zeitrente.
        </p>
        <p className="field-hint" style={{ marginTop: 4 }}>
          ⚠ Nicht beleihbar, nicht veräußerlich, keine vorzeitige Auszahlung möglich.
          Kapital steht frühestens ab Alter 62 zur Verrentung zur Verfügung.
        </p>
      </div>

      <div className="field-grid">
        <NumberField
          label="Monatlicher Beitrag (brutto)"
          value={assumptions.basisrente.monthlyGrossContribution}
          min={0}
          step={25}
          suffix="EUR mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              basisrente: { ...current.basisrente, monthlyGrossContribution: Math.max(0, Number(value)) },
            }))
          }
        />

        <label className="field">
          <span>Auszahlungsform</span>
          <select
            value={assumptions.basisrente.payoutMode}
            onChange={(e) =>
              onAssumptionsChange((current) => ({
                ...current,
                basisrente: {
                  ...current.basisrente,
                  payoutMode: e.target.value as 'leibrente' | 'zeitrente',
                },
              }))
            }
          >
            <option value="leibrente">Leibrente (lebenslang)</option>
            <option value="zeitrente">Zeitrente (befristet)</option>
          </select>
        </label>

        {assumptions.basisrente.payoutMode === 'leibrente' && (
          <NumberField
            label="Rentenfaktor"
            value={assumptions.basisrente.rentenfaktor}
            min={0}
            max={100}
            step={0.5}
            suffix="EUR/10k"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                basisrente: { ...current.basisrente, rentenfaktor: Math.max(0, Number(value)) },
              }))
            }
          />
        )}

        {assumptions.basisrente.payoutMode === 'zeitrente' && (
          <NumberField
            label="Zeitrente-Dauer"
            value={assumptions.basisrente.zeitrenteYears}
            min={1}
            max={40}
            step={1}
            suffix="Jahre"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                basisrente: {
                  ...current.basisrente,
                  zeitrenteYears: Math.max(1, Math.round(Number(value))),
                },
              }))
            }
          />
        )}
      </div>

      {basisrenteFunding && basisrenteFunding.monthlyGrossContribution > 0 ? (
        <p className="field-hint">
          Steuerersparnis: <strong>{formatCurrency(basisrenteFunding.monthlyTaxSaving, 0)}/Monat</strong>
          {' '}· Nettoaufwand: <strong>{formatCurrency(basisrenteFunding.monthlyNetCost, 0)}/Monat</strong>
          {' '}· Schicht-1-Rest: <strong>{formatCurrency(basisrenteFunding.remainingSchicht1Cap, 0)}</strong> EUR/Jahr
          {' '}(Pflichtvorsorge: {formatCurrency(basisrenteFunding.annualPensionContributionsTowardsCap, 0)} EUR/Jahr)
          {basisrenteFunding.annualDeductible < basisrenteFunding.annualGrossContribution && (
            <> · <span className="riy-warn">Nur {formatCurrency(basisrenteFunding.annualDeductible, 0)} EUR/Jahr absetzbar — Cap ausgeschöpft</span></>
          )}
          {basisrenteProductResult && <> · Nettorente: <strong>{formatCurrency(basisrenteProductResult.netMonthlyPayout, 0)}/Monat</strong></>}
        </p>
      ) : null}

      <details className="erweitert-section">
        <summary>
          <span className="erweitert-toggle">Erweitert</span>
          <span className="erweitert-assumption">{erweitertSummary}</span>
        </summary>
        <div className="erweitert-content">
          <NumberField
            label="Sonstige Renteneinnahmen"
            value={otherIncome}
            min={0}
            step={50}
            suffix="EUR mtl."
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                basisrente: {
                  ...current.basisrente,
                  monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                },
              }))
            }
          />

          <div className="subsection-heading" style={{ marginTop: 4 }}>
            <h3>Basisrente-Kosten</h3>
          </div>

          <div className="field-grid">
            <NumberField
              label="Mantelgebühr p.a."
              value={assumptions.basisrente.fees.wrapperAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, wrapperAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Fondsgebühr p.a."
              value={assumptions.basisrente.fees.fundAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, fundAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Beitragskostenquote"
              value={assumptions.basisrente.fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.5}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, contributionFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Monatliche Grundgebühr"
              value={assumptions.basisrente.fees.fixedMonthlyFee}
              min={0}
              step={1}
              suffix="EUR"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, fixedMonthlyFee: Math.max(0, Number(value)) },
                  },
                }))
              }
            />
            <NumberField
              label="Abschlusskosten"
              value={assumptions.basisrente.fees.acquisitionCostPct * 100}
              min={0}
              max={10}
              step={0.1}
              suffix="% Beitragssumme"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, acquisitionCostPct: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
          </div>
          {(() => {
            const f = assumptions.basisrente.fees
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
                {totalAsset > 0.01 && (
                  <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 %.</p>
                )}
                {riy > 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — prüfen Sie ETF-Nettotarife.</p>
                )}
              </div>
            )
          })()}
        </div>
      </details>
    </>
  )
}
