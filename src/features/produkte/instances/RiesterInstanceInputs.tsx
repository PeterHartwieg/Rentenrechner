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

import { CHILD_ALLOWANCE_CLAIM_HINT } from '../../../content/terms'
import { RiesterFundingLimitation } from '../../inputs/RiesterFundingLimitation'
import { InfoTip } from '../../../ui/InfoTip'
import type { PersonalProfile } from '../../../domain'
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
  profile: PersonalProfile
  partner?: PersonalProfile
  patchInstance: (patch: Partial<RiesterInstance>) => void
}

export function RiesterInstanceInputs({ instance, patchInstance, profile, partner }: Props) {
  const ownerProfile = instance.ownedBy === 'partner' ? partner : profile
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
      <RiesterFundingLimitation />
      <CommonContractFields instance={instance} onChange={onCommonChange} />
      <CombineField label="Vertrag gehört">
        <InvSelect value={instance.ownedBy ?? 'self'}
          options={[{ value: 'self', label: 'Mir' }, { value: 'partner', label: 'Partner / Partnerin' }]}
          onChange={(value) => patchInstance({ ownedBy: value as 'self' | 'partner' })} />
      </CombineField>
      <CombineField label="Förderberechtigung der Person">
        <InvSelect value={instance.eligibility.directlyEligible ? 'direct' : instance.eligibility.indirectSpouseEligible ? 'indirect' : 'none'}
          options={[{ value: 'direct', label: 'Unmittelbar berechtigt' }, { value: 'indirect', label: 'Mittelbar über Ehepartner berechtigt' }, { value: 'none', label: 'Nicht berechtigt' }]}
          onChange={(value) => patchInstance({ eligibility: { ...instance.eligibility,
            directlyEligible: value === 'direct', indirectSpouseEligible: value === 'indirect' } })} />
      </CombineField>
      <p className="field-hint">Mittelbare Berechtigung setzt einen eigenen Vertrag vor der Auszahlung, nicht dauernd getrennt lebende Ehepartner und Wohnsitz in EU/EWR voraus. Die Beiträge beider Personen müssen im Haushalt erfasst sein.</p>
      <CombineField label="Vertrag ist förderfähig">
        <CombineNativeInput type="checkbox" checked={instance.fundingEligible !== false}
          onChange={(e) => patchInstance({ fundingEligible: e.target.checked })} />
      </CombineField>
      <DraftNumberInput label="Rentenversicherungspflichtiges Vorjahreseinkommen (EUR/Jahr)"
        value={instance.eligibility.priorYearRelevantIncome ?? ownerProfile?.grossSalaryYear ?? 0}
        min={0} step={100}
        onCommit={(value) => patchInstance({ eligibility: { ...instance.eligibility, priorYearRelevantIncome: value } })} />
      <p className="field-hint">Ohne eigene Eingabe wird das aktuelle Einkommen der zugeordneten Person geschätzt. Verwende für alle Verträge derselben Person dieselbe Förderberechtigung und dasselbe Vorjahreseinkommen. Kinderzulagen bitte nur einer Person zuordnen.</p>
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
      {profile.childBirthYears.length > 0 && (
        <CombineField
          label="Kinderzulage in diesem Vertrag berücksichtigen"
          labelSuffix={<InfoTip text={CHILD_ALLOWANCE_CLAIM_HINT} />}
        >
          <label className="combine-checkbox-field">
            <CombineNativeInput
              type="checkbox"
              checked={instance.eligibility.claimsChildAllowance ?? true}
              onChange={(e) =>
                patchInstance({
                  eligibility: {
                    ...instance.eligibility,
                    claimsChildAllowance: (e.target as HTMLInputElement).checked,
                  },
                })
              }
            />
          </label>
        </CombineField>
      )}
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
