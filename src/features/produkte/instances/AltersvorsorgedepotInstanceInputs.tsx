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
  CombineNativeInput,
  CombineNativeSelect,
  CommonContractFields,
} from './_shared'
import { makeInstancePatcher } from './instancePatch'
import { RangeNumberField } from '../../../ui/RangeNumberField'
import { buildAvdBeitragsstufen } from '../../inputs/avdBeitragsstufen'
import { maxAvdMonthlyOwnContribution } from '../../../engine/altersvorsorgedepot'
import { de2026Rules } from '../../../rules/de2026'
import { defaultAssumptions } from '../../../data/defaultScenario'

interface Props {
  instance: AltersvorsorgedepotInstance
  patchInstance: (patch: Partial<AltersvorsorgedepotInstance>) => void
}

export function AltersvorsorgedepotInstanceInputs({
  instance,
  patchInstance,
}: Props) {
  const onCommonChange = makeInstancePatcher(instance, patchInstance)

  // The generic 0–5 000 EUR range this replaces had no relation to the
  // statutory AVD limits. Levels and ceiling come from the same helpers the
  // compare-mode panel and the contribution sync use.
  const eligibility = instance.eligibility ?? defaultAssumptions.altersvorsorgedepot.eligibility
  const stufen = buildAvdBeitragsstufen(de2026Rules, eligibility)
  const vertragsrahmen = maxAvdMonthlyOwnContribution(
    eligibility,
    de2026Rules,
    !eligibility.careerStarterBonusUsed,
  )
  // Raise the bound for a stored contract that already exceeds the frame
  // rather than silently rewriting the user's contract data on open.
  const maxOwn = Math.max(vertragsrahmen, instance.monthlyOwnContribution ?? 0)

  return (
    <div className="combine-instance-fields">
      <CommonContractFields instance={instance} onChange={onCommonChange} />
      <RangeNumberField
        label="Wie viel zahlst du selbst ein?"
        value={instance.monthlyOwnContribution ?? 0}
        min={0}
        max={maxOwn}
        step={5}
        suffix="EUR/Monat"
        disabled={instance.status === 'paid_up'}
        choices={stufen.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
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
