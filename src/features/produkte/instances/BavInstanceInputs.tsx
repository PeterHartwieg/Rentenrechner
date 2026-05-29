/**
 * `BavInstanceInputs` — per-instance combine-mode editor for a bAV contract.
 *
 * Ported from the deleted `CombineDashboardSidebar.BavInstanceCard`
 * (git history: commit 56ba1e0). The field set, validation ranges, and
 * disabled-when-paid_up semantics survive verbatim. The wrapping <div>
 * structure was simplified — there's no longer a sidebar header / options
 * button / Vertragdaten read-only table (those affordances are rendered by
 * the parent `<DProduktRow>` already).
 *
 * Wired into `PRODUCT_UI_REGISTRY.bav.renderInstanceInputs` so the Sober D
 * combine-mode panel can mount it inside the row's "Bearbeiten" disclosure.
 * Patches flow back via the supplied `patchInstance` callback, which the
 * panel translates into a `patchBaseline({ assumptions: {...} })` patch on
 * the workspace — never bypassing `migrateAndValidateState` / the storage
 * pipeline (P1 invariant).
 */

import { useState } from 'react'
import type { BavInstance } from '../../../domain/instances'
import { FeeSection, type FeeInputMode } from '../../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../../inputs/sections/BeitragsdynamikField'
import { SIMPLIFIED_PRESETS } from '../../inputs/sections/feePresets'
import { InvSelect } from '../../inventory/fields'
import {
  DFW_OPTIONS,
  PAYOUT_OPTIONS_FULL,
} from '../../inventory/fieldHelpers'
import {
  CombineField,
  DraftNumberInput,
  CommonContractFields,
} from './_shared'

interface Props {
  instance: BavInstance
  patchInstance: (patch: Partial<BavInstance>) => void
}

export function BavInstanceInputs({ instance, patchInstance }: Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(
    instance.annualContributionGrowthRate ?? 0,
  )
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee
  // Wrap each field's onChange in a patch dispatch instead of a full
  // instance-replace. Sibling fields stay untouched in the workspace.
  const onChange = (next: BavInstance) => {
    const patch: Partial<BavInstance> = {}
    ;(Object.keys(next) as Array<keyof BavInstance>).forEach((k) => {
      if (next[k] !== instance[k]) {
        ;(patch as Record<string, unknown>)[k as string] = next[k]
      }
    })
    if (Object.keys(patch).length > 0) patchInstance(patch)
  }

  return (
    <div className="combine-instance-fields">
      <CommonContractFields instance={instance} onChange={onChange} />
      {instance.status !== 'offered' && (
        <CombineField label="Brutto-Umwandlung (EUR/Monat)">
          <DraftNumberInput
            value={instance.monthlyGrossConversion}
            min={0}
            max={5000}
            step={10}
            disabled={instance.status === 'paid_up'}
            onCommit={(v) => patchInstance({ monthlyGrossConversion: v })}
          />
        </CombineField>
      )}
      <CombineField label="Zusätzlicher AG-Zuschuss (%)">
        <DraftNumberInput
          value={Math.round(instance.contractualMatchPercent * 1000) / 10}
          min={0}
          max={500}
          step={1}
          onCommit={(v) => patchInstance({ contractualMatchPercent: v / 100 })}
        />
      </CombineField>
      <CombineField label="Fixer Extra-AG-Beitrag (EUR/Monat)">
        <DraftNumberInput
          value={instance.contractualFixedMonthly}
          min={0}
          max={5000}
          step={10}
          onCommit={(v) => patchInstance({ contractualFixedMonthly: v })}
        />
      </CombineField>
      <CombineField label="Durchführungsweg">
        <InvSelect
          value={instance.durchfuehrungsweg}
          options={DFW_OPTIONS}
          onChange={(v) =>
            patchInstance({
              durchfuehrungsweg: v as BavInstance['durchfuehrungsweg'],
            })
          }
        />
      </CombineField>
      <CombineField label="Auszahlungsform">
        <InvSelect
          value={instance.payoutMode}
          options={PAYOUT_OPTIONS_FULL}
          onChange={(v) =>
            patchInstance({ payoutMode: v as BavInstance['payoutMode'] })
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
            activeHint="Beitrag wächst jährlich um diesen Prozentsatz (geometrisch)."
          />
        </div>
      </details>
    </div>
  )
}
