import type React from 'react'
import type {
  AltersvorsorgedepotFundingResult,
  AltersvorsorgedepotPayoutMode,
  AltersvorsorgedepotSubtype,
  GermanRules,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain/types'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { validateAvdPayoutAge } from '../../engine/altersvorsorgedepot'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  profile: PersonalProfile
  avdFunding: AltersvorsorgedepotFundingResult
  avdProductResult: ProductResult | undefined
  rules: GermanRules
}

export function AltersvorsorgedepotInputs({
  assumptions,
  onAssumptionsChange,
  profile,
  avdFunding,
  avdProductResult,
  rules,
}: Props) {
  return (
    <>
      <div className="subsection-heading">
        <h3>Altersvorsorgedepot (Schicht 2, 2027)</h3>
        <p>
          Neues zertifiziertes Altersvorsorgeprodukt nach dem Altersvorsorgereformgesetz
          (Bundestag 2026-03-27). Staatliche Zulage + §10a Günstigerprüfung. Kapital
          gesperrt bis Rentenbeginn (Alter 65–70).
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
          value={assumptions.altersvorsorgedepot.subtype}
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
          value={assumptions.altersvorsorgedepot.monthlyOwnContribution}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                monthlyOwnContribution: Math.max(0, Number(value)),
              },
            }))
          }
        />
        <NumberField
          label="Förderberechtigte Kinder"
          value={assumptions.altersvorsorgedepot.eligibility.eligibleChildren}
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
          label="Risikoanteil (vor Gleitpfad)"
          value={assumptions.altersvorsorgedepot.riskAllocationPct * 100}
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
          label="Rendite Sicherheitsanlage p.a."
          value={assumptions.altersvorsorgedepot.lowRiskAnnualReturn * 100}
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
            checked={assumptions.altersvorsorgedepot.eligibility.directlyEligible}
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
          <span>Unmittelbar förderberechtigt</span>
        </label>
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={assumptions.altersvorsorgedepot.eligibility.indirectSpouseEligible}
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
          <span>Mittelbar (Ehegatte)</span>
        </label>
      </div>

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
          value={assumptions.altersvorsorgedepot.payoutMode}
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

      {assumptions.altersvorsorgedepot.payoutMode === 'lifelong_annuity' && (
        <NumberField
          label="Rentenfaktor"
          value={assumptions.altersvorsorgedepot.rentenfaktor}
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

      {assumptions.altersvorsorgedepot.payoutMode !== 'lifelong_annuity' && (
        <NumberField
          label="Entnahmeplan bis Alter"
          value={assumptions.altersvorsorgedepot.payoutPlanEndAge}
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

      <div className="field-grid">
        <NumberField
          label="Teilkapital bei Rentenbeginn"
          value={assumptions.altersvorsorgedepot.partialCapitalPct * 100}
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
          value={assumptions.altersvorsorgedepot.transferCostEUR}
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
          label="Sonstige Renteneinnahmen"
          value={assumptions.altersvorsorgedepot.monthlyOtherRetirementIncome}
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

      <div className="subsection-heading" style={{ marginTop: 12 }}>
        <h3>Altersvorsorgedepot-Kosten</h3>
      </div>

      <div className="field-grid">
        <NumberField
          label="Verwaltungsgebühr p.a."
          value={assumptions.altersvorsorgedepot.fees.wrapperAssetFee * 100}
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
          value={assumptions.altersvorsorgedepot.fees.fundAssetFee * 100}
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
        const f = assumptions.altersvorsorgedepot.fees
        const totalAsset = f.wrapperAssetFee + f.fundAssetFee
        const riy = avdProductResult?.accumulationRiy ?? 0
        const isStandarddepot = assumptions.altersvorsorgedepot.subtype === 'standarddepot'
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
    </>
  )
}
