import '../../ui/forms.css'
import '../../ui/fees.css'
import type React from 'react'
import type {
  AltersvorsorgedepotFundingResult,
  AltersvorsorgedepotPayoutMode,
  AltersvorsorgedepotSubtype,
  GermanRules,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { validateAvdPayoutAge } from '../../engine/altersvorsorgedepot'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  onSyncMonthlyContribution: (
    source: 'bav' | 'basisrente' | 'avd' | 'riester',
    value: number,
  ) => void
  profile: PersonalProfile
  avdFunding: AltersvorsorgedepotFundingResult
  avdProductResult: ProductResult | undefined
  rules: GermanRules
}

export function AltersvorsorgedepotInputs({
  assumptions,
  onAssumptionsChange,
  onSyncMonthlyContribution,
  profile,
  avdFunding,
  avdProductResult,
  rules,
}: Props) {
  const riy = avdProductResult?.accumulationRiy ?? 0
  const avd = assumptions.altersvorsorgedepot
  const erweitertParts: string[] = []
  if (riy > 0) erweitertParts.push(`Kosten: ${formatPercent(riy)}`)
  if (avd.partialCapitalPct > 0) erweitertParts.push(`${(avd.partialCapitalPct * 100).toFixed(0)} % Teilkapital`)
  if (avd.monthlyOtherRetirementIncome > 0) erweitertParts.push(`+${formatCurrency(avd.monthlyOtherRetirementIncome, 0)}/Mon. sonst. Einkommen`)
  if (erweitertParts.length === 0) erweitertParts.push('Standard-Kosten')
  const erweitertSummary = erweitertParts.join(' · ')

  return (
    <>
      <div className="subsection-heading">
        <h3>Altersvorsorgedepot (ab 2027)</h3>
        <p>
          Neues gefördertes Altersvorsorgeprodukt nach dem Altersvorsorgereformgesetz
          (Bundestag 2026-03-27). Staatliche Zulage und Steuer-vs.-Zulage-Vergleich möglich.
          Kapital gesperrt bis Rentenbeginn (Alter 65–70).
        </p>
        {validateAvdPayoutAge(profile.retirementAge, rules) && (
          <p className="field-warning">
            {validateAvdPayoutAge(profile.retirementAge, rules)}
          </p>
        )}
      </div>

      <label className="field">
        <span>Produktvariante</span>
        <select
          value={avd.subtype}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                subtype: event.target.value as AltersvorsorgedepotSubtype,
              },
            }))
          }
        >
          <option value="standarddepot">Standarddepot (Gleitpfad, max. 1,0 % Effektivkosten)</option>
          <option value="depot_no_guarantee">Freies Depot ohne Garantie</option>
          <option value="guarantee_80">80%-Garantieprodukt</option>
          <option value="guarantee_100">100%-Garantieprodukt</option>
        </select>
      </label>

      <div className="field-grid">
        <NumberField
          label="Eigenbeitrag (monatlich)"
          value={avd.monthlyOwnContribution}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) => onSyncMonthlyContribution('avd', Number(value))}
        />
        <NumberField
          label="Förderberechtigte Kinder"
          value={avd.eligibility.eligibleChildren}
          min={0}
          max={10}
          step={1}
          suffix="Kinder"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                eligibility: {
                  ...current.altersvorsorgedepot.eligibility,
                  eligibleChildren: Math.max(0, Math.round(Number(value))),
                },
              },
            }))
          }
        />
        <NumberField
          label="Aktien-Anteil (vor Gleitpfad)"
          value={avd.riskAllocationPct * 100}
          min={0}
          max={100}
          step={5}
          suffix="%"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                riskAllocationPct: Math.min(1, Math.max(0, Number(value) / 100)),
              },
            }))
          }
        />
        <NumberField
          label="Rendite Sicherheits-Anlageteil p.a."
          value={avd.lowRiskAnnualReturn * 100}
          min={-10}
          max={20}
          step={0.1}
          suffix="%"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                lowRiskAnnualReturn: Number(value) / 100,
              },
            }))
          }
        />
      </div>

      <div className="field-grid">
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={avd.eligibility.directlyEligible}
            onChange={(event) =>
              onAssumptionsChange((current) => ({
                ...current,
                altersvorsorgedepot: {
                  ...current.altersvorsorgedepot,
                  eligibility: {
                    ...current.altersvorsorgedepot.eligibility,
                    directlyEligible: event.target.checked,
                  },
                },
              }))
            }
          />
          <span>Direkt förderberechtigt (Pflichtversichert)</span>
        </label>
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={avd.eligibility.indirectSpouseEligible}
            onChange={(event) =>
              onAssumptionsChange((current) => ({
                ...current,
                altersvorsorgedepot: {
                  ...current.altersvorsorgedepot,
                  eligibility: {
                    ...current.altersvorsorgedepot.eligibility,
                    indirectSpouseEligible: event.target.checked,
                  },
                },
              }))
            }
          />
          <span>Mittelbar berechtigt (über Ehegatte)</span>
        </label>
      </div>

      {avdFunding.cappedAtContractMax && (
        <p className="field-warning">
          AltZertG-Vertragsobergrenze erreicht: max.{' '}
          {formatCurrency(rules.altersvorsorgedepot.contractContributionCapAnnual, 0)}/Jahr
          (Eigenbeitrag + Zulagen). Höhere Eigenbeiträge fließen nicht mehr ins Depot
          (§1 AltZertG / Altersvorsorgereformgesetz). Andere Produkte können den Mehrbetrag investieren.
        </p>
      )}

      {avdFunding.annualOwnContribution > 0 ? (
        <p className="field-hint">
          Grundzulage: <strong>{formatCurrency(avdFunding.basicAllowanceAnnual, 0)}/Jahr</strong>
          {avdFunding.childAllowanceAnnual > 0 && (
            <> · Kinderzulage: <strong>{formatCurrency(avdFunding.childAllowanceAnnual, 0)}/Jahr</strong></>
          )}
          {avdFunding.careerStarterBonusAnnual > 0 && (
            <> · Berufseinsteiger: <strong>+{formatCurrency(avdFunding.careerStarterBonusAnnual, 0)}</strong></>
          )}
          {avdFunding.guenstigerpruefungBenefitAnnual > 0 && (
            <> · Günstigerprüfung: <strong>+{formatCurrency(avdFunding.guenstigerpruefungBenefitAnnual, 0)}/Jahr</strong></>
          )}
          {' '}· Nettoaufwand: <strong>{formatCurrency(avdFunding.monthlyNetCost, 0)}/Monat</strong>
          {avdProductResult && (
            <> · Nettorente: <strong>{formatCurrency(avdProductResult.netMonthlyPayout, 0)}/Monat</strong></>
          )}
        </p>
      ) : null}

      <label className="field">
        <span>Auszahlungsform</span>
        <select
          value={avd.payoutMode}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                payoutMode: event.target.value as AltersvorsorgedepotPayoutMode,
              },
            }))
          }
        >
          <option value="certified_payout_plan">Entnahmeplan bis mind. Alter 85</option>
          <option value="lifelong_annuity">Lebenslange Leibrente</option>
          <option value="hybrid_80_annuity">80 % Leibrente + 20 % variabler Anteil</option>
        </select>
      </label>

      {avd.payoutMode === 'lifelong_annuity' && (
        <NumberField
          label="Rentenfaktor"
          value={avd.rentenfaktor}
          min={0}
          max={100}
          step={0.5}
          suffix="EUR/10k"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                rentenfaktor: Math.max(0, Number(value)),
              },
            }))
          }
        />
      )}

      {avd.payoutMode !== 'lifelong_annuity' && (
        <NumberField
          label="Entnahmeplan bis Alter"
          value={avd.payoutPlanEndAge}
          min={85}
          max={110}
          step={1}
          suffix="Jahre"
          onCommit={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                payoutPlanEndAge: Math.max(85, Math.round(Number(value))),
              },
            }))
          }
        />
      )}

      <details className="erweitert-section">
        <summary>
          <span className="erweitert-toggle">Erweitert</span>
          <span className="erweitert-assumption">{erweitertSummary}</span>
        </summary>
        <div className="erweitert-content">
          <div className="field-grid">
            <NumberField
              label="Teilkapital bei Rentenbeginn"
              value={avd.partialCapitalPct * 100}
              min={0}
              max={30}
              step={5}
              suffix="% (max. 30 %)"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    partialCapitalPct: Math.min(0.30, Math.max(0, Number(value) / 100)),
                  },
                }))
              }
            />
            <NumberField
              label="Übertragungs­kosten"
              value={avd.transferCostEUR}
              min={0}
              max={300}
              step={50}
              suffix="EUR einmalig"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    transferCostEUR: Math.max(0, Number(value)),
                  },
                }))
              }
            />
            <NumberField
              label="Andere Renteneinkommen mtl."
              value={avd.monthlyOtherRetirementIncome}
              min={0}
              step={50}
              suffix="EUR mtl."
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          </div>

          <div className="subsection-heading" style={{ marginTop: 4 }}>
            <h3>Altersvorsorgedepot-Kosten</h3>
          </div>

          <div className="field-grid">
            <NumberField
              label="Verwaltungsgebühr p.a."
              value={avd.fees.wrapperAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    fees: { ...current.altersvorsorgedepot.fees, wrapperAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Fondsgebühr p.a."
              value={avd.fees.fundAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    fees: { ...current.altersvorsorgedepot.fees, fundAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
          </div>
          {(() => {
            const f = avd.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            const isStandarddepot = avd.subtype === 'standarddepot'
            const overCap = isStandarddepot && riy > rules.altersvorsorgedepot.standarddepotEffektivkostenCap
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                </span>
                <span className={riy > 0.02 ? 'riy-high' : overCap ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                  {isStandarddepot && <> (Standarddepot-Cap: 1,0 %)</>}
                </span>
                {overCap && (
                  <p className="field-warning">
                    Effektivkosten {formatPercent(riy)} überschreiten die Standarddepot-Obergrenze von 1,0 % — das Produkt wäre nicht zertifizierungsfähig.
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      </details>
    </>
  )
}
