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
import { RangeNumberField } from '../../ui/RangeNumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { validateAvdPayoutAge } from '../../engine/altersvorsorgedepot'
import { avdMaxMonthlyOwn } from '../../utils/syncContributions'
import { buildAvdBeitragsstufen } from './avdBeitragsstufen'
import { useFeedbackTarget } from '../qa-feedback'
import './AvdContributionField.css'

/** Short recap labels for the "Erweitert" summary line. */
const SUBTYPE_SHORT_LABEL: Record<AltersvorsorgedepotSubtype, string> = {
  standarddepot: 'Standarddepot',
  depot_no_guarantee: 'Freies Depot',
  guarantee_80: '80 % Garantie',
  guarantee_100: '100 % Garantie',
}

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  onSyncMonthlyContribution: (targetNet: number) => void
  /**
   * Pins the AVD Eigenbeitrag. Optional so the QA-coverage harness and any
   * caller that has not adopted the mode yet keep compiling; when absent the
   * field falls back to writing the net anchor, i.e. today's behaviour.
   */
  onAvdOwnContributionChange?: (monthlyOwn: number) => void
  profile: PersonalProfile
  avdFunding: AltersvorsorgedepotFundingResult
  avdProductResult: ProductResult | undefined
  rules: GermanRules
}

export function AltersvorsorgedepotInputs({
  assumptions,
  onAssumptionsChange,
  onSyncMonthlyContribution,
  onAvdOwnContributionChange,
  profile,
  avdFunding,
  avdProductResult,
  rules,
}: Props) {
  const riy = avdProductResult?.accumulationRiy ?? 0
  const avd = assumptions.altersvorsorgedepot
  const { targetProps: subtypeProps } = useFeedbackTarget({
    id: 'inputs.avd.subtype',
    label: 'Produktvariante (AVD)',
    precision: 'exact',
  })
  const { targetProps: payoutModeProps } = useFeedbackTarget({
    id: 'inputs.avd.payoutMode',
    label: 'Auszahlungsform (AVD)',
    precision: 'exact',
  })
  // Ceiling and levels come from the same helpers the sync clamps with, so the
  // slider bound and the cappedAtContractMax warning can never disagree.
  const maxOwn = avdMaxMonthlyOwn(assumptions, rules)
  const beitragsstufen = buildAvdBeitragsstufen(rules, avd.eligibility)

  // Every figure below is read straight off `avdFunding`. The panel must not
  // re-derive allowances or the Guenstigerpruefung: the engine applies the
  // eligibility gates, the per-child cap and the profile-vs-eligibility child
  // resolution, and a second implementation here would drift from it.
  const ledgerRows: { key: string; value: string; positive?: boolean }[] = [
    {
      key: 'Eigenbeitrag',
      value: `${formatCurrency(avdFunding.monthlyOwnContribution, 2)} mtl.`,
    },
  ]
  if (avdFunding.basicAllowanceAnnual > 0) {
    ledgerRows.push({
      key: 'Grundzulage (Staat)',
      value: `+ ${formatCurrency(avdFunding.basicAllowanceAnnual, 0)}/Jahr`,
      positive: true,
    })
  }
  if (avdFunding.childAllowanceAnnual > 0) {
    ledgerRows.push({
      key: 'Kinderzulage',
      value: `+ ${formatCurrency(avdFunding.childAllowanceAnnual, 0)}/Jahr`,
      positive: true,
    })
  }
  if (avdFunding.careerStarterBonusAnnual > 0) {
    ledgerRows.push({
      key: 'Berufseinsteiger-Bonus',
      value: `+ ${formatCurrency(avdFunding.careerStarterBonusAnnual, 0)} einmalig`,
      positive: true,
    })
  }
  if (avdFunding.indirectSpouseAllowanceAnnual > 0) {
    ledgerRows.push({
      key: 'Zulage über Ehegatte',
      value: `+ ${formatCurrency(avdFunding.indirectSpouseAllowanceAnnual, 0)}/Jahr`,
      positive: true,
    })
  }
  if (avdFunding.guenstigerpruefungBenefitAnnual > 0) {
    ledgerRows.push({
      key: 'Steuervorteil (Günstigerprüfung)',
      value: `+ ${formatCurrency(avdFunding.guenstigerpruefungBenefitAnnual, 0)}/Jahr`,
      positive: true,
    })
  }
  if (avdFunding.totalAllowanceAnnual === 0 && avdFunding.annualOwnContribution > 0) {
    ledgerRows.push({
      key: 'Keine Zulage',
      value: `unter ${formatCurrency(rules.altersvorsorgedepot.minimumOwnContributionAnnual, 0)}/Jahr Eigenbeitrag`,
    })
  }

  const erweitertParts: string[] = []
  erweitertParts.push(SUBTYPE_SHORT_LABEL[avd.subtype])
  if (riy > 0) erweitertParts.push(`Kosten: ${formatPercent(riy)}`)
  if (avd.partialCapitalPct > 0) erweitertParts.push(`${(avd.partialCapitalPct * 100).toFixed(0)} % Teilkapital`)
  if (avd.monthlyOtherRetirementIncome > 0) erweitertParts.push(`+${formatCurrency(avd.monthlyOtherRetirementIncome, 0)}/Mon. sonst. Einkommen`)
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


      <div className="avd-contribution">
        <RangeNumberField
          label="Wie viel zahlst du selbst ein?"
          feedbackTargetId="inputs.avd.monthlyOwnContribution"
          value={avdFunding.monthlyOwnContribution}
          min={0}
          max={maxOwn}
          step={5}
          suffix="EUR mtl."
          choices={beitragsstufen.map((s) => ({
            value: s.value,
            label: s.label,
            hint: s.hint,
          }))}
          onCommit={(monthlyOwn) =>
            onAvdOwnContributionChange
              ? onAvdOwnContributionChange(monthlyOwn)
              : onSyncMonthlyContribution(monthlyOwn)
          }
        />

        <dl className="avd-ledger">
          {ledgerRows.map((row) => (
            <div className="avd-ledger__row" key={row.key}>
              <dt>{row.key}</dt>
              <dd className={row.positive ? 'avd-ledger__value avd-ledger__value--plus' : 'avd-ledger__value'}>
                {row.value}
              </dd>
            </div>
          ))}
          <div className="avd-ledger__row avd-ledger__row--total">
            <dt>Netto-Aufwand nach Steuer</dt>
            <dd className="avd-ledger__value">{formatCurrency(avdFunding.monthlyNetCost, 2)} mtl.</dd>
          </div>
        </dl>
        <p className="field-hint">
          Dieser Netto-Aufwand ist die Vergleichsbasis für <strong>alle</strong> Produkte —
          ETF, bAV, Basisrente und Riester rechnen mit demselben Betrag.
        </p>
      </div>

      <div className="field-grid">
        <NumberField
          label="Förderberechtigte Kinder"
          feedbackTargetId="inputs.avd.eligibleChildren"
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
      </div>

      <div className="field-grid">
        <NumberField
          label="Alter zu Beginn des ersten Beitragsjahres"
          feedbackTargetId="inputs.avd.ageAtContractStart"
          value={avd.eligibility.ageAtContractStart}
          min={0}
          max={100}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              altersvorsorgedepot: {
                ...current.altersvorsorgedepot,
                eligibility: {
                  ...current.altersvorsorgedepot.eligibility,
                  ageAtContractStart: Math.max(0, Math.round(Number(value))),
                },
              },
            }))
          }
        />
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
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={avd.eligibility.careerStarterBonusUsed}
            onChange={(event) =>
              onAssumptionsChange((current) => ({
                ...current,
                altersvorsorgedepot: {
                  ...current.altersvorsorgedepot,
                  eligibility: {
                    ...current.altersvorsorgedepot.eligibility,
                    careerStarterBonusUsed: event.target.checked,
                  },
                },
              }))
            }
          />
          <span>Berufseinsteiger-Bonus bereits erhalten</span>
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
          Eigenbeitrag: <strong>{formatCurrency(avdFunding.monthlyOwnContribution, 0)}/Monat</strong>
          {' '}· Grundzulage: <strong>{formatCurrency(avdFunding.basicAllowanceAnnual, 0)}/Jahr</strong>
          {avdFunding.childAllowanceAnnual > 0 && (
            <> · Kinderzulage: <strong>{formatCurrency(avdFunding.childAllowanceAnnual, 0)}/Jahr</strong></>
          )}
          {avdFunding.careerStarterBonusAnnual > 0 && (
            <> · Berufseinsteiger: <strong>+{formatCurrency(avdFunding.careerStarterBonusAnnual, 0)}</strong></>
          )}
          {avdFunding.guenstigerpruefungBenefitAnnual > 0 && (
            <> · Günstigerprüfung: <strong>+{formatCurrency(avdFunding.guenstigerpruefungBenefitAnnual, 0)}/Jahr</strong></>
          )}
          {avdProductResult && (
            <> · Nettorente: <strong>{formatCurrency(avdProductResult.netMonthlyPayout, 0)}/Monat</strong></>
          )}
        </p>
      ) : null}

      <label className="field" {...payoutModeProps}>
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
        </select>
      </label>

      {avd.payoutMode === 'lifelong_annuity' && (
        <NumberField
          label="Rentenfaktor"
          feedbackTargetId="inputs.avd.rentenfaktor"
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
          feedbackTargetId="inputs.avd.payoutPlanEndAge"
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
      <label className="field" {...subtypeProps}>
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
        {(avd.subtype === 'guarantee_80' || avd.subtype === 'guarantee_100') && (
          <small className="field-hint">
            Der Risiko-Check setzt ein Mindestkapital von{' '}
            {avd.subtype === 'guarantee_80' ? '80 %' : '100 %'} der Vertragszuflüsse an.
            Die eingetragenen Depot- und Fondskosten bleiben unverändert.
          </small>
        )}
      </label>

          <div className="field-grid">
            <NumberField
              label="Aktien-Anteil (vor Gleitpfad)"
              feedbackTargetId="inputs.avd.riskAllocationPct"
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
              feedbackTargetId="inputs.avd.lowRiskAnnualReturn"
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
            <NumberField
              label="Teilkapital bei Rentenbeginn"
              feedbackTargetId="inputs.avd.partialCapitalPct"
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
              feedbackTargetId="inputs.avd.transferCostEUR"
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
              feedbackTargetId="inputs.avd.otherRetirementIncome"
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
              feedbackTargetId="inputs.avd.fees.wrapperAssetFee"
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
              feedbackTargetId="inputs.avd.fees.fundAssetFee"
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
