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
import { useState } from 'react'
import { Plus, Trash2, Archive, RefreshCw, Lock } from 'lucide-react'
import type { WorkspaceAssumptionsV2, WhatIfScenario, Scenario } from '../../domain/workspace'
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
import { SIMPLIFIED_PRESETS } from '../inputs/sections/feePresets'

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
}: Props) {
  // Guard against rapid double-clicks on the archive button.
  const [archiving, setArchiving] = useState(false)

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
    <div className="combine-sidebar">
      {/* ── Baseline header ───────────────────────────────────────── */}
      <div className="cds-baseline-header">
        <p className="cds-baseline-label">Baseline: dein aktueller Plan</p>
        <p className="cds-baseline-name">{baseline.label}</p>
      </div>

      {!hasContracts && (
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          Noch keine Verträge erfasst. Nutze die Bestandsaufnahme, um Verträge hinzuzufügen.
        </p>
      )}

      {hasContracts && (
        <>
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
        </>
      )}

      {/* ── What-if scenarios ─────────────────────────────────────── */}
      {whatIfs.length > 0 && (
        <div className="cds-whatifs-section">
          <p className="cds-whatifs-heading">Szenarien</p>
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
