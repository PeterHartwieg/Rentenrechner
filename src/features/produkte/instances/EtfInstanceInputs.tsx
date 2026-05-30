/**
 * `EtfInstanceInputs` — per-instance combine-mode editor for an ETF
 * sparplan.
 *
 * Ported from the deleted `CombineDashboardSidebar.EtfInstanceCard`
 * (git history: commit 56ba1e0). ETF differs from bAV/pAV in that fees live
 * on a scalar `annualAssetFee` instead of a `FeeModel`; the deleted card
 * wrapped that scalar in a synthetic FeeModel for `FeeSection` reuse — we
 * preserve that exact treatment here.
 *
 * Combine-mode honours `monthlyContribution` per-instance via
 * `BuildContextOverrides.etfMonthlyUserCostOverride` (compare-mode falls
 * back to the fair-comparison invariant — `bavFunding.monthlyNetCost`). The
 * field rendered here only flows into the combine pipeline; in compare-mode
 * the singleton ETF path ignores it.
 */

import { useState } from 'react'
import type { EtfInstance } from '../../../domain/instances'
import { FeeSection, type FeeInputMode } from '../../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../../inputs/sections/BeitragsdynamikField'
import { SIMPLIFIED_PRESETS } from '../../inputs/sections/feePresets'
import { DraftNumberInput, CommonContractFields } from './_shared'
import { makeInstancePatcher } from './instancePatch'

interface Props {
  instance: EtfInstance
  patchInstance: (patch: Partial<EtfInstance>) => void
}

export function EtfInstanceInputs({ instance, patchInstance }: Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(
    instance.annualContributionGrowthRate ?? 0,
  )

  // ETF fees live on the scalar annualAssetFee; wrap for FeeSection then
  // unwrap into wrapperAssetFee + fundAssetFee on commit. Matches the
  // deleted sidebar's behaviour 1:1 so the engine receives the same
  // RIY contribution.
  const syntheticFees = {
    wrapperAssetFee: 0,
    fundAssetFee: instance.annualAssetFee,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  }
  const riy = instance.annualAssetFee

  const onCommonChange = makeInstancePatcher(instance, patchInstance)

  return (
    <div className="combine-instance-fields">
      <CommonContractFields
        instance={instance}
        onChange={onCommonChange}
        currentValueLabel="Aktueller Depotwert"
      />
      <DraftNumberInput
        label="Monatliche Sparrate"
        value={instance.monthlyContribution ?? 0}
        min={0}
        max={5000}
        step={10}
        disabled={instance.status === 'paid_up'}
        onCommit={(v) => patchInstance({ monthlyContribution: v })}
      />

      <details className="inv-layer3-details">
        <summary className="inv-layer3-summary">Details</summary>
        <div className="inv-layer3-body">
          <FeeSection
            fees={syntheticFees}
            onChangeFees={(fees) =>
              patchInstance({
                annualAssetFee: fees.wrapperAssetFee + fees.fundAssetFee,
              })
            }
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
            activeHint="Beitrag wächst jährlich."
          />
        </div>
      </details>
    </div>
  )
}
