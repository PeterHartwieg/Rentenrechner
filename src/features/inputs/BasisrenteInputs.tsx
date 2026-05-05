import '../../ui/forms.css'
import '../../ui/fees.css'
import type React from 'react'
import type { BasisrenteFundingResult, GermanRules, ProductResult, ScenarioAssumptions } from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { validateBasisrentePayoutAge } from '../../engine/basisrente'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  onSyncMonthlyContribution: (targetNet: number) => void
  basisrenteFunding: BasisrenteFundingResult
  basisrenteProductResult: ProductResult | undefined
  rules: GermanRules
  retirementAge: number
}

export function BasisrenteInputs({
  assumptions,
  onAssumptionsChange,
  onSyncMonthlyContribution,
  basisrenteFunding,
  basisrenteProductResult,
  retirementAge,
}: Props) {
  const riy = basisrenteProductResult?.accumulationRiy ?? 0
  const otherIncome = assumptions.basisrente.monthlyOtherRetirementIncome

  const erweitertParts: string[] = []
  if (riy > 0) erweitertParts.push(`Kosten: ${formatPercent(riy)}`)
  if (otherIncome > 0) erweitertParts.push(`+${formatCurrency(otherIncome, 0)}/Mon. sonst. Einkommen`)
  const erweitertSummary = erweitertParts.join(' · ')

  return (
    <>
      <div className="subsection-heading">
        <h3>Basisrente / Rürup</h3>
        <p>
          Steuergeförderte Altersvorsorge — strukturiert wie die gesetzliche Rente.
          Beiträge bis zum Höchstbetrag steuerlich absetzbar.
          Kein Kapitalwahlrecht — nur lebenslange Rente.
        </p>
        <p className="field-hint" style={{ marginTop: 4 }}>
          ⚠ Kapital nicht abrufbar vor Rentenbeginn, nicht beleihbar, nicht vererbbar
          (außer Hinterbliebene). Auszahlung frühestens ab Alter 62 möglich.
        </p>
        {(() => {
          const warning = validateBasisrentePayoutAge(retirementAge)
          return warning ? (
            <p className="field-warning" style={{ marginTop: 4 }}>{warning}</p>
          ) : null
        })()}
      </div>

      <div className="field-grid">
        <NumberField
          label="Netto-Aufwand mtl."
          feedbackTargetId="inputs.basisrente.monthlyNetCost"
          value={basisrenteFunding.monthlyNetCost}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) => onSyncMonthlyContribution(Number(value))}
        />

        <NumberField
          label="Garantierter Rentenfaktor"
          feedbackTargetId="inputs.basisrente.rentenfaktor"
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
      </div>

      {basisrenteFunding && basisrenteFunding.monthlyGrossContribution > 0 ? (
        <p className="field-hint">
          Brutto-Beitrag: <strong>{formatCurrency(basisrenteFunding.monthlyGrossContribution, 0)}/Monat</strong>
          {' '}· Steuerersparnis: <strong>{formatCurrency(basisrenteFunding.monthlyTaxSaving, 0)}/Monat</strong>
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
            label="Andere Renteneinkommen mtl."
            feedbackTargetId="inputs.basisrente.otherRetirementIncome"
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

          <p className="field-hint" style={{ marginTop: 0 }}>
            KV/PV-Status in der Rente wird zentral unter „Gesetzliche Rente" eingestellt
            (gilt auch für AVD und Riester). Pflichtversichert (KVdR): kein KV/PV auf Basisrente.
            Freiwillig versichert: Beitrag auf alle Einkünfte bis zur Beitragsbemessungsgrenze.
          </p>

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
