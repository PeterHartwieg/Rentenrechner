/**
 * `BasisrenteInstanceInputs` — per-instance combine-mode editor for a
 * Basisrente / Rürup contract.
 *
 * Ported from the deleted `CombineDashboardSidebar.BasisrenteInstanceCard`
 * (git history: commit 56ba1e0). Basisrente is leibrente-only by
 * §10 Abs. 1 Nr. 2 b EStG; the deleted card therefore did not surface a
 * payoutMode selector, and neither does this one.
 */

import { useState } from 'react'
import type { BasisrenteInstance } from '../../../domain/instances'
import { FeeSection, type FeeInputMode } from '../../inputs/sections/FeeSection'
import { SIMPLIFIED_PRESETS } from '../../inputs/sections/feePresets'
import {
  CombineField,
  DraftNumberInput,
  CommonContractFields,
} from './_shared'

interface Props {
  instance: BasisrenteInstance
  patchInstance: (patch: Partial<BasisrenteInstance>) => void
}

export function BasisrenteInstanceInputs({ instance, patchInstance }: Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

  const onCommonChange = (next: BasisrenteInstance) => {
    const patch: Partial<BasisrenteInstance> = {}
    ;(Object.keys(next) as Array<keyof BasisrenteInstance>).forEach((k) => {
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
          value={instance.monthlyGrossContribution}
          min={0}
          max={5000}
          step={10}
          disabled={instance.status === 'paid_up'}
          onCommit={(v) => patchInstance({ monthlyGrossContribution: v })}
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
        </div>
      </details>
    </div>
  )
}
