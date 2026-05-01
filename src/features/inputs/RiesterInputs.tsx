import '../../ui/forms.css'
import type React from 'react'
import type {
  PersonalProfile,
  ProductResult,
  RiesterAssumptions,
  RiesterFundingResult,
  ScenarioAssumptions,
} from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  onSyncMonthlyContribution: (
    source: 'bav' | 'basisrente' | 'avd' | 'riester',
    value: number,
  ) => void
  profile: PersonalProfile
  riesterFunding: RiesterFundingResult
  riesterProductResult: ProductResult | undefined
}

export function RiesterInputs({
  assumptions,
  onAssumptionsChange,
  onSyncMonthlyContribution,
  riesterFunding,
  riesterProductResult,
}: Props) {
  const erweitertParts: string[] = []
  if (assumptions.riester.eligibility.careerStarterBonusUsed) erweitertParts.push('Berufseinsteiger-Bonus erhalten')
  if (assumptions.riester.partialCapitalPct > 0) erweitertParts.push(`${(assumptions.riester.partialCapitalPct * 100).toFixed(0)} % Einmalbetrag`)
  if (assumptions.riester.monthlyOtherRetirementIncome > 0) erweitertParts.push(`+${formatCurrency(assumptions.riester.monthlyOtherRetirementIncome, 0)}/Mon. sonst. Einkommen`)
  if (assumptions.altersvorsorgedepot.riesterTransferCapital > 0) erweitertParts.push(`AVD-Übertrag: ${formatCurrency(assumptions.altersvorsorgedepot.riesterTransferCapital, 0)}`)
  if (erweitertParts.length === 0) erweitertParts.push('Standard-Annahmen')
  const erweitertSummary = erweitertParts.join(' · ')

  return (
    <>
      <div className="subsection-heading">
        <h3>Riester (Altvertrag)</h3>
        <p>
          Bestehender Riester-Altersvorsorgevertrag nach altem Recht.
          Keine Neuverträge ab 2027. Auszahlung vollständig steuerpflichtig.
          Bis zu 30 % des Kapitals als Einmalbetrag zu Rentenbeginn möglich.
        </p>
      </div>

      <div className="field-grid">
        <NumberField
          label="Eigenbeitrag (monatlich)"
          value={assumptions.riester.monthlyOwnContribution}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) => onSyncMonthlyContribution('riester', Number(value))}
        />
        <NumberField
          label="Vorhandenes Kapital"
          value={assumptions.riester.existingCapital}
          min={0}
          step={1000}
          suffix="EUR"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              riester: {
                ...current.riester,
                existingCapital: Math.max(0, Number(value)),
              },
            }))
          }
        />
      </div>

      <label className="field field-inline">
        <input
          type="checkbox"
          checked={assumptions.riester.eligibility.directlyEligible}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              riester: {
                ...current.riester,
                eligibility: {
                  ...current.riester.eligibility,
                  directlyEligible: event.target.checked,
                },
              },
            }))
          }
        />
        <span>Direkt förderberechtigt (Pflichtversichert)</span>
      </label>

      {riesterFunding.annualOwnContribution > 0 ? (
        <p className="field-hint">
          Grundzulage: <strong>{formatCurrency(riesterFunding.grundzulageAnnual, 0)}/Jahr</strong>
          {riesterFunding.childAllowanceAnnual > 0 && (
            <> · Kinderzulage: <strong>{formatCurrency(riesterFunding.childAllowanceAnnual, 0)}/Jahr</strong></>
          )}
          {riesterFunding.careerStarterBonusAnnual > 0 && (
            <> · Berufseinsteiger: <strong>+{formatCurrency(riesterFunding.careerStarterBonusAnnual, 0)}</strong></>
          )}
          {riesterFunding.guenstigerpruefungBenefitAnnual > 0 && (
            <> · Günstigerprüfung: <strong>+{formatCurrency(riesterFunding.guenstigerpruefungBenefitAnnual, 0)}/Jahr</strong></>
          )}
          {!riesterFunding.meetsMinContribution && (
            <> · <span className="field-warning">
              Eigenbeitrag unter Mindesteigenbeitrag ({formatCurrency(riesterFunding.minEigenbeitragAnnual, 0)}/Jahr) — Zulagen werden anteilig ({formatPercent(riesterFunding.prorationFactor, 0)}) gewährt.
            </span></>
          )}
          {' '}· Nettoaufwand: <strong>{formatCurrency(riesterFunding.monthlyNetCost, 0)}/Monat</strong>
          {riesterProductResult && (
            <> · Nettorente: <strong>{formatCurrency(riesterProductResult.netMonthlyPayout, 0)}/Monat</strong></>
          )}
        </p>
      ) : null}

      <label className="field">
        <span>Auszahlungsform</span>
        <select
          value={assumptions.riester.payoutMode}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              riester: {
                ...current.riester,
                payoutMode: event.target.value as RiesterAssumptions['payoutMode'],
              },
            }))
          }
        >
          <option value="leibrente">Lebenslange Leibrente</option>
          <option value="zeitrente">Zeitrente (Festlaufzeit)</option>
        </select>
      </label>

      {assumptions.riester.payoutMode === 'leibrente' && (
        <NumberField
          label="Rentenfaktor"
          value={assumptions.riester.rentenfaktor}
          min={1}
          max={60}
          step={0.5}
          suffix="EUR/10 000 EUR/Monat"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              riester: {
                ...current.riester,
                rentenfaktor: Math.max(1, Number(value)),
              },
            }))
          }
        />
      )}
      {assumptions.riester.payoutMode === 'zeitrente' && (
        <NumberField
          label="Laufzeit Zeitrente"
          value={assumptions.riester.zeitrenteYears}
          min={1}
          max={50}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              riester: {
                ...current.riester,
                zeitrenteYears: Math.max(1, Math.round(Number(value))),
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
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={assumptions.riester.eligibility.careerStarterBonusUsed}
              onChange={(event) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    eligibility: {
                      ...current.riester.eligibility,
                      careerStarterBonusUsed: event.target.checked,
                    },
                  },
                }))
              }
            />
            <span>Berufseinsteiger-Bonus bereits erhalten</span>
          </label>

          <NumberField
            label="Einmalbetrag bei Rentenbeginn"
            value={assumptions.riester.partialCapitalPct * 100}
            min={0}
            max={30}
            step={5}
            suffix="% des Kapitals"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                riester: {
                  ...current.riester,
                  partialCapitalPct: Math.min(0.3, Math.max(0, Number(value) / 100)),
                },
              }))
            }
          />

          <NumberField
            label="Andere Renteneinkommen mtl."
            value={assumptions.riester.monthlyOtherRetirementIncome}
            min={0}
            step={100}
            suffix="EUR mtl."
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                riester: {
                  ...current.riester,
                  monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                },
              }))
            }
          />

          <div className="subsection-heading" style={{ marginTop: 4 }}>
            <h3>Riester → Altersvorsorgedepot Übertrag</h3>
            <p>
              Vorhandenes Riester-Kapital in ein neues Altersvorsorgedepot übertragen (kein steuerpflichtiger
              Verkauf). Das AVD-Produkt startet mit diesem Kapital minus Übertragungskosten als Startguthaben.
              Übertragungskosten beim AVD separat eintragen.
            </p>
          </div>

          <NumberField
            label="Riester-Kapital für AVD-Übertrag"
            value={assumptions.altersvorsorgedepot.riesterTransferCapital}
            min={0}
            step={1000}
            suffix="EUR"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                altersvorsorgedepot: {
                  ...current.altersvorsorgedepot,
                  riesterTransferCapital: Math.max(0, Number(value)),
                },
              }))
            }
          />
        </div>
      </details>
    </>
  )
}
