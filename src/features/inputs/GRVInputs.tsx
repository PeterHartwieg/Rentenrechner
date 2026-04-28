import '../../ui/forms.css'
import type React from 'react'
import type { PensionBaselineType, ScenarioAssumptions, StatutoryPensionAssumptions } from '../../domain';
import { NumberField } from '../../ui/NumberField';
import { formatCurrency, formatNumber } from '../../utils/format';

type Props = {
  assumptions: ScenarioAssumptions;
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>;
  statutoryPensionResult: {
    projectedEntgeltpunkte: number;
    grossMonthlyPension: number;
    netMonthlyPension: number;
    taxMonthly: number;
    kvPvMonthly: number;
    grvReductionApplied: number;
  };
};

const BASELINE_LABELS: Record<PensionBaselineType, string> = {
  grv: 'Gesetzliche RV (GRV)',
  versorgungswerk: 'Berufsständ. Versorgungswerk',
  beamtenpension: 'Beamtenversorgung',
  none: 'Keine',
}

const SECTION_TITLES: Record<PensionBaselineType, string> = {
  grv: 'Gesetzliche Rentenversicherung (GRV)',
  versorgungswerk: 'Berufsständisches Versorgungswerk',
  beamtenpension: 'Beamtenversorgung',
  none: 'Kein Pflichtrentenversicherungssystem',
}

function patchSp(
  current: ScenarioAssumptions,
  patch: Partial<StatutoryPensionAssumptions>,
): ScenarioAssumptions {
  return { ...current, statutoryPension: { ...current.statutoryPension, ...patch } }
}

export function GRVInputs({ assumptions, onAssumptionsChange, statutoryPensionResult }: Props) {
  const sp = assumptions.statutoryPension
  const baselineType: PensionBaselineType = sp.pensionBaselineType ?? 'grv'
  const isManual = sp.manualMonthlyGross !== null
  const isEp = !isManual

  return (
    <>
      <div className="subsection-heading">
        <h3>{SECTION_TITLES[baselineType]}</h3>
        <p>
          {baselineType === 'grv' && 'Basisschutz aus der gesetzlichen Rente — geschätzt oder aus der Renteninformation.'}
          {baselineType === 'versorgungswerk' && 'Berufsständische Altersversorgung (z. B. Ärzte-, Anwalts-, Architektenversorgung) — ersetzt die GRV für kammerpflichtige Berufe.'}
          {baselineType === 'beamtenpension' && 'Versorgung nach Beamtenversorgungsgesetz — prozentual vom letzten Grundgehalt (Ruhegehaltssatz). Geben Sie den Betrag aus Ihrer Versorgungsauskunft ein.'}
          {baselineType === 'none' && 'Kein gesetzliches Pflichtversicherungssystem modelliert (z. B. dauerhaft befreite Selbstständige).'}
        </p>
      </div>

      {/* Pension baseline type selector */}
      <label className="field">
        <span>Pflichtversorgungssystem</span>
        <select
          value={baselineType}
          onChange={(event) => {
            const newType = event.target.value as PensionBaselineType
            onAssumptionsChange((current) =>
              patchSp(current, {
                pensionBaselineType: newType,
                // Force manual mode for Beamtenpension (no EP concept)
                manualMonthlyGross:
                  newType === 'beamtenpension'
                    ? (current.statutoryPension.manualMonthlyGross ?? 0)
                    : current.statutoryPension.manualMonthlyGross,
              }),
            )
          }}
        >
          {(Object.keys(BASELINE_LABELS) as PensionBaselineType[]).map((key) => (
            <option key={key} value={key}>{BASELINE_LABELS[key]}</option>
          ))}
        </select>
      </label>

      {baselineType === 'none' && (
        <p className="field-hint">Keine Basisrente eingerechnet — alle Altersvorsorge über die Produkte unten.</p>
      )}

      {baselineType !== 'none' && (
        <>
          {/* Input mode selector (EP vs manual) — not shown for Beamtenpension */}
          {baselineType !== 'beamtenpension' && (
            <label className="field">
              <span>Grundlage</span>
              <select
                value={isManual ? 'manual' : 'ep'}
                onChange={(event) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, {
                      manualMonthlyGross: event.target.value === 'manual' ? 0 : null,
                    }),
                  )
                }
              >
                <option value="ep">Schätzen (Entgeltpunkte)</option>
                <option value="manual">
                  {baselineType === 'versorgungswerk'
                    ? 'Aus Versorgungsauskunft (manuell)'
                    : 'Aus Renteninformation (manuell)'}
                </option>
              </select>
            </label>
          )}

          {/* Manual input */}
          {(isManual || baselineType === 'beamtenpension') && (
            <NumberField
              label={
                baselineType === 'beamtenpension'
                  ? 'Bruttopension (Versorgungsauskunft)'
                  : baselineType === 'versorgungswerk'
                  ? 'Progn. Bruttorente (Versorgungsauskunft)'
                  : 'Progn. Bruttorente (Renteninformation)'
              }
              value={sp.manualMonthlyGross ?? 0}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                onAssumptionsChange((current) =>
                  patchSp(current, { manualMonthlyGross: Math.max(0, Number(value)) }),
                )
              }
            />
          )}

          {/* EP-based inputs (GRV and Versorgungswerk only) */}
          {isEp && baselineType !== 'beamtenpension' && (
            <>
              <NumberField
                label={
                  baselineType === 'versorgungswerk'
                    ? 'Entgeltpunkte-Äquivalent bisher'
                    : 'Entgeltpunkte bisher (EP)'
                }
                value={sp.currentEntgeltpunkte}
                min={0}
                max={200}
                step={0.1}
                suffix="EP"
                onChange={(value) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, { currentEntgeltpunkte: Math.max(0, Number(value)) }),
                  )
                }
              />
              <NumberField
                label="Gehaltswachstum p.a."
                value={(sp.annualSalaryGrowthRate ?? 0) * 100}
                min={-10}
                max={20}
                step={0.5}
                suffix="% p.a."
                onChange={(value) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, { annualSalaryGrowthRate: Number(value) / 100 }),
                  )
                }
              />
              <p className="field-hint">
                EP bei Rentenbeginn: ~{formatNumber(statutoryPensionResult.projectedEntgeltpunkte, 1)} EP
                {' '}· Bruttorente: ~{formatCurrency(statutoryPensionResult.grossMonthlyPension, 0)}/Monat
              </p>
            </>
          )}

          {/* Pension value growth (all non-none types) */}
          <NumberField
            label={
              baselineType === 'beamtenpension'
                ? 'Pensionswert-Wachstum p.a.'
                : 'Rentenwert-Wachstum p.a.'
            }
            value={(sp.rentenwertGrowthRate ?? 0) * 100}
            min={-5}
            max={10}
            step={0.5}
            suffix="% p.a."
            onChange={(value) =>
              onAssumptionsChange((current) =>
                patchSp(current, { rentenwertGrowthRate: Number(value) / 100 }),
              )
            }
          />
          <p className="field-hint">
            {baselineType === 'beamtenpension'
              ? 'Jährliche Steigerung der Pension bis Rentenbeginn (Besoldungserhöhungen). Historisch ca. 2 % p.a.'
              : 'Jährliches Wachstum des Rentenwerts bis Rentenbeginn (§69 SGB VI). Historisch ca. 2–3 % p.a. (nominell).'}
            {(isManual || baselineType === 'beamtenpension') && (
              <> Wird auf den Auskunftswert angewendet.</>
            )}
          </p>

          {/* GRV reduction checkbox (GRV only) */}
          {baselineType === 'grv' && (
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={sp.includeGrvReduction}
                onChange={(event) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, { includeGrvReduction: event.target.checked }),
                  )
                }
              />
              <span>GRV-Minderung durch bAV-Umwandlung abziehen</span>
            </label>
          )}

          {/* Versorgungswerk contribution inputs for Schicht-1 cap */}
          {baselineType === 'versorgungswerk' && (
            <>
              <div className="subsection-heading" style={{ marginTop: 12 }}>
                <h3>Beiträge (für Rürup-Schicht-1-Cap)</h3>
              </div>
              <p className="field-hint">
                Ihre VW-Beiträge zählen nach §10 Abs. 3 Nr. 2 EStG wie GRV-Beiträge zum Schicht-1-Höchstbetrag.
                Tragen Sie Ihre tatsächlichen Monatsbeiträge ein.
              </p>
              <NumberField
                label="Eigener VW-Beitrag (Arbeitnehmeranteil)"
                value={sp.versorgungswerkMonthlyContribution ?? 0}
                min={0}
                step={10}
                suffix="EUR mtl."
                onChange={(value) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, {
                      versorgungswerkMonthlyContribution: Math.max(0, Number(value)),
                    }),
                  )
                }
              />
              <NumberField
                label="AG-Anteil VW (falls angestellt)"
                value={sp.versorgungswerkEmployerMonthly ?? 0}
                min={0}
                step={10}
                suffix="EUR mtl."
                onChange={(value) =>
                  onAssumptionsChange((current) =>
                    patchSp(current, {
                      versorgungswerkEmployerMonthly: Math.max(0, Number(value)),
                    }),
                  )
                }
              />
            </>
          )}

          {/* Result summary */}
          <p className="field-hint">
            {baselineType === 'beamtenpension' ? 'Pension' : 'GRV/VW'} netto
            {baselineType === 'grv' || baselineType === 'versorgungswerk'
              ? ' (KVdR/Versorgungsbezug)'
              : ''}
            :{' '}
            <strong>{formatCurrency(statutoryPensionResult.netMonthlyPension, 0)}/Monat</strong>
            {' '}(Steuer {formatCurrency(statutoryPensionResult.taxMonthly, 0)} +
            {' '}KV/PV {formatCurrency(statutoryPensionResult.kvPvMonthly, 0)})
            {statutoryPensionResult.grvReductionApplied > 0 && (
              <> · bAV-Minderung {formatCurrency(statutoryPensionResult.grvReductionApplied, 0)}/Monat abgezogen</>
            )}
          </p>
        </>
      )}
    </>
  );
}
