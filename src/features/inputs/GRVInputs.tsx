import '../../ui/forms.css'
import type React from 'react'
import type { ScenarioAssumptions, StatutoryPensionAssumptions } from '../../domain/types';
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

export function GRVInputs({ assumptions, onAssumptionsChange, statutoryPensionResult }: Props) {
  return (
    <>
      <div className="subsection-heading">
        <h3>Gesetzliche Rentenversicherung (GRV)</h3>
        <p>Basisschutz aus der gesetzlichen Rente — geschätzt oder aus der Renteninformation.</p>
      </div>

      <label className="field">
        <span>Grundlage</span>
        <select
          value={assumptions.statutoryPension.manualMonthlyGross !== null ? 'manual' : 'ep'}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              statutoryPension: {
                ...current.statutoryPension,
                manualMonthlyGross: event.target.value === 'manual' ? 0 : null,
              } as StatutoryPensionAssumptions,
            }))
          }
        >
          <option value="ep">Schätzen (Entgeltpunkte)</option>
          <option value="manual">Aus Renteninformation (manuell)</option>
        </select>
      </label>

      {assumptions.statutoryPension.manualMonthlyGross !== null ? (
        <NumberField
          label="Progn. Bruttorente (Renteninformation)"
          value={assumptions.statutoryPension.manualMonthlyGross}
          min={0}
          step={10}
          suffix="EUR mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              statutoryPension: {
                ...current.statutoryPension,
                manualMonthlyGross: Math.max(0, Number(value)),
              },
            }))
          }
        />
      ) : (
        <>
          <NumberField
            label="Entgeltpunkte bisher (EP)"
            value={assumptions.statutoryPension.currentEntgeltpunkte}
            min={0}
            max={200}
            step={0.1}
            suffix="EP"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                statutoryPension: {
                  ...current.statutoryPension,
                  currentEntgeltpunkte: Math.max(0, Number(value)),
                },
              }))
            }
          />
          <p className="field-hint">
            EP bei Rentenbeginn: ~{formatNumber(statutoryPensionResult.projectedEntgeltpunkte, 1)} EP
            {' '}· Bruttorente: ~{formatCurrency(statutoryPensionResult.grossMonthlyPension, 0)}/Monat
          </p>
        </>
      )}

      <label className="field field-inline">
        <input
          type="checkbox"
          checked={assumptions.statutoryPension.includeGrvReduction}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              statutoryPension: {
                ...current.statutoryPension,
                includeGrvReduction: event.target.checked,
              },
            }))
          }
        />
        <span>GRV-Minderung durch bAV-Umwandlung abziehen</span>
      </label>

      <p className="field-hint">
        GRV netto (KVdR): <strong>{formatCurrency(statutoryPensionResult.netMonthlyPension, 0)}/Monat</strong>
        {' '}(Steuer {formatCurrency(statutoryPensionResult.taxMonthly, 0)} +
        {' '}KV/PV {formatCurrency(statutoryPensionResult.kvPvMonthly, 0)})
        {statutoryPensionResult.grvReductionApplied > 0 && (
          <> · bAV-Minderung {formatCurrency(statutoryPensionResult.grvReductionApplied, 0)}/Monat abgezogen</>
        )}
      </p>
    </>
  );
}
