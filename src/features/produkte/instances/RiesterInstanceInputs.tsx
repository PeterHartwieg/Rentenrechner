/**
 * `RiesterInstanceInputs` — per-instance combine-mode editor for a Riester
 * contract.
 *
 * Ported from the deleted `CombineDashboardSidebar.RiesterInstanceCard`
 * (git history: commit 56ba1e0). Riester cannot pay out as Kapitalentnahme
 * — we therefore use `PAYOUT_OPTIONS_NO_KAPITAL` for the payoutMode select,
 * matching the deleted card.
 *
 * Subtle gotcha preserved verbatim: changes via `CommonContractFields`
 * (which writes `currentValueEUR`) also keep `existingCapital` in sync so
 * the engine's accumulation policy gets a populated initial capital value
 * on first load when the workspace was migrated from an older shape.
 */

import type { RiesterInstance } from '../../../domain/instances'
import { InvSelect } from '../../inventory/fields'
import { PAYOUT_OPTIONS_NO_KAPITAL } from '../../inventory/fieldHelpers'
import {
  CombineField,
  DraftNumberInput,
  CombineNativeInput,
  CommonContractFields,
} from './_shared'
import { diffInstancePatch } from './instancePatch'

interface Props {
  instance: RiesterInstance
  patchInstance: (patch: Partial<RiesterInstance>) => void
}

export function RiesterInstanceInputs({ instance, patchInstance }: Props) {
  const onCommonChange = (next: RiesterInstance) => {
    // Keep existingCapital in sync with currentValueEUR per the legacy
    // sidebar's behaviour (see CombineDashboardSidebar.RiesterInstanceCard
    // line 1069). We compose the shared diff helper, then merge the mirror
    // field into the patch before dispatching.
    const patch = diffInstancePatch(instance, next)
    if ('currentValueEUR' in patch) {
      patch.existingCapital = next.currentValueEUR ?? instance.existingCapital
    }
    if (Object.keys(patch).length > 0) patchInstance(patch)
  }

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
      <CombineField label="Auszahlungsform">
        <InvSelect
          value={instance.payoutMode}
          options={PAYOUT_OPTIONS_NO_KAPITAL}
          onChange={(v) =>
            patchInstance({ payoutMode: v as RiesterInstance['payoutMode'] })
          }
        />
      </CombineField>
    </div>
  )
}
