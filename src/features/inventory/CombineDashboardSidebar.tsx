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
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import type { MultiInstanceProductId } from '../../app/portfolioState'
import { detectVintageChips } from './vintageDetection'
import { InfoTip } from '../../ui/InfoTip'
import { FeeSection, type FeeInputMode } from '../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../inputs/sections/BeitragsdynamikField'

// ---------------------------------------------------------------------------
// BAV_FEE_PRESETS / PAV_FEE_PRESETS (simplified for sidebar context)
// Same as BavInputs / InsuranceInputs reference values.
// ---------------------------------------------------------------------------

const SIMPLIFIED_PRESETS = [
  {
    label: 'Nettotarif ETF (0,8 %)',
    fees: {
      wrapperAssetFee: 0.005,
      fundAssetFee: 0.003,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  {
    label: 'Bruttotarif (1,5 %)',
    fees: {
      wrapperAssetFee: 0.01,
      fundAssetFee: 0.005,
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  assumptions: WorkspaceAssumptionsV2
  onPatchAssumptions: (patch: Partial<WorkspaceAssumptionsV2>) => void
  addInstance: (productId: MultiInstanceProductId) => void
  removeInstance: (productId: MultiInstanceProductId, instanceId: string) => void
}

// ---------------------------------------------------------------------------
// VintageChips (re-exported from vintageDetection, shared with InstanceCard)
// ---------------------------------------------------------------------------

function VintageChipsBar({
  contractStartYear,
  durchfuehrungsweg,
}: {
  contractStartYear: number
  durchfuehrungsweg?: string
}) {
  const chips = detectVintageChips({ contractStartYear, durchfuehrungsweg })
  if (chips.length === 0) return null
  return (
    <div className="inv-vintage-chips" style={{ margin: '4px 0' }}>
      {chips.map((chip) => (
        <span key={chip.id} className="inv-vintage-chip">
          {chip.label}
          <InfoTip text={chip.tooltip} icon="info" />
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-instance field helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// bAV instance sidebar card
// ---------------------------------------------------------------------------

function BavInstanceCard({
  instance,
  onChange,
  canRemove,
  onRemove,
}: {
  instance: BavInstance
  onChange: (next: BavInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(instance.annualContributionGrowthRate ?? 0)
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

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
        <VintageChipsBar
          contractStartYear={instance.contractStartYear}
          durchfuehrungsweg={instance.durchfuehrungsweg}
        />

        <div className="combine-instance-fields">
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
          <CombineField label="Vertragsbeginn">
            <input
              type="number"
              value={instance.contractStartYear}
              min={1970}
              max={new Date().getFullYear()}
              step={1}
              onChange={(e) =>
                onChange({ ...instance, contractStartYear: Number(e.target.value) })
              }
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
        <div className="inv-m1-banner" role="note">
          <strong>Vorschau:</strong> ETF Beträge im Kombinations-Modus folgen mit Issue 15.
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
}: {
  instance: InsuranceInstance
  onChange: (next: InsuranceInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const [beitragsdynamik, setBeitragsdynamik] = useState(instance.annualContributionGrowthRate ?? 0)
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

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
        <div className="inv-m1-banner" role="note">
          <strong>Vorschau:</strong> Versicherung Beträge im Kombinations-Modus folgen mit Issue 15.
        </div>
        <VintageChipsBar contractStartYear={instance.contractStartYear} />
        <div className="combine-instance-fields">
          <CombineField label="Vertragsbeginn">
            <input
              type="number"
              value={instance.contractStartYear}
              min={1970}
              max={new Date().getFullYear()}
              step={1}
              onChange={(e) =>
                onChange({ ...instance, contractStartYear: Number(e.target.value) })
              }
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
}: {
  instance: BasisrenteInstance
  onChange: (next: BasisrenteInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')
  const riy = instance.fees.wrapperAssetFee + instance.fees.fundAssetFee

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
}: {
  instance: AltersvorsorgedepotInstance
  onChange: (next: AltersvorsorgedepotInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
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
}: {
  instance: RiesterInstance
  onChange: (next: RiesterInstance) => void
  canRemove: boolean
  onRemove: () => void
}) {
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

export function CombineDashboardSidebar({
  assumptions,
  onPatchAssumptions,
  addInstance,
  removeInstance,
}: Props) {
  const hasBav = assumptions.bav.length > 0
  const hasPav = assumptions.insurance.length > 0
  const hasEtf = assumptions.etf.length > 0
  const hasBasisrente = assumptions.basisrente.length > 0
  const hasAvd = assumptions.altersvorsorgedepot.length > 0
  const hasRiester = assumptions.riester.length > 0

  if (!hasBav && !hasPav && !hasEtf && !hasBasisrente && !hasAvd && !hasRiester) {
    return (
      <div className="combine-sidebar">
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          Noch keine Verträge erfasst. Nutze die Bestandsaufnahme, um Verträge hinzuzufügen.
        </p>
      </div>
    )
  }

  return (
    <div className="combine-sidebar">
      <p className="combine-sidebar-heading">Meine Verträge</p>

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
            />
          ))}
        </ProductGroup>
      )}
    </div>
  )
}
