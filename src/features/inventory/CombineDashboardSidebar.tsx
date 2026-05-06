/**
 * CombineDashboardSidebar — per-instance input cards for the combine-mode
 * dashboard input sidebar (Group G issue 06, M2.8).
 *
 * Mirrors the InventoryWizard's per-instance cards. Editing any field updates
 * the workspace via `usePortfolioState` and recomputes immediately (reactive
 * hook).
 *
 * Design choice (per orchestrator brief): Option 1 — each instance's fields
 * are adapted to singleton shape at the per-call site so existing input
 * section components (`FeeSection`, `PayoutModeSection`, `BeitragsdynamikField`)
 * can be reused without modification. Issue 15 will revisit.
 *
 * Compare-mode is NOT affected. This component only renders when
 * `workspace.mode === 'combine'`.
 *
 * Layer 3 disclosure is included here (same content as wizard Layer 3) using
 * `FeeSection`, `PayoutModeSection`, and `BeitragsdynamikField` from the
 * established `src/features/inputs/sections/` package.
 */

import './InventoryWizard.css'
import './CombineDashboardSidebar.css'
import { useState, useMemo } from 'react'
import { Plus, Trash2, Archive, RefreshCw, Lock } from 'lucide-react'
import type { WorkspaceAssumptionsV2, WhatIfScenario, Scenario } from '../../domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
  InstanceCommon,
} from '../../domain/instances'
import type { PensionBaselineType, StatutoryPensionAssumptions } from '../../domain/products/grv'
import type { MultiInstanceProductId } from '../../app/portfolioState'
import { VintageChips } from './VintageChips'
import { isVintageAtomId } from './vintageChipsUtils'
import type { Atom } from '../../app/recommendations'
import { runRules } from '../../app/recommendations'
import { FeeSection, type FeeInputMode } from '../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../inputs/sections/BeitragsdynamikField'
import { SIMPLIFIED_PRESETS } from '../inputs/sections/feePresets'
import { useFeedbackTarget, qaTarget, useQaMode } from '../qa-feedback'
import {
  bavOfferDraftToInstance,
  bavDraftToInstance,
  pavDraftToInstance,
  basisrenteDraftToInstance,
  avdDraftToInstance,
  riesterDraftToInstance,
  etfDraftToInstance,
  newInstanceId,
  type BavOfferDraft,
} from './inventoryHelpers'
import { InvSelect } from './fields'
import { toNumber, DFW_OPTIONS, PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL } from './fieldHelpers'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  baseline: Scenario
  assumptions: WorkspaceAssumptionsV2
  whatIfs: WhatIfScenario[]
  onPatchAssumptions: (patch: Partial<WorkspaceAssumptionsV2>) => void
  addInstance: (productId: MultiInstanceProductId) => void
  removeInstance: (productId: MultiInstanceProductId, instanceId: string) => void
  onRebaseWhatIf: (id: string) => void
  onFreezeWhatIf: (id: string) => void
  onArchiveAndRestart: () => void
  onPatchBaseline?: (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void
  /** Called when the user clicks "Optionen" on an active or paid-up instance card. */
  onOpenDecisionMenu?: (instanceId: string) => void
}

// ---------------------------------------------------------------------------
// Atom filtering helpers for vintage chips
// ---------------------------------------------------------------------------

function atomsForInstance(atoms: Atom[], instanceId: string): Atom[] {
  return atoms.filter(
    (a) => isVintageAtomId(a.id) && a.context.instanceId === instanceId,
  )
}

// ---------------------------------------------------------------------------
// Per-instance field helpers
// ---------------------------------------------------------------------------

// CombineField is a sidebar-specific layout variant (combine-field CSS class
// vs. inventory-field used in the wizard). It delegates label + children
// rendering to the same pattern but keeps its own class name for styling.
function CombineField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="combine-field">
      <span>{label}</span>
      {children}
    </div>
  )
}

// toNumber, InvSelect, and shared option tables (DFW_OPTIONS, PAYOUT_OPTIONS_*)
// are imported from ./fields. CombineField keeps its own CSS class for sidebar layout.

function CommonContractFields<T extends InstanceCommon>({
  instance,
  onChange,
  currentValueLabel = 'Aktueller Vertragswert',
}: {
  instance: T
  onChange: (next: T) => void
  currentValueLabel?: string
}) {
  return (
    <>
      <CombineField label="Bezeichnung">
        <input
          type="text"
          value={instance.label}
          onChange={(e) => onChange({ ...instance, label: e.target.value })}
        />
      </CombineField>
      <CombineField label="Anbieter">
        <input
          type="text"
          value={instance.anbieter ?? ''}
          onChange={(e) =>
            onChange({ ...instance, anbieter: e.target.value.trim() === '' ? undefined : e.target.value })
          }
        />
      </CombineField>
      <CombineField label="Status">
        <select
          value={instance.status}
          onChange={(e) =>
            onChange({ ...instance, status: e.target.value as InstanceCommon['status'] })
          }
        >
          <option value="active">aktiv</option>
          <option value="paid_up">beitragsfrei</option>
          <option value="surrendered">gekündigt</option>
          <option value="offered">Angebot</option>
        </select>
      </CombineField>
      <CombineField label="Vertragsbeginn">
        <input
          type="number"
          value={instance.contractStartYear}
          min={1970}
          max={new Date().getFullYear()}
          step={1}
          onChange={(e) =>
            onChange({ ...instance, contractStartYear: toNumber(e.target.value, instance.contractStartYear) })
          }
        />
      </CombineField>
      <CombineField label={currentValueLabel}>
        <input
          type="number"
          value={instance.currentValueEUR ?? 0}
          min={0}
          step={100}
          onChange={(e) =>
            onChange({ ...instance, currentValueEUR: toNumber(e.target.value, instance.currentValueEUR ?? 0) })
          }
        />
      </CombineField>
    </>
  )
}

// PayoutModeSelect and BavDurchfuehrungswegSelect replaced by InvSelect +
// shared option tables (PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL,
// DFW_OPTIONS) imported from ./fields.

function PersonalProfileSection({
  baseline,
  assumptions,
  onPatchAssumptions,
  onPatchBaseline,
}: {
  baseline: Scenario
  assumptions: WorkspaceAssumptionsV2
  onPatchAssumptions: (patch: Partial<WorkspaceAssumptionsV2>) => void
  onPatchBaseline?: (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void
}) {
  const profile = baseline.profile
  const statutoryPension = assumptions.statutoryPension
  const partnerEnabled = Boolean(baseline.partner)

  const patchProfile = (patch: Partial<typeof profile>) => {
    onPatchBaseline?.({ profile: { ...profile, ...patch } })
  }
  const patchStatutoryPension = (patch: Partial<StatutoryPensionAssumptions>) => {
    onPatchAssumptions({
      statutoryPension: { ...statutoryPension, ...patch },
    })
  }
  const patchPartner = (enabled: boolean) => {
    onPatchBaseline?.({
      partner: enabled ? { ...profile, grossSalaryYear: 0 } : undefined,
    })
  }

  const { targetProps: profileSectionProps } = useFeedbackTarget({
    id: 'combine.sidebar.personalProfile.section',
    label: 'Persönliche Angaben',
    precision: 'section',
  })
  const { targetProps: profileHeadingProps } = useFeedbackTarget({
    id: 'combine.sidebar.personalProfile.heading',
    label: 'Persönliche-Angaben-Überschrift',
  })
  return (
    <section className="cds-profile-section" aria-label="Persönliche Angaben" {...profileSectionProps}>
      <p className="combine-sidebar-heading" {...profileHeadingProps}>Persönliche Angaben</p>
      <div className="combine-instance-fields">
        <CombineField label="Alter">
          <input
            type="number"
            value={profile.age}
            min={0}
            max={100}
            step={1}
            onChange={(e) => patchProfile({ age: toNumber(e.target.value, profile.age) })}
          />
        </CombineField>
        <CombineField label="Bruttogehalt">
          <input
            type="number"
            value={profile.grossSalaryYear}
            min={0}
            step={1000}
            onChange={(e) =>
              patchProfile({ grossSalaryYear: toNumber(e.target.value, profile.grossSalaryYear) })
            }
          />
        </CombineField>
        <CombineField label="Renteneintrittsalter">
          <input
            type="number"
            value={profile.retirementAge}
            min={profile.age}
            max={85}
            step={1}
            onChange={(e) =>
              patchProfile({ retirementAge: toNumber(e.target.value, profile.retirementAge) })
            }
          />
        </CombineField>
        <CombineField label="Krankenversicherung">
          <select
            value={profile.publicHealthInsurance ? 'gkv' : 'pkv'}
            onChange={(e) => {
              const publicHealthInsurance = e.target.value === 'gkv'
              patchProfile({ publicHealthInsurance })
              patchStatutoryPension({
                retirementHealthStatus: publicHealthInsurance ? 'kvdr' : 'pkv',
              })
            }}
          >
            <option value="gkv">Gesetzlich</option>
            <option value="pkv">Privat</option>
          </select>
        </CombineField>
        <CombineField label="Ehegattensplitting">
          <label className="combine-checkbox-field">
            <input
              type="checkbox"
              checked={partnerEnabled}
              onChange={(e) => patchPartner(e.target.checked)}
            />
            gemeinsam veranlagen
          </label>
        </CombineField>
        <CombineField label="Geburtsjahre Kinder">
          <input
            type="text"
            value={profile.childBirthYears.join(', ')}
            onChange={(e) => {
              const childBirthYears = e.target.value
                .split(/[,\s;]+/)
                .map((part) => Number(part))
                .filter((year) => Number.isInteger(year) && year > 1900)
              patchProfile({ childBirthYears })
            }}
          />
        </CombineField>
        <CombineField label="Pensionssystem">
          <select
            value={statutoryPension.pensionBaselineType ?? 'grv'}
            onChange={(e) => {
              const pensionBaselineType = e.target.value as PensionBaselineType
              patchStatutoryPension({
                pensionBaselineType,
                manualMonthlyGross:
                  pensionBaselineType === 'grv'
                    ? null
                    : statutoryPension.manualMonthlyGross ?? 0,
              })
            }}
          >
            <option value="grv">Gesetzliche Rente</option>
            <option value="beamtenpension">Beamtenpension</option>
            <option value="versorgungswerk">Versorgungswerk</option>
            <option value="none">keine Pflichtversorgung</option>
          </select>
        </CombineField>
        {(statutoryPension.pensionBaselineType === 'beamtenpension' ||
          statutoryPension.pensionBaselineType === 'versorgungswerk') && (
          <CombineField label="Monatliche Brutto-Pension">
            <input
              type="number"
              value={statutoryPension.manualMonthlyGross ?? 0}
              min={0}
              step={50}
              onChange={(e) =>
                patchStatutoryPension({
                  manualMonthlyGross: toNumber(e.target.value, statutoryPension.manualMonthlyGross ?? 0),
                })
              }
            />
          </CombineField>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// bAV instance sidebar card
// ---------------------------------------------------------------------------

function BavInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
  vintageAtoms,
  onOpenDecisionMenu,
}: {
  instance: BavInstance
  onChange: (next: BavInstance) => void
  canRemove: boolean
  onRemove: () => void
  vintageAtoms: Atom[]
  onOpenDecisionMenu?: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(instance.annualContributionGrowthRate ?? 0)
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        <div className="combine-instance-card-actions">
          {onOpenDecisionMenu && instance.status !== 'surrendered' && instance.status !== 'offered' && (
            <button
              type="button"
              className="combine-sidebar-options-btn"
              onClick={onOpenDecisionMenu}
              title="Optionen für diesen Vertrag"
            >
              Optionen
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="combine-sidebar-remove-btn"
              onClick={onRemove}
              title="Instanz entfernen"
            >
              <Trash2 size={13} aria-hidden="true" />
              Entfernen
            </button>
          )}
        </div>
      </div>
      <div className="combine-instance-body">
        <VintageChips atoms={vintageAtoms} />

        <div className="combine-instance-fields">
          <CommonContractFields instance={instance} onChange={onChange} />
          {instance.status !== 'offered' && (
            <CombineField label="Brutto-Umwandlung (EUR/Monat)">
              <input
                type="number"
                value={instance.monthlyGrossConversion}
                min={0}
                max={5000}
                step={10}
                onChange={(e) =>
                  onChange({ ...instance, monthlyGrossConversion: Number(e.target.value) })
                }
              />
            </CombineField>
          )}
          <CombineField label="Zusätzlicher AG-Zuschuss (%)">
            <input
              type="number"
              value={Math.round(instance.contractualMatchPercent * 1000) / 10}
              min={0}
              max={500}
              step={1}
              onChange={(e) =>
                onChange({ ...instance, contractualMatchPercent: toNumber(e.target.value, 0) / 100 })
              }
            />
          </CombineField>
          <CombineField label="Fixer Extra-AG-Beitrag (EUR/Monat)">
            <input
              type="number"
              value={instance.contractualFixedMonthly}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({ ...instance, contractualFixedMonthly: toNumber(e.target.value, 0) })
              }
            />
          </CombineField>
          <CombineField label="Durchführungsweg">
            <InvSelect
              value={instance.durchfuehrungsweg}
              options={DFW_OPTIONS}
              onChange={(v) => onChange({ ...instance, durchfuehrungsweg: v as BavInstance['durchfuehrungsweg'] })}
            />
          </CombineField>
          <CombineField label="Auszahlungsform">
            <InvSelect
              value={instance.payoutMode}
              options={PAYOUT_OPTIONS_FULL}
              onChange={(v) => onChange({ ...instance, payoutMode: v as BavInstance['payoutMode'] })}
            />
          </CombineField>
          <CombineField label="Garantierter Rentenfaktor">
            <input
              type="number"
              value={instance.rentenfaktor}
              min={0}
              step={0.5}
              onChange={(e) => onChange({ ...instance, rentenfaktor: toNumber(e.target.value, instance.rentenfaktor) })}
            />
          </CombineField>
        </div>

        {/* Layer 3: fees via FeeSection (spec requirement for sidebar) */}
        <details className="inv-layer3-details">
          <summary className="inv-layer3-summary">Details</summary>
          <div className="inv-layer3-body">
            <FeeSection
              fees={instance.fees}
              onChangeFees={(fees) => onChange({ ...instance, fees })}
              presets={SIMPLIFIED_PRESETS}
              riy={riy}
              feeInputMode={feeMode}
              setFeeInputMode={setFeeMode}
            />
            <BeitragsdynamikField
              rate={beitragsdynamik}
              onChangeRate={(r) => {
                setBeitragsdynamik(r)
                onChange({ ...instance, annualContributionGrowthRate: r })
              }}
              activeHint="Beitrag wächst jährlich um diesen Prozentsatz (geometrisch)."
            />
          </div>
        </details>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ETF instance sidebar card
// ---------------------------------------------------------------------------

function EtfInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
}: {
  instance: EtfInstance
  onChange: (next: EtfInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(instance.annualContributionGrowthRate ?? 0)
  // ETF fees live in annualAssetFee (scalar), not a FeeModel; wrap for FeeSection.
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

  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        {canRemove && (
          <button
            type="button"
            className="combine-sidebar-remove-btn"
            onClick={onRemove}
            title="Instanz entfernen"
          >
            <Trash2 size={13} aria-hidden="true" />
            Entfernen
          </button>
        )}
      </div>
      <div className="combine-instance-body">
        <div className="combine-instance-fields">
          <CommonContractFields
            instance={instance}
            onChange={onChange}
            currentValueLabel="Aktueller Depotwert"
          />
          <CombineField label="Monatliche Sparrate">
            <input
              type="number"
              value={instance.monthlyContribution ?? 0}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({
                  ...instance,
                  monthlyContribution: toNumber(e.target.value, instance.monthlyContribution ?? 0),
                })
              }
            />
          </CombineField>
        </div>
        <details className="inv-layer3-details">
          <summary className="inv-layer3-summary">Details</summary>
          <div className="inv-layer3-body">
            <FeeSection
              fees={syntheticFees}
              onChangeFees={(fees) =>
                onChange({ ...instance, annualAssetFee: fees.wrapperAssetFee + fees.fundAssetFee })
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
                onChange({ ...instance, annualContributionGrowthRate: r })
              }}
              activeHint="Beitrag wächst jährlich."
            />
          </div>
        </details>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// pAV (insurance) instance sidebar card
// ---------------------------------------------------------------------------

function InsuranceInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
  vintageAtoms,
  onOpenDecisionMenu,
}: {
  instance: InsuranceInstance
  onChange: (next: InsuranceInstance) => void
  canRemove: boolean
  onRemove: () => void
  vintageAtoms: Atom[]
  onOpenDecisionMenu?: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(instance.annualContributionGrowthRate ?? 0)
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        <div className="combine-instance-card-actions">
          {onOpenDecisionMenu && instance.status !== 'surrendered' && instance.status !== 'offered' && (
            <button
              type="button"
              className="combine-sidebar-options-btn"
              onClick={onOpenDecisionMenu}
              title="Optionen für diesen Vertrag"
            >
              Optionen
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="combine-sidebar-remove-btn"
              onClick={onRemove}
              title="Instanz entfernen"
            >
              <Trash2 size={13} aria-hidden="true" />
              Entfernen
            </button>
          )}
        </div>
      </div>
      <div className="combine-instance-body">
        <VintageChips atoms={vintageAtoms} />
        <div className="combine-instance-fields">
          <CommonContractFields instance={instance} onChange={onChange} />
          <CombineField label="Monatsbeitrag (EUR)">
            <input
              type="number"
              value={instance.monthlyContribution ?? 0}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({
                  ...instance,
                  monthlyContribution: toNumber(e.target.value, instance.monthlyContribution ?? 0),
                })
              }
            />
          </CombineField>
          <CombineField label="Auszahlungsform">
            <InvSelect
              value={instance.payoutMode}
              options={PAYOUT_OPTIONS_FULL}
              onChange={(v) => onChange({ ...instance, payoutMode: v as InsuranceInstance['payoutMode'] })}
            />
          </CombineField>
          <CombineField label="Garantierter Rentenfaktor">
            <input
              type="number"
              value={instance.rentenfaktor}
              min={0}
              step={0.5}
              onChange={(e) => onChange({ ...instance, rentenfaktor: toNumber(e.target.value, instance.rentenfaktor) })}
            />
          </CombineField>
        </div>
        <details className="inv-layer3-details">
          <summary className="inv-layer3-summary">Details</summary>
          <div className="inv-layer3-body">
            <FeeSection
              fees={instance.fees}
              onChangeFees={(fees) => onChange({ ...instance, fees })}
              presets={SIMPLIFIED_PRESETS}
              riy={riy}
              feeInputMode={feeMode}
              setFeeInputMode={setFeeMode}
            />
            <BeitragsdynamikField
              rate={beitragsdynamik}
              onChangeRate={(r) => {
                setBeitragsdynamik(r)
                onChange({ ...instance, annualContributionGrowthRate: r })
              }}
            />
          </div>
        </details>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Basisrente instance sidebar card
// ---------------------------------------------------------------------------

function BasisrenteInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
  onOpenDecisionMenu,
}: {
  instance: BasisrenteInstance
  onChange: (next: BasisrenteInstance) => void
  canRemove: boolean
  onRemove: () => void
  onOpenDecisionMenu?: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        <div className="combine-instance-card-actions">
          {onOpenDecisionMenu && instance.status !== 'surrendered' && instance.status !== 'offered' && (
            <button
              type="button"
              className="combine-sidebar-options-btn"
              onClick={onOpenDecisionMenu}
              title="Optionen für diesen Vertrag"
            >
              Optionen
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="combine-sidebar-remove-btn"
              onClick={onRemove}
              title="Instanz entfernen"
            >
              <Trash2 size={13} aria-hidden="true" />
              Entfernen
            </button>
          )}
        </div>
      </div>
      <div className="combine-instance-body">
        <div className="combine-instance-fields">
          <CommonContractFields instance={instance} onChange={onChange} />
          <CombineField label="Monatsbeitrag (EUR)">
            <input
              type="number"
              value={instance.monthlyGrossContribution}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({ ...instance, monthlyGrossContribution: Number(e.target.value) })
              }
            />
          </CombineField>
          <CombineField label="Garantierter Rentenfaktor">
            <input
              type="number"
              value={instance.rentenfaktor}
              min={0}
              step={0.5}
              onChange={(e) => onChange({ ...instance, rentenfaktor: toNumber(e.target.value, instance.rentenfaktor) })}
            />
          </CombineField>
        </div>
        <details className="inv-layer3-details">
          <summary className="inv-layer3-summary">Details</summary>
          <div className="inv-layer3-body">
            <FeeSection
              fees={instance.fees}
              onChangeFees={(fees) => onChange({ ...instance, fees })}
              presets={SIMPLIFIED_PRESETS}
              riy={riy}
              feeInputMode={feeMode}
              setFeeInputMode={setFeeMode}
            />
          </div>
        </details>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AVD instance sidebar card
// ---------------------------------------------------------------------------

function AvdInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
  onOpenDecisionMenu,
}: {
  instance: AltersvorsorgedepotInstance
  onChange: (next: AltersvorsorgedepotInstance) => void
  canRemove: boolean
  onRemove: () => void
  onOpenDecisionMenu?: () => void
}) {
  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        <div className="combine-instance-card-actions">
          {onOpenDecisionMenu && instance.status !== 'surrendered' && instance.status !== 'offered' && (
            <button
              type="button"
              className="combine-sidebar-options-btn"
              onClick={onOpenDecisionMenu}
              title="Optionen für diesen Vertrag"
            >
              Optionen
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="combine-sidebar-remove-btn"
              onClick={onRemove}
              title="Instanz entfernen"
            >
              <Trash2 size={13} aria-hidden="true" />
              Entfernen
            </button>
          )}
        </div>
      </div>
      <div className="combine-instance-body">
        <div className="combine-instance-fields">
          <CommonContractFields instance={instance} onChange={onChange} />
          <CombineField label="Eigenbeitrag (EUR/Monat)">
            <input
              type="number"
              value={instance.monthlyOwnContribution}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({ ...instance, monthlyOwnContribution: Number(e.target.value) })
              }
            />
          </CombineField>
          <CombineField label="Depottyp">
            <select
              value={instance.subtype}
              onChange={(e) =>
                onChange({
                  ...instance,
                  subtype: e.target.value as AltersvorsorgedepotInstance['subtype'],
                })
              }
            >
              <option value="depot_no_guarantee">Depot ohne Garantie</option>
              <option value="standarddepot">Standarddepot</option>
              <option value="guarantee_80">80% Garantie</option>
              <option value="guarantee_100">100% Garantie</option>
            </select>
          </CombineField>
          <CombineField label="Glidepath">
            <label className="combine-checkbox-field">
              <input
                type="checkbox"
                checked={instance.riskAllocationPct < 1}
                onChange={(e) =>
                  onChange({
                    ...instance,
                    riskAllocationPct: e.target.checked ? 0.8 : 1,
                  })
                }
              />
              automatische Risikoabsenkung
            </label>
          </CombineField>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Riester instance sidebar card
// ---------------------------------------------------------------------------

function RiesterInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
  onOpenDecisionMenu,
}: {
  instance: RiesterInstance
  onChange: (next: RiesterInstance) => void
  canRemove: boolean
  onRemove: () => void
  onOpenDecisionMenu?: () => void
}) {
  return (
    <div className="combine-instance-card">
      <div className="combine-instance-card-header">
        <span className="combine-instance-label">{instance.label}</span>
        <div className="combine-instance-card-actions">
          {onOpenDecisionMenu && instance.status !== 'surrendered' && instance.status !== 'offered' && (
            <button
              type="button"
              className="combine-sidebar-options-btn"
              onClick={onOpenDecisionMenu}
              title="Optionen für diesen Vertrag"
            >
              Optionen
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="combine-sidebar-remove-btn"
              onClick={onRemove}
              title="Instanz entfernen"
            >
              <Trash2 size={13} aria-hidden="true" />
              Entfernen
            </button>
          )}
        </div>
      </div>
      <div className="combine-instance-body">
        <div className="combine-instance-fields">
          <CommonContractFields
            instance={instance}
            onChange={(next) =>
              onChange({ ...next, existingCapital: next.currentValueEUR ?? instance.existingCapital })
            }
          />
          <CombineField label="Eigenbeitrag (EUR/Monat)">
            <input
              type="number"
              value={instance.monthlyOwnContribution}
              min={0}
              max={5000}
              step={10}
              onChange={(e) =>
                onChange({ ...instance, monthlyOwnContribution: Number(e.target.value) })
              }
            />
          </CombineField>
          <CombineField label="Auszahlungsform">
            <InvSelect
              value={instance.payoutMode}
              options={PAYOUT_OPTIONS_NO_KAPITAL}
              onChange={(v) =>
                onChange({ ...instance, payoutMode: v as RiesterInstance['payoutMode'] })
              }
            />
          </CombineField>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Product group wrapper
// ---------------------------------------------------------------------------

function ProductGroup({
  label,
  children,
  onAdd,
  addLabel,
}: {
  label: string
  children: React.ReactNode
  onAdd: () => void
  addLabel: string
}) {
  return (
    <div className="combine-sidebar-product-group">
      <div className="combine-sidebar-product-label">{label}</div>
      {children}
      <button type="button" className="combine-sidebar-add-btn" onClick={onAdd}>
        <Plus size={13} aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BaselineStaleBadge — shown on each what-if when baseline has been mutated
// ---------------------------------------------------------------------------

function BaselineStaleBadge({
  whatIf,
  baselineLastEditedAt,
  onRebase,
  onFreeze,
}: {
  whatIf: WhatIfScenario
  baselineLastEditedAt: number | undefined
  onRebase: () => void
  onFreeze: () => void
}) {
  const snapshotCreatedAt = new Date(whatIf.derivedFromBaselineSnapshot.createdAt).getTime()
  // Only treat the baseline as "edited" when lastEditedAt is a real timestamp
  // (> 0). A zero/missing value means the baseline was never explicitly edited.
  const editedAt = (baselineLastEditedAt ?? 0) > 0 ? baselineLastEditedAt! : 0

  // Show the frozen badge only when the user explicitly invoked freeze
  // (frozenAt > 0) and the freeze post-dates the last baseline edit.
  if (whatIf.frozenAt !== undefined && whatIf.frozenAt > 0 && whatIf.frozenAt >= editedAt) {
    const frozenDate = new Date(whatIf.frozenAt).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
    return (
      <div className="cds-stale-badge cds-stale-badge--frozen">
        <Lock size={12} aria-hidden="true" />
        <span>Eingefroren am {frozenDate}</span>
      </div>
    )
  }

  // No stale signal if baseline hasn't been explicitly edited, or the edit
  // did not happen after the snapshot was taken.
  if (editedAt === 0 || editedAt <= snapshotCreatedAt) return null

  return (
    <div className="cds-stale-badge" role="alert">
      <span className="cds-stale-badge-label">Baseline hat sich geändert</span>
      <div className="cds-stale-badge-actions">
        <button
          type="button"
          className="cds-stale-action cds-stale-action--rebase"
          onClick={onRebase}
          title="Auf aktuellen Stand re-basen"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Auf aktuellen Stand re-basen
        </button>
        <button
          type="button"
          className="cds-stale-action cds-stale-action--freeze"
          onClick={onFreeze}
          title="Snapshot beibehalten"
        >
          <Lock size={12} aria-hidden="true" />
          Snapshot beibehalten
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WhatIfCard — summary card for a what-if scenario in the sidebar
// ---------------------------------------------------------------------------

function WhatIfCard({
  whatIf,
  baselineLastEditedAt,
  onRebase,
  onFreeze,
}: {
  whatIf: WhatIfScenario
  baselineLastEditedAt: number | undefined
  onRebase: () => void
  onFreeze: () => void
}) {
  return (
    <div className="cds-whatif-card">
      <div className="cds-whatif-card-header">
        <span className="cds-whatif-label">{whatIf.label}</span>
        <span className="cds-whatif-origin">{whatIf.origin === 'recommender' ? 'Empfehlung' : 'Manuell'}</span>
      </div>
      <BaselineStaleBadge
        whatIf={whatIf}
        baselineLastEditedAt={baselineLastEditedAt}
        onRebase={onRebase}
        onFreeze={onFreeze}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddVertragSection — always-visible affordance to add a new contract type
// ---------------------------------------------------------------------------

/** Human-readable labels matching the product type keys */
type AddVertragItem =
  | { kind?: 'contract'; productId: MultiInstanceProductId; label: string }
  | { kind: 'bav_offer'; label: string }

const ADD_VERTRAG_ITEMS: AddVertragItem[] = [
  { kind: 'bav_offer', label: 'bAV-Angebot' },
  { kind: 'contract', productId: 'bav', label: 'Betriebliche AV (bAV)' },
  { kind: 'contract', productId: 'versicherung', label: 'Private Rentenversicherung (pAV)' },
  { kind: 'contract', productId: 'etf', label: 'ETF-Sparplan' },
  { productId: 'basisrente', label: 'Basisrente (Rürup)' },
  { kind: 'contract', productId: 'altersvorsorgedepot', label: 'Altersvorsorgedepot (AVD)' },
  { kind: 'contract', productId: 'riester', label: 'Riester-Rente' },
]

/**
 * Draft state for non-bAV-offer contract forms. Each product-specific
 * branch uses controlled inputs bound to these state values so that
 * "Vertrag speichern" captures the actual user input instead of defaults.
 */
function DraftContractForm({
  item,
  onCancel,
  onSaveContract,
  onSaveBavOffer,
}: {
  item: AddVertragItem
  onCancel: () => void
  /**
   * Called when the user saves a non-bAV-offer contract. Receives the
   * product id plus the populated domain instance so the caller can
   * insert it directly into workspace assumptions (no second round-trip
   * through addInstanceToWorkspace with defaults).
   */
  onSaveContract: (
    productId: MultiInstanceProductId,
    instance:
      | BavInstance
      | EtfInstance
      | InsuranceInstance
      | BasisrenteInstance
      | AltersvorsorgedepotInstance
      | RiesterInstance,
  ) => void
  onSaveBavOffer?: (draft: BavOfferDraft) => void
}) {
  const productId = item.kind === 'bav_offer' ? 'bav' : item.productId
  const CURRENT_YEAR = new Date().getFullYear()

  // ── Shared fields ──────────────────────────────────────────────────────
  const [anbieter, setAnbieter] = useState('')
  const [contractStartYear, setContractStartYear] = useState(CURRENT_YEAR)

  // ── bAV-offer-only fields ──────────────────────────────────────────────
  const [agMatchPct, setAgMatchPct] = useState(0)
  const [fixedAgMonthly, setFixedAgMonthly] = useState(0)
  const [offerEffektivkostenPct, setOfferEffektivkostenPct] = useState(0.8)
  const [offerRentenfaktor, setOfferRentenfaktor] = useState(30)
  const [offerDurchfuehrungsweg, setOfferDurchfuehrungsweg] =
    useState<BavInstance['durchfuehrungsweg']>('direktversicherung_3_63')
  const [offerPayoutMode, setOfferPayoutMode] = useState<BavInstance['payoutMode']>('leibrente')

  // ── ETF ────────────────────────────────────────────────────────────────
  const [etfMonthly, setEtfMonthly] = useState(200)
  const [etfCurrentValue, setEtfCurrentValue] = useState(0)

  // ── bAV (non-offer) ────────────────────────────────────────────────────
  const [bavMonthlyGross, setBavMonthlyGross] = useState(200)
  const [bavCurrentValue, setBavCurrentValue] = useState(0)
  const [bavDurchfuehrungsweg, setBavDurchfuehrungsweg] =
    useState<BavInstance['durchfuehrungsweg']>('direktversicherung_3_63')
  const [bavEffektivkostenPct, setBavEffektivkostenPct] = useState(0.8)
  const [bavRentenfaktor, setBavRentenfaktor] = useState(30)
  const [bavPayoutMode, setBavPayoutMode] =
    useState<BavInstance['payoutMode']>('leibrente')

  // ── pAV / Basisrente ───────────────────────────────────────────────────
  const [insMonthly, setInsMonthly] = useState(200)
  const [insCurrentValue, setInsCurrentValue] = useState(0)
  const [insRentenfaktor, setInsRentenfaktor] = useState(28)
  const [insEffektivkostenPct, setInsEffektivkostenPct] = useState(0.8)
  const [insPayoutMode, setInsPayoutMode] =
    useState<InsuranceInstance['payoutMode']>('leibrente')

  // ── AVD / Riester ──────────────────────────────────────────────────────
  const [otherMonthly, setOtherMonthly] = useState(200)
  const [otherCurrentValue, setOtherCurrentValue] = useState(0)
  const [avdSubtype, setAvdSubtype] =
    useState<AltersvorsorgedepotInstance['subtype']>('standarddepot')
  const [avdUseGlidepath, setAvdUseGlidepath] = useState(true)
  const [riesterPayoutMode, setRiesterPayoutMode] =
    useState<RiesterInstance['payoutMode']>('leibrente')

  const saveLabel = item.kind === 'bav_offer' ? 'Angebot speichern' : 'Vertrag speichern'

  const handleSave = () => {
    if (item.kind === 'bav_offer') {
      onSaveBavOffer?.({
        anbieter: anbieter.trim() === '' ? undefined : anbieter.trim(),
        contractStartYear,
        contractualMatchPercent: Math.max(0, agMatchPct) / 100,
        contractualFixedMonthly: Math.max(0, fixedAgMonthly),
        effektivkostenPct: Math.max(0, offerEffektivkostenPct),
        rentenfaktor: Math.max(0, offerRentenfaktor),
        durchfuehrungsweg: offerDurchfuehrungsweg,
        payoutMode: offerPayoutMode,
      })
      return
    }

    const trimmedAnbieter = anbieter.trim() === '' ? undefined : anbieter.trim()

    if (productId === 'etf') {
      const instance = etfDraftToInstance({
        productId: 'etf',
        status: 'active',
        contractStartYear,
        currentValueEUR: etfCurrentValue,
        monthlyContribution: etfMonthly,
        anbieter: trimmedAnbieter,
        terPct: 0.2,
      })
      onSaveContract('etf', { ...instance, instanceId: newInstanceId('etf') })
    } else if (productId === 'bav') {
      const instance = bavDraftToInstance({
        productId: 'bav',
        status: 'active',
        contractStartYear,
        currentValueEUR: bavCurrentValue,
        monthlyContribution: bavMonthlyGross,
        anbieter: trimmedAnbieter,
        durchfuehrungsweg: bavDurchfuehrungsweg,
        effektivkostenPct: bavEffektivkostenPct,
        rentenfaktor: bavRentenfaktor,
        payoutMode: bavPayoutMode,
      })
      onSaveContract('bav', {
        ...instance,
        monthlyGrossConversion: bavMonthlyGross,
        instanceId: newInstanceId('bav'),
      })
    } else if (productId === 'versicherung') {
      const instance = pavDraftToInstance({
        productId: 'versicherung',
        status: 'active',
        contractStartYear,
        currentValueEUR: insCurrentValue,
        monthlyContribution: insMonthly,
        anbieter: trimmedAnbieter,
        effektivkostenPct: insEffektivkostenPct,
        rentenfaktor: insRentenfaktor,
        payoutMode: insPayoutMode,
      })
      onSaveContract('versicherung', { ...instance, instanceId: newInstanceId('versicherung') })
    } else if (productId === 'basisrente') {
      const instance = basisrenteDraftToInstance({
        productId: 'basisrente',
        status: 'active',
        contractStartYear,
        currentValueEUR: insCurrentValue,
        monthlyContribution: insMonthly,
        anbieter: trimmedAnbieter,
        effektivkostenPct: insEffektivkostenPct,
        rentenfaktor: insRentenfaktor,
      })
      onSaveContract('basisrente', { ...instance, instanceId: newInstanceId('basisrente') })
    } else if (productId === 'altersvorsorgedepot') {
      const instance = avdDraftToInstance({
        productId: 'altersvorsorgedepot',
        status: 'active',
        contractStartYear,
        currentValueEUR: otherCurrentValue,
        monthlyContribution: otherMonthly,
        anbieter: trimmedAnbieter,
        subtype: avdSubtype,
        useGlidepath: avdUseGlidepath,
      })
      onSaveContract('altersvorsorgedepot', {
        ...instance,
        instanceId: newInstanceId('altersvorsorgedepot'),
      })
    } else if (productId === 'riester') {
      const instance = riesterDraftToInstance({
        productId: 'riester',
        status: 'active',
        contractStartYear,
        currentValueEUR: otherCurrentValue,
        monthlyContribution: otherMonthly,
        anbieter: trimmedAnbieter,
        payoutMode: riesterPayoutMode,
        zulageStatus: '',
      })
      onSaveContract('riester', { ...instance, instanceId: newInstanceId('riester') })
    }
  }

  return (
    <div className="cds-add-vertrag-draft" aria-label={`${item.label} erfassen`}>
      <p className="cds-add-vertrag-menu-label">{item.label} erfassen</p>
      <div className="combine-instance-fields">
        <CombineField label="Anbieter">
          <input type="text" value={anbieter} onChange={(e) => setAnbieter(e.target.value)} />
        </CombineField>
        <CombineField label="Vertragsbeginn">
          <input
            type="number"
            value={contractStartYear}
            min={1970}
            step={1}
            onChange={(e) => setContractStartYear(toNumber(e.target.value, contractStartYear))}
          />
        </CombineField>
        {item.kind === 'bav_offer' ? (
          <>
            <CombineField label="Zusätzlicher AG-Zuschuss (%)">
              <input
                type="number"
                value={agMatchPct}
                min={0}
                max={500}
                step={1}
                onChange={(e) => setAgMatchPct(toNumber(e.target.value, agMatchPct))}
              />
            </CombineField>
            <CombineField label="Fixer Extra-AG-Beitrag (EUR/Monat)">
              <input
                type="number"
                value={fixedAgMonthly}
                min={0}
                step={10}
                onChange={(e) => setFixedAgMonthly(toNumber(e.target.value, fixedAgMonthly))}
              />
            </CombineField>
            <CombineField label="Effektivkosten (% p.a.)">
              <input
                type="number"
                value={offerEffektivkostenPct}
                min={0}
                step={0.1}
                onChange={(e) => setOfferEffektivkostenPct(toNumber(e.target.value, offerEffektivkostenPct))}
              />
            </CombineField>
            <CombineField label="Garantierter Rentenfaktor">
              <input
                type="number"
                value={offerRentenfaktor}
                min={0}
                step={0.5}
                onChange={(e) => setOfferRentenfaktor(toNumber(e.target.value, offerRentenfaktor))}
              />
            </CombineField>
            <CombineField label="Durchführungsweg">
              <InvSelect
                value={offerDurchfuehrungsweg}
                options={DFW_OPTIONS}
                onChange={(v) => setOfferDurchfuehrungsweg(v as BavInstance['durchfuehrungsweg'])}
              />
            </CombineField>
            <CombineField label="Auszahlungsform">
              <InvSelect
                value={offerPayoutMode}
                options={PAYOUT_OPTIONS_FULL}
                onChange={(v) => setOfferPayoutMode(v as BavInstance['payoutMode'])}
              />
            </CombineField>
          </>
        ) : productId === 'etf' ? (
          <>
            <CombineField label="Monatliche Sparrate">
              <input
                type="number"
                value={etfMonthly}
                min={0}
                step={10}
                onChange={(e) => setEtfMonthly(toNumber(e.target.value, etfMonthly))}
              />
            </CombineField>
            <CombineField label="Aktueller Depotwert">
              <input
                type="number"
                value={etfCurrentValue}
                min={0}
                step={100}
                onChange={(e) => setEtfCurrentValue(toNumber(e.target.value, etfCurrentValue))}
              />
            </CombineField>
          </>
        ) : productId === 'bav' ? (
          <>
            <CombineField label="Brutto-Umwandlung (EUR/Monat)">
              <input
                type="number"
                value={bavMonthlyGross}
                min={0}
                step={10}
                onChange={(e) => setBavMonthlyGross(toNumber(e.target.value, bavMonthlyGross))}
              />
            </CombineField>
            <CombineField label="Aktueller Vertragswert">
              <input
                type="number"
                value={bavCurrentValue}
                min={0}
                step={100}
                onChange={(e) => setBavCurrentValue(toNumber(e.target.value, bavCurrentValue))}
              />
            </CombineField>
            <CombineField label="Durchführungsweg">
              <InvSelect
                value={bavDurchfuehrungsweg}
                options={DFW_OPTIONS}
                onChange={(v) => setBavDurchfuehrungsweg(v as BavInstance['durchfuehrungsweg'])}
              />
            </CombineField>
            <CombineField label="Effektivkosten (% p.a.)">
              <input
                type="number"
                value={bavEffektivkostenPct}
                min={0}
                step={0.1}
                onChange={(e) =>
                  setBavEffektivkostenPct(toNumber(e.target.value, bavEffektivkostenPct))
                }
              />
            </CombineField>
            <CombineField label="Garantierter Rentenfaktor">
              <input
                type="number"
                value={bavRentenfaktor}
                min={0}
                step={0.5}
                onChange={(e) => setBavRentenfaktor(toNumber(e.target.value, bavRentenfaktor))}
              />
            </CombineField>
            <CombineField label="Auszahlungsform">
              <InvSelect
                value={bavPayoutMode}
                options={PAYOUT_OPTIONS_FULL}
                onChange={(v) => setBavPayoutMode(v as BavInstance['payoutMode'])}
              />
            </CombineField>
          </>
        ) : productId === 'versicherung' || productId === 'basisrente' ? (
          <>
            <CombineField label="Monatsbeitrag (EUR)">
              <input
                type="number"
                value={insMonthly}
                min={0}
                step={10}
                onChange={(e) => setInsMonthly(toNumber(e.target.value, insMonthly))}
              />
            </CombineField>
            <CombineField label="Aktueller Vertragswert">
              <input
                type="number"
                value={insCurrentValue}
                min={0}
                step={100}
                onChange={(e) => setInsCurrentValue(toNumber(e.target.value, insCurrentValue))}
              />
            </CombineField>
            <CombineField label="Effektivkosten (% p.a.)">
              <input
                type="number"
                value={insEffektivkostenPct}
                min={0}
                step={0.1}
                onChange={(e) =>
                  setInsEffektivkostenPct(toNumber(e.target.value, insEffektivkostenPct))
                }
              />
            </CombineField>
            <CombineField label="Garantierter Rentenfaktor">
              <input
                type="number"
                value={insRentenfaktor}
                min={0}
                step={0.5}
                onChange={(e) => setInsRentenfaktor(toNumber(e.target.value, insRentenfaktor))}
              />
            </CombineField>
            {productId === 'versicherung' && (
              <CombineField label="Auszahlungsform">
                <InvSelect
                  value={insPayoutMode}
                  options={PAYOUT_OPTIONS_FULL}
                  onChange={(v) => setInsPayoutMode(v as InsuranceInstance['payoutMode'])}
                />
              </CombineField>
            )}
          </>
        ) : productId === 'altersvorsorgedepot' ? (
          <>
            <CombineField label="Eigenbeitrag (EUR/Monat)">
              <input
                type="number"
                value={otherMonthly}
                min={0}
                step={10}
                onChange={(e) => setOtherMonthly(toNumber(e.target.value, otherMonthly))}
              />
            </CombineField>
            <CombineField label="Aktueller Vertragswert">
              <input
                type="number"
                value={otherCurrentValue}
                min={0}
                step={100}
                onChange={(e) =>
                  setOtherCurrentValue(toNumber(e.target.value, otherCurrentValue))
                }
              />
            </CombineField>
            <CombineField label="Depottyp">
              <select
                value={avdSubtype}
                onChange={(e) =>
                  setAvdSubtype(e.target.value as AltersvorsorgedepotInstance['subtype'])
                }
              >
                <option value="depot_no_guarantee">Depot ohne Garantie</option>
                <option value="standarddepot">Standarddepot</option>
                <option value="guarantee_80">80% Garantie</option>
                <option value="guarantee_100">100% Garantie</option>
              </select>
            </CombineField>
            <CombineField label="Glidepath">
              <label className="combine-checkbox-field">
                <input
                  type="checkbox"
                  checked={avdUseGlidepath}
                  onChange={(e) => setAvdUseGlidepath(e.target.checked)}
                />
                automatische Risikoabsenkung
              </label>
            </CombineField>
          </>
        ) : (
          <>
            <CombineField label="Eigenbeitrag (EUR/Monat)">
              <input
                type="number"
                value={otherMonthly}
                min={0}
                step={10}
                onChange={(e) => setOtherMonthly(toNumber(e.target.value, otherMonthly))}
              />
            </CombineField>
            <CombineField label="Aktueller Vertragswert">
              <input
                type="number"
                value={otherCurrentValue}
                min={0}
                step={100}
                onChange={(e) =>
                  setOtherCurrentValue(toNumber(e.target.value, otherCurrentValue))
                }
              />
            </CombineField>
            <CombineField label="Auszahlungsform">
              <InvSelect
                value={riesterPayoutMode}
                options={PAYOUT_OPTIONS_NO_KAPITAL}
                onChange={(v) => setRiesterPayoutMode(v as RiesterInstance['payoutMode'])}
              />
            </CombineField>
          </>
        )}
      </div>
      <div className="cds-add-vertrag-draft-actions">
        <button
          type="button"
          className="cds-add-vertrag-save-btn"
          onClick={handleSave}
        >
          {saveLabel}
        </button>
        <button type="button" className="cds-add-vertrag-cancel-btn" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

export function AddVertragSection({
  addInstance,
  addBavOffer,
  addPopulatedInstance,
}: {
  addInstance: (productId: MultiInstanceProductId) => void
  addBavOffer?: (draft: BavOfferDraft) => void
  /**
   * When provided, populated instances are inserted via this callback rather
   * than via `addInstance` (which inserts defaults, discarding draft values).
   * Falls back to `addInstance` when absent for backward compatibility.
   */
  addPopulatedInstance?: (
    productId: MultiInstanceProductId,
    instance:
      | BavInstance
      | EtfInstance
      | InsuranceInstance
      | BasisrenteInstance
      | AltersvorsorgedepotInstance
      | RiesterInstance,
  ) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftItem, setDraftItem] = useState<AddVertragItem | null>(null)
  const visibleItems = addBavOffer
    ? ADD_VERTRAG_ITEMS
    : ADD_VERTRAG_ITEMS.filter((item) => item.kind !== 'bav_offer')
  const { enabled: qaEnabled } = useQaMode()

  return (
    <div className="cds-add-vertrag-section">
      {draftItem ? (
        <DraftContractForm
          item={draftItem}
          onCancel={() => {
            setDraftItem(null)
            setOpen(false)
          }}
          onSaveContract={(productId, instance) => {
            if (addPopulatedInstance) {
              addPopulatedInstance(productId, instance)
            } else {
              addInstance(productId)
            }
            setDraftItem(null)
            setOpen(false)
          }}
          onSaveBavOffer={(draft) => {
            addBavOffer?.(draft)
            setDraftItem(null)
            setOpen(false)
          }}
        />
      ) : !open ? (
        <button
          type="button"
          className="cds-add-vertrag-btn"
          onClick={() => setOpen(true)}
          data-testid="add-vertrag-btn"
          {...qaTarget(qaEnabled, 'combine.sidebar.addVertrag.cta', { label: 'Vertrag hinzufügen' })}
        >
          <Plus size={14} aria-hidden="true" />
          Vertrag hinzufügen
        </button>
      ) : (
        <div
          className="cds-add-vertrag-menu"
          role="menu"
          aria-label="Vertragstyp auswählen"
          {...qaTarget(qaEnabled, 'combine.sidebar.addVertrag.menu', {
            label: 'Vertragstyp-Menü',
            precision: 'section',
          })}
        >
          <p className="cds-add-vertrag-menu-label">Welchen Vertragstyp möchtest du hinzufügen?</p>
          <div className="cds-add-vertrag-options">
            {visibleItems.map((item) => (
              <button
                key={item.kind === 'bav_offer' ? item.kind : item.productId}
                type="button"
                className="cds-add-vertrag-option-btn"
                role="menuitem"
                onClick={() => {
                  setDraftItem(item)
                }}
                {...qaTarget(
                  qaEnabled,
                  `combine.sidebar.addVertrag.option.${item.kind === 'bav_offer' ? 'bav_offer' : item.productId}`,
                  { label: `Vertragstyp ${item.label}` },
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cds-add-vertrag-cancel-btn"
            onClick={() => setOpen(false)}
            {...qaTarget(qaEnabled, 'combine.sidebar.addVertrag.cancel', { label: 'Vertragstyp-Auswahl abbrechen' })}
          >
            Abbrechen
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar component
// ---------------------------------------------------------------------------

export function CombineDashboardSidebar({
  baseline,
  assumptions,
  whatIfs,
  onPatchAssumptions,
  addInstance,
  removeInstance,
  onRebaseWhatIf,
  onFreezeWhatIf,
  onArchiveAndRestart,
  onPatchBaseline,
  onOpenDecisionMenu,
}: Props) {
  // Guard against rapid double-clicks on the archive button.
  const [archiving, setArchiving] = useState(false)
  const { targetProps: sidebarTargetProps } = useFeedbackTarget({
    id: 'combine.sidebar.container',
    label: 'Combine-Dashboard-Sidebar',
    precision: 'section',
  })
  const { targetProps: baselineLabelProps } = useFeedbackTarget({
    id: 'combine.sidebar.baseline.label',
    label: 'Baseline-Label',
  })
  const { targetProps: baselineNameProps } = useFeedbackTarget({
    id: 'combine.sidebar.baseline.name',
    label: 'Baseline-Name',
  })
  const { targetProps: contractsHeadingProps } = useFeedbackTarget({
    id: 'combine.sidebar.contracts.heading',
    label: 'Meine-Verträge-Überschrift',
  })
  const { targetProps: whatIfsHeadingProps } = useFeedbackTarget({
    id: 'combine.sidebar.whatIfs.heading',
    label: 'Szenarien-Überschrift',
  })
  const { targetProps: archiveCtaProps } = useFeedbackTarget({
    id: 'combine.sidebar.archive.cta',
    label: 'Aktuellen Stand als Baseline speichern',
  })

  // Run vintage rules once per assumptions + profile change — rules are pure.
  const vintageAtoms = useMemo(() => runRules({
    workspace: {
      schemaVersion: 2,
      mode: 'combine',
      baseline: { ...baseline, assumptions },
      whatIfs,
      pinnedComparisonIds: [],
    },
    simulationResult: { products: [] },
  }), [assumptions, baseline.profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasBav = assumptions.bav.length > 0
  const hasPav = assumptions.insurance.length > 0
  const hasEtf = assumptions.etf.length > 0
  const hasBasisrente = assumptions.basisrente.length > 0
  const hasAvd = assumptions.altersvorsorgedepot.length > 0
  const hasRiester = assumptions.riester.length > 0

  const hasContracts = hasBav || hasPav || hasEtf || hasBasisrente || hasAvd || hasRiester

  // The archive button is only useful when there is something to archive: at
  // least one contract in the baseline OR at least one what-if scenario.
  const showArchiveButton = hasContracts || whatIfs.length > 0

  return (
    <div className="combine-sidebar" {...sidebarTargetProps}>
      {/* ── Baseline header ───────────────────────────────────────── */}
      <div className="cds-baseline-header">
        <p className="cds-baseline-label" {...baselineLabelProps}>Baseline: dein aktueller Plan</p>
        <p className="cds-baseline-name" {...baselineNameProps}>{baseline.label}</p>
      </div>

      <PersonalProfileSection
        baseline={baseline}
        assumptions={assumptions}
        onPatchAssumptions={onPatchAssumptions}
        onPatchBaseline={onPatchBaseline}
      />

      {!hasContracts && (
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          Noch keine Verträge erfasst. Füge deinen ersten Vertrag hinzu.
        </p>
      )}

      {hasContracts && (
        <>
          <p className="combine-sidebar-heading" {...contractsHeadingProps}>Meine Verträge</p>

      {hasBav && (
        <ProductGroup
          label="Betriebliche Altersvorsorge (bAV)"
          onAdd={() => addInstance('bav')}
          addLabel="+ weitere bAV"
        >
          {assumptions.bav.map((inst) => (
            <BavInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.bav.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  bav: assumptions.bav.map((i) => (i.instanceId === inst.instanceId ? next : i)),
                })
              }
              onRemove={() => removeInstance('bav', inst.instanceId)}
              vintageAtoms={atomsForInstance(vintageAtoms, inst.instanceId)}
              onOpenDecisionMenu={onOpenDecisionMenu ? () => onOpenDecisionMenu(inst.instanceId) : undefined}
            />
          ))}
        </ProductGroup>
      )}

      {hasPav && (
        <ProductGroup
          label="Private Rentenversicherung (pAV)"
          onAdd={() => addInstance('versicherung')}
          addLabel="+ weitere pAV"
        >
          {assumptions.insurance.map((inst) => (
            <InsuranceInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.insurance.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  insurance: assumptions.insurance.map((i) =>
                    i.instanceId === inst.instanceId ? next : i,
                  ),
                })
              }
              onRemove={() => removeInstance('versicherung', inst.instanceId)}
              vintageAtoms={atomsForInstance(vintageAtoms, inst.instanceId)}
              onOpenDecisionMenu={onOpenDecisionMenu ? () => onOpenDecisionMenu(inst.instanceId) : undefined}
            />
          ))}
        </ProductGroup>
      )}

      {hasEtf && (
        <ProductGroup
          label="ETF-Sparplan"
          onAdd={() => addInstance('etf')}
          addLabel="+ weiteres ETF"
        >
          {assumptions.etf.map((inst) => (
            <EtfInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.etf.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  etf: assumptions.etf.map((i) => (i.instanceId === inst.instanceId ? next : i)),
                })
              }
              onRemove={() => removeInstance('etf', inst.instanceId)}
            />
          ))}
        </ProductGroup>
      )}

      {hasBasisrente && (
        <ProductGroup
          label="Basisrente"
          onAdd={() => addInstance('basisrente')}
          addLabel="+ weitere Basisrente"
        >
          {assumptions.basisrente.map((inst) => (
            <BasisrenteInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.basisrente.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  basisrente: assumptions.basisrente.map((i) =>
                    i.instanceId === inst.instanceId ? next : i,
                  ),
                })
              }
              onRemove={() => removeInstance('basisrente', inst.instanceId)}
              onOpenDecisionMenu={onOpenDecisionMenu ? () => onOpenDecisionMenu(inst.instanceId) : undefined}
            />
          ))}
        </ProductGroup>
      )}

      {hasAvd && (
        <ProductGroup
          label="Altersvorsorgedepot (AVD)"
          onAdd={() => addInstance('altersvorsorgedepot')}
          addLabel="+ weiteres AVD"
        >
          {assumptions.altersvorsorgedepot.map((inst) => (
            <AvdInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.altersvorsorgedepot.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  altersvorsorgedepot: assumptions.altersvorsorgedepot.map((i) =>
                    i.instanceId === inst.instanceId ? next : i,
                  ),
                })
              }
              onRemove={() => removeInstance('altersvorsorgedepot', inst.instanceId)}
              onOpenDecisionMenu={onOpenDecisionMenu ? () => onOpenDecisionMenu(inst.instanceId) : undefined}
            />
          ))}
        </ProductGroup>
      )}

      {hasRiester && (
        <ProductGroup
          label="Riester-Rente"
          onAdd={() => addInstance('riester')}
          addLabel="+ weitere Riester"
        >
          {assumptions.riester.map((inst) => (
            <RiesterInstanceCard
              key={inst.instanceId}
              instance={inst}
              canRemove={assumptions.riester.length > 1}
              onChange={(next) =>
                onPatchAssumptions({
                  riester: assumptions.riester.map((i) =>
                    i.instanceId === inst.instanceId ? next : i,
                  ),
                })
              }
              onRemove={() => removeInstance('riester', inst.instanceId)}
              onOpenDecisionMenu={onOpenDecisionMenu ? () => onOpenDecisionMenu(inst.instanceId) : undefined}
            />
          ))}
        </ProductGroup>
      )}
        </>
      )}

      {/* ── Add new contract affordance ──────────────────────────── */}
      <AddVertragSection
        addInstance={addInstance}
        addBavOffer={(draft) =>
          onPatchAssumptions({ bav: [...assumptions.bav, bavOfferDraftToInstance(draft)] })
        }
        addPopulatedInstance={(productId, instance) => {
          // Append the populated instance to the relevant array in assumptions.
          // This preserves user-entered draft values instead of using defaults.
          switch (productId) {
            case 'bav':
              onPatchAssumptions({ bav: [...assumptions.bav, instance as BavInstance] })
              break
            case 'versicherung':
              onPatchAssumptions({ insurance: [...assumptions.insurance, instance as InsuranceInstance] })
              break
            case 'etf':
              onPatchAssumptions({ etf: [...assumptions.etf, instance as EtfInstance] })
              break
            case 'basisrente':
              onPatchAssumptions({ basisrente: [...assumptions.basisrente, instance as BasisrenteInstance] })
              break
            case 'altersvorsorgedepot':
              onPatchAssumptions({ altersvorsorgedepot: [...assumptions.altersvorsorgedepot, instance as AltersvorsorgedepotInstance] })
              break
            case 'riester':
              onPatchAssumptions({ riester: [...assumptions.riester, instance as RiesterInstance] })
              break
          }
        }}
      />

      {/* ── What-if scenarios ─────────────────────────────────────── */}
      {whatIfs.length > 0 && (
        <div className="cds-whatifs-section">
          <p className="cds-whatifs-heading" {...whatIfsHeadingProps}>Szenarien</p>
          {whatIfs.map((wi) => (
            <WhatIfCard
              key={wi.id}
              whatIf={wi}
              baselineLastEditedAt={baseline.lastEditedAt}
              onRebase={() => onRebaseWhatIf(wi.id)}
              onFreeze={() => onFreezeWhatIf(wi.id)}
            />
          ))}
        </div>
      )}

      {/* ── Archive + restart button ──────────────────────────────── */}
      {/* Only render when there is something to archive (contracts or what-ifs). */}
      {showArchiveButton && (
        <div className="cds-archive-section">
          {/* Inline trade-off hint — visible without clicking, so the user
              understands the data-loss before they decide to act. */}
          <p className="cds-archive-hint">
            Mehrere Verträge pro Produkttyp werden im Archiv zu einem zusammengefasst.
          </p>
          <button
            type="button"
            className="cds-archive-btn"
            disabled={archiving}
            {...archiveCtaProps}
            onClick={() => {
              // Prevent double-clicks from writing two library entries.
              if (archiving) return
              // Confirm both lossiness effects before proceeding:
              //   1. Multi-instance contracts are collapsed to one per product type.
              //   2. All current what-if scenarios are deleted.
              const ok = window.confirm(
                'Aktuellen Stand als Baseline speichern und neu starten?\n\n' +
                '• Verträge mit mehreren Instanzen werden in der Archiv-Vorschau auf je einen pro Produkttyp zusammengefasst.\n' +
                '• Alle aktuellen Was-wäre-wenn-Szenarien werden gelöscht.\n\n' +
                'Fortfahren?'
              )
              if (!ok) return
              setArchiving(true)
              try {
                onArchiveAndRestart()
              } finally {
                setArchiving(false)
              }
            }}
            title="Aktuellen Stand speichern und What-Ifs zurücksetzen"
          >
            <Archive size={14} aria-hidden="true" />
            Aktuellen Stand als Baseline speichern und neu starten
          </button>
        </div>
      )}
    </div>
  )
}
