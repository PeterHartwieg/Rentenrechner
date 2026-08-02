/**
 * `AltersvorsorgedepotInstanceInputs` — per-instance combine-mode editor
 * for an AVD (Altersvorsorgedepot) contract.
 *
 * Ported from the deleted `CombineDashboardSidebar.AvdInstanceCard`
 * (git history: commit 56ba1e0). AVD has neither a FeeSection nor a
 * BeitragsdynamikField in the legacy sidebar — that pattern carries over
 * here so we keep input parity with the wizard.
 *
 * Glidepath checkbox semantics: `riskAllocationPct` flips between 0.8
 * (Glidepath enabled, modelled as Standarddepot equity sleeve) and 1.0
 * (no glidepath). Matches the deleted card exactly.
 */

import type { AltersvorsorgedepotInstance } from '../../../domain/instances'
import {
  CombineField,
  DraftNumberInput,
  CombineNativeInput,
  CombineNativeSelect,
  CommonContractFields,
} from './_shared'
import { makeInstancePatcher } from './instancePatch'

interface Props {
  instance: AltersvorsorgedepotInstance
  patchInstance: (patch: Partial<AltersvorsorgedepotInstance>) => void
}

export function AltersvorsorgedepotInstanceInputs({
  instance,
  patchInstance,
}: Props) {
  const onCommonChange = makeInstancePatcher(instance, patchInstance)

  return (
    <div className="combine-instance-fields">
      <CommonContractFields instance={instance} onChange={onCommonChange} />
      <DraftNumberInput
        label="Eigenbeitrag (EUR/Monat)"
        value={instance.monthlyOwnContribution}
        min={0}
        max={5000}
        step={10}
        disabled={instance.status === 'paid_up'}
        onCommit={(v) => patchInstance({ monthlyOwnContribution: v })}
      />
      <DraftNumberInput
        label="Alter zu Beginn des ersten Beitragsjahres"
        value={instance.eligibility.ageAtContractStart}
        min={0}
        max={100}
        step={1}
        onCommit={(v) =>
          patchInstance({
            eligibility: {
              ...instance.eligibility,
              ageAtContractStart: Math.max(0, Math.round(v)),
            },
          })
        }
      />
      <CombineField label="Berufseinsteiger-Bonus">
        <label className="combine-checkbox-field">
          <CombineNativeInput
            type="checkbox"
            checked={instance.eligibility.careerStarterBonusUsed}
            onChange={(e) =>
              patchInstance({
                eligibility: {
                  ...instance.eligibility,
                  careerStarterBonusUsed: (e.target as HTMLInputElement).checked,
                },
              })
            }
          />
          bereits erhalten
        </label>
      </CombineField>
      <CombineField label="Depottyp">
        <CombineNativeSelect
          value={instance.subtype}
          onChange={(e) =>
            patchInstance({
              subtype: e.target
                .value as AltersvorsorgedepotInstance['subtype'],
            })
          }
        >
          <option value="depot_no_guarantee">Depot ohne Garantie</option>
          <option value="standarddepot">Standarddepot</option>
          <option value="guarantee_80">80% Garantie</option>
          <option value="guarantee_100">100% Garantie</option>
        </CombineNativeSelect>
      </CombineField>
      <CombineField label="Glidepath">
        <label className="combine-checkbox-field">
          <CombineNativeInput
            type="checkbox"
            checked={instance.riskAllocationPct < 1}
            onChange={(e) =>
              patchInstance({
                riskAllocationPct: (e.target as HTMLInputElement).checked
                  ? 0.8
                  : 1,
              })
            }
          />
          automatische Risikoabsenkung
        </label>
      </CombineField>
    </div>
  )
}
