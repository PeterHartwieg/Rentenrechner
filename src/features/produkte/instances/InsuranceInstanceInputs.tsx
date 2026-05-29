/**
 * `InsuranceInstanceInputs` — per-instance combine-mode editor for a
 * private pension insurance (pAV) contract.
 *
 * Ported from the deleted `CombineDashboardSidebar.InsuranceInstanceCard`
 * (git history: commit 56ba1e0). The field set survives verbatim:
 * Bezeichnung / Anbieter / Status / Vertragsbeginn / Aktueller Vertragswert
 * (via `CommonContractFields`), Monatsbeitrag, Auszahlungsform,
 * garantierter Rentenfaktor, plus the Layer-3 Details disclosure with
 * `FeeSection` + `BeitragsdynamikField`.
 *
 * Combine-mode honours `monthlyContribution` per-instance via
 * `BuildContextOverrides.insuranceMonthlyUserCostOverride` (compare-mode
 * uses `bavFunding.monthlyNetCost` via the fair-comparison invariant).
 */

import { useState } from 'react'
import type { InsuranceInstance } from '../../../domain/instances'
import { FeeSection, type FeeInputMode } from '../../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../../inputs/sections/BeitragsdynamikField'
import { SIMPLIFIED_PRESETS } from '../../inputs/sections/feePresets'
import { InvSelect } from '../../inventory/fields'
import { PAYOUT_OPTIONS_FULL } from '../../inventory/fieldHelpers'
import {
  CombineField,
  DraftNumberInput,
  CommonContractFields,
} from './_shared'

interface Props {
  instance: InsuranceInstance
  patchInstance: (patch: Partial<InsuranceInstance>) => void
}

export function InsuranceInstanceInputs({ instance, patchInstance }: Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(
    instance.annualContributionGrowthRate ?? 0,
  )
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

  const onCommonChange = (next: InsuranceInstance) => {
    const patch: Partial<InsuranceInstance> = {}
    ;(Object.keys(next) as Array<keyof InsuranceInstance>).forEach((k) => {
      if (next[k] !== instance[k]) {
        ;(patch as Record<string, unknown>)[k as string] = next[k]
      }
    })
    if (Object.keys(patch).length > 0) patchInstance(patch)
  }

  return (
    <div className="combine-instance-fields">
      <CommonContractFields instance={instance} onChange={onCommonChange} />
      <CombineField label="Monatsbeitrag (EUR)">
        <DraftNumberInput
          value={instance.monthlyContribution ?? 0}
          min={0}
          max={5000}
          step={10}
          disabled={instance.status === 'paid_up'}
          onCommit={(v) => patchInstance({ monthlyContribution: v })}
        />
      </CombineField>
      <CombineField label="Auszahlungsform">
        <InvSelect
          value={instance.payoutMode}
          options={PAYOUT_OPTIONS_FULL}
          onChange={(v) =>
            patchInstance({
              payoutMode: v as InsuranceInstance['payoutMode'],
            })
          }
        />
      </CombineField>
      <CombineField label="Garantierter Rentenfaktor">
        <DraftNumberInput
          value={instance.rentenfaktor}
          min={0}
          step={0.5}
          onCommit={(v) => patchInstance({ rentenfaktor: v })}
        />
      </CombineField>

      <details className="inv-layer3-details">
        <summary className="inv-layer3-summary">Details</summary>
        <div className="inv-layer3-body">
          <FeeSection
            fees={instance.fees}
            onChangeFees={(fees) => patchInstance({ fees })}
            presets={SIMPLIFIED_PRESETS}
            riy={riy}
            feeInputMode={feeMode}
            setFeeInputMode={setFeeMode}
          />
          <BeitragsdynamikField
            rate={beitragsdynamik}
            onChangeRate={(r) => {
              setBeitragsdynamik(r)
              patchInstance({ annualContributionGrowthRate: r })
            }}
          />
        </div>
      </details>
    </div>
  )
}
