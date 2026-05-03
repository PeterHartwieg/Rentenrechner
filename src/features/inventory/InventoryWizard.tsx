/**
 * InventoryWizard — combine-mode existing-portfolio entry (Group G issue 05).
 * Extended in issue 06 for multi-instance affordance.
 *
 * Full-screen modal overlay showing a 7-product checklist. Ticking a product
 * expands its inline InstanceCard (Layer 1 fields only). On exit the wizard
 * builds a v2 Workspace baseline, sets mode: 'combine', persists via
 * saveWorkspace(), and routes to the combine-mode dashboard.
 *
 * Multi-instance (issue 06): each product row (except GRV) can hold multiple
 * draft instances. "+ weitere {ProductLabel} hinzufügen" button appends a new
 * default draft. Each instance card shows a per-instance label field and an
 * "Entfernen" button (requires at least 2 instances to show; confirms on
 * click).
 *
 * Product order: GRV always first (universal), then PRIMARY_PRODUCT_IDS
 * (ETF, bAV, versicherung) then SECONDARY_PRODUCT_IDS (basisrente,
 * altersvorsorgedepot, riester) from triggers.ts. Rationale: GRV is the
 * baseline income for everyone; the primary products (ETF, bAV, pAV) are the
 * most commonly held; secondary products (Basisrente, AVD, Riester) are more
 * niche and appear below the fold to reduce visual noise.
 */

import './InventoryWizard.css'
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { X, Check, Plus, Trash2 } from 'lucide-react'
import type { Workspace } from '../../domain/workspace'
import type { EvidenceState } from '../../domain/instances'
import { saveWorkspace } from '../../storage'
import { buildWorkspaceFromDraft } from './inventoryHelpers'
import {
  GrvCard,
  BavCard,
  PavCard,
  RiesterCard,
  BasisrenteCard,
  AvdCard,
  EtfCard,
} from './InstanceCard'
import type {
  GrvDraft,
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  /** Profile data for seeding GRV estimation and Riester Zulagen. */
  grossSalaryYear: number
  childBirthYears: readonly number[]
  /** Called on successful exit with the new workspace. */
  onComplete: (workspace: Workspace) => void
  /** Called on dismiss without saving (close X, Escape, Abbrechen). */
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Default draft factory helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()

function defaultGrv(): GrvDraft {
  return {
    productId: 'grv',
    yearsWorked: 5,
    currentEntgeltpunkte: 5,
    useYearsEstimate: true,
  }
}

function defaultBav(n: number): BavDraft {
  return {
    productId: 'bav',
    instanceLabel: n > 1 ? `bAV #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    durchfuehrungsweg: 'direktversicherung_3_63',
    effektivkostenPct: 0,
    rentenfaktor: 30,
    payoutMode: 'leibrente',
  }
}

function defaultPav(n: number): PavDraft {
  return {
    productId: 'versicherung',
    instanceLabel: n > 1 ? `pAV #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 100,
    anbieter: undefined,
    effektivkostenPct: 0,
    rentenfaktor: 28,
    payoutMode: 'leibrente',
  }
}

function defaultRiester(n: number): RiesterDraft {
  return {
    productId: 'riester',
    instanceLabel: n > 1 ? `Riester #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 100,
    anbieter: undefined,
    payoutMode: 'leibrente',
    zulageStatus: '',
  }
}

function defaultBasisrente(n: number): BasisrenteDraft {
  return {
    productId: 'basisrente',
    instanceLabel: n > 1 ? `Basisrente #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    effektivkostenPct: 0,
    rentenfaktor: 28,
  }
}

function defaultAvd(n: number): AvdDraft {
  return {
    productId: 'altersvorsorgedepot',
    instanceLabel: n > 1 ? `AVD #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    subtype: 'standarddepot',
    useGlidepath: true,
  }
}

function defaultEtf(n: number): EtfDraft {
  return {
    productId: 'etf',
    instanceLabel: n > 1 ? `ETF #${n}` : undefined,
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    terPct: 0.2,
  }
}

// ---------------------------------------------------------------------------
// Product row metadata
// ---------------------------------------------------------------------------

interface ProductRowMeta {
  id: string
  name: string
  hint: string
  addLabel: string
}

const PRODUCT_ROWS: readonly ProductRowMeta[] = [
  {
    id: 'grv',
    name: 'Gesetzliche Rente (GRV)',
    hint: 'Deine Deutsche Rentenversicherung — immer dabei.',
    addLabel: '',
  },
  {
    id: 'etf',
    name: 'ETF-Sparplan',
    hint: 'Freies Depot oder Sparplan (ohne Versicherungsmantel).',
    addLabel: 'weiteres ETF-Depot hinzufügen',
  },
  {
    id: 'bav',
    name: 'Betriebliche Altersvorsorge (bAV)',
    hint: 'Über den Arbeitgeber abgeschlossene Entgeltumwandlung.',
    addLabel: 'weitere bAV hinzufügen',
  },
  {
    id: 'versicherung',
    name: 'Private Rentenversicherung (pAV)',
    hint: 'Klassische oder fondsgebundene Lebens-/Rentenversicherung.',
    addLabel: 'weitere pAV hinzufügen',
  },
  {
    id: 'basisrente',
    name: 'Basisrente (Rürup-Rente)',
    hint: 'Schicht-1-Rentenversicherung mit Sonderausgabenabzug.',
    addLabel: 'weitere Basisrente hinzufügen',
  },
  {
    id: 'altersvorsorgedepot',
    name: 'Altersvorsorgedepot (AVD)',
    hint: 'Gefördertes Depot (Altersvorsorgereformgesetz 2026).',
    addLabel: 'weiteres AVD hinzufügen',
  },
  {
    id: 'riester',
    name: 'Riester-Rente',
    hint: 'Zulagengeförderte Altersvorsorge (§10a EStG).',
    addLabel: 'weitere Riester hinzufügen',
  },
] as const

// Products where multi-instance is allowed (not GRV)
const MULTI_INSTANCE_PRODUCTS = new Set(['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'])

// ---------------------------------------------------------------------------
// ConfirmRemove dialog
// ---------------------------------------------------------------------------

function ConfirmRemoveDialog({
  productName,
  label,
  onConfirm,
  onCancel,
}: {
  productName: string
  label: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="inv-remove-dialog" role="alertdialog" aria-modal="true">
      <div className="inv-remove-dialog-card">
        <p className="inv-remove-dialog-msg">
          <strong>{label || productName}</strong> entfernen? Die eingegebenen Daten gehen verloren.
        </p>
        <div className="inv-remove-dialog-actions">
          <button type="button" className="inventory-btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="inv-btn-danger" onClick={onConfirm}>
            Entfernen
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InventoryWizard component
// ---------------------------------------------------------------------------

export function InventoryWizard({
  grossSalaryYear,
  childBirthYears,
  onComplete,
  onDismiss,
}: Props) {
  // GRV is always "checked" (read-only) — everyone has the statutory pension.
  const [checkedProducts, setCheckedProducts] = useState<Set<string>>(
    () => new Set(['grv']),
  )

  // Draft state: arrays for multi-instance, singleton for GRV.
  const [grvDraft, setGrvDraft] = useState<GrvDraft>(() => defaultGrv())
  const [bavDrafts, setBavDrafts] = useState<BavDraft[]>(() => [defaultBav(1)])
  const [pavDrafts, setPavDrafts] = useState<PavDraft[]>(() => [defaultPav(1)])
  const [riesterDrafts, setRiesterDrafts] = useState<RiesterDraft[]>(() => [defaultRiester(1)])
  const [basisrenteDrafts, setBasisrenteDrafts] = useState<BasisrenteDraft[]>(() => [defaultBasisrente(1)])
  const [avdDrafts, setAvdDrafts] = useState<AvdDraft[]>(() => [defaultAvd(1)])
  const [etfDrafts, setEtfDrafts] = useState<EtfDraft[]>(() => [defaultEtf(1)])

  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [removeConfirm, setRemoveConfirm] = useState<{
    productId: string
    index: number
    label: string
  } | null>(null)

  const isChecked = (id: string) => checkedProducts.has(id)

  function toggleProduct(id: string) {
    if (id === 'grv') return
    setCheckedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setValidationErrors([])
  }

  // Keyboard: Escape dismisses without saving
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (removeConfirm) {
          setRemoveConfirm(null)
        } else {
          onDismiss()
        }
      }
    },
    [onDismiss, removeConfirm],
  )

  // ---------------------------------------------------------------------------
  // Generic add/remove helpers
  // ---------------------------------------------------------------------------

  function addInstance(productId: string) {
    switch (productId) {
      case 'bav':
        setBavDrafts((prev) => [...prev, defaultBav(prev.length + 1)])
        break
      case 'versicherung':
        setPavDrafts((prev) => [...prev, defaultPav(prev.length + 1)])
        break
      case 'riester':
        setRiesterDrafts((prev) => [...prev, defaultRiester(prev.length + 1)])
        break
      case 'basisrente':
        setBasisrenteDrafts((prev) => [...prev, defaultBasisrente(prev.length + 1)])
        break
      case 'altersvorsorgedepot':
        setAvdDrafts((prev) => [...prev, defaultAvd(prev.length + 1)])
        break
      case 'etf':
        setEtfDrafts((prev) => [...prev, defaultEtf(prev.length + 1)])
        break
    }
  }

  function removeInstance(productId: string, index: number) {
    switch (productId) {
      case 'bav':
        setBavDrafts((prev) => prev.filter((_, i) => i !== index))
        break
      case 'versicherung':
        setPavDrafts((prev) => prev.filter((_, i) => i !== index))
        break
      case 'riester':
        setRiesterDrafts((prev) => prev.filter((_, i) => i !== index))
        break
      case 'basisrente':
        setBasisrenteDrafts((prev) => prev.filter((_, i) => i !== index))
        break
      case 'altersvorsorgedepot':
        setAvdDrafts((prev) => prev.filter((_, i) => i !== index))
        break
      case 'etf':
        setEtfDrafts((prev) => prev.filter((_, i) => i !== index))
        break
    }
  }

  // Per-instance label fallback ordering (issue 06 review):
  // 1. instanceLabel (user-typed)
  // 2. "${ProductLabel} ${anbieter}" when anbieter is set
  // 3. "${ProductLabel} #N" as final fallback
  function getLabelForInstance(productId: string, index: number): string {
    const n = index + 1
    switch (productId) {
      case 'bav': {
        const d = bavDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `bAV ${d.anbieter}` : `bAV #${n}`)
      }
      case 'versicherung': {
        const d = pavDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `pAV ${d.anbieter}` : `pAV #${n}`)
      }
      case 'riester': {
        const d = riesterDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `Riester ${d.anbieter}` : `Riester #${n}`)
      }
      case 'basisrente': {
        const d = basisrenteDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `Basisrente ${d.anbieter}` : `Basisrente #${n}`)
      }
      case 'altersvorsorgedepot': {
        const d = avdDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `AVD ${d.anbieter}` : `AVD #${n}`)
      }
      case 'etf': {
        const d = etfDrafts[index]
        return d?.instanceLabel ?? (d?.anbieter ? `ETF ${d.anbieter}` : `ETF #${n}`)
      }
      default: return `#${n}`
    }
  }

  function getInstanceCount(productId: string): number {
    switch (productId) {
      case 'bav': return bavDrafts.length
      case 'versicherung': return pavDrafts.length
      case 'riester': return riesterDrafts.length
      case 'basisrente': return basisrenteDrafts.length
      case 'altersvorsorgedepot': return avdDrafts.length
      case 'etf': return etfDrafts.length
      default: return 0
    }
  }

  // ---------------------------------------------------------------------------
  // Exit
  // ---------------------------------------------------------------------------

  function handleComplete() {
    const errors: string[] = []
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    const workspace = buildWorkspaceFromDraft({
      grvDraft,
      bavDraft: isChecked('bav') ? bavDrafts : null,
      pavDraft: isChecked('versicherung') ? pavDrafts : null,
      riesterDraft: isChecked('riester') ? riesterDrafts : null,
      basisrenteDraft: isChecked('basisrente') ? basisrenteDrafts : null,
      avdDraft: isChecked('altersvorsorgedepot') ? avdDrafts : null,
      etfDraft: isChecked('etf') ? etfDrafts : null,
      grossSalaryYear,
    })

    saveWorkspace(workspace)
    onComplete(workspace)
  }

  const anyContractChecked = checkedProducts.size > 1
  const buttonLabel = anyContractChecked ? 'Fertig & Vergleich starten' : 'Weiter ohne Verträge'

  // ---------------------------------------------------------------------------
  // Per-product instance card rendering
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // setEvidence helper — promotes a single draft field to user_confirmed
  // ---------------------------------------------------------------------------

  function makeSetEvidence<T extends { evidenceMap?: Record<string, EvidenceState> }>(
    setter: Dispatch<SetStateAction<T[]>>,
    index: number,
  ) {
    return (fieldPath: string, state: EvidenceState) => {
      setter((prev) => {
        const next = [...prev]
        const current = next[index]
        next[index] = {
          ...current,
          evidenceMap: { ...(current.evidenceMap ?? {}), [fieldPath]: state },
        }
        return next
      })
    }
  }

  function renderProductInstances(productId: string) {
    const count = getInstanceCount(productId)
    const canRemove = count > 1

    switch (productId) {
      case 'bav':
        return bavDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setBavDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <BavCard
              draft={draft}
              onChange={(next) =>
                setBavDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setBavDrafts, i)}
            />
          </div>
        ))

      case 'versicherung':
        return pavDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setPavDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <PavCard
              draft={draft}
              onChange={(next) =>
                setPavDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setPavDrafts, i)}
            />
          </div>
        ))

      case 'riester':
        return riesterDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setRiesterDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <RiesterCard
              draft={draft}
              onChange={(next) =>
                setRiesterDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setRiesterDrafts, i)}
              childBirthYears={childBirthYears}
            />
          </div>
        ))

      case 'basisrente':
        return basisrenteDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setBasisrenteDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <BasisrenteCard
              draft={draft}
              onChange={(next) =>
                setBasisrenteDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setBasisrenteDrafts, i)}
            />
          </div>
        ))

      case 'altersvorsorgedepot':
        return avdDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setAvdDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <AvdCard
              draft={draft}
              onChange={(next) =>
                setAvdDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setAvdDrafts, i)}
            />
          </div>
        ))

      case 'etf':
        return etfDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper">
            <InstanceHeader
              label={getLabelForInstance(productId, i)}
              instanceIndex={i}
              instanceCount={count}
              productId={productId}
              draft={draft}
              canRemove={canRemove}
              onLabelChange={(v) => {
                setEtfDrafts((prev) => {
                  const next = [...prev]
                  next[i] = { ...next[i], instanceLabel: v || undefined }
                  return next
                })
              }}
              onRemove={() => setRemoveConfirm({ productId, index: i, label: getLabelForInstance(productId, i) })}
            />
            <EtfCard
              draft={draft}
              onChange={(next) =>
                setEtfDrafts((prev) => {
                  const a = [...prev]; a[i] = next; return a
                })
              }
              setEvidence={makeSetEvidence(setEtfDrafts, i)}
            />
          </div>
        ))

      default:
        return null
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="inventory-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-wizard-heading"
      onKeyDown={handleKeyDown}
    >
      <div className="inventory-card">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="inventory-header">
          <div className="inventory-header-text">
            <p className="inventory-eyebrow">Bestandsaufnahme</p>
            <h2 id="inventory-wizard-heading" className="inventory-title">
              Was hast du schon?
            </h2>
          </div>
          <button
            type="button"
            className="inventory-close"
            onClick={onDismiss}
            aria-label="Bestandsaufnahme schließen"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="inventory-body">
          <p className="inventory-lede">
            Hak an, welche Altersvorsorge-Verträge du bereits hast. Für jeden Vertrag
            fragst du nur die wichtigsten Werte ab — alles andere schätzen wir für dich.
            Du kannst die Angaben jederzeit im Dashboard anpassen.
          </p>

          {validationErrors.length > 0 && (
            <ul className="inventory-validation-errors" role="alert">
              {validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          {PRODUCT_ROWS.map((row) => {
            const checked = isChecked(row.id)
            const isGrv = row.id === 'grv'
            const canMulti = MULTI_INSTANCE_PRODUCTS.has(row.id)
            return (
              <div
                key={row.id}
                className={`inventory-product-row${checked ? ' inventory-product-row--checked' : ''}`}
              >
                {/* Checkbox row */}
                <div
                  className="inventory-product-check"
                  onClick={!isGrv ? () => toggleProduct(row.id) : undefined}
                  style={isGrv ? { cursor: 'default' } : undefined}
                >
                  <input
                    type="checkbox"
                    id={`inventory-check-${row.id}`}
                    checked={checked}
                    readOnly={isGrv}
                    onChange={!isGrv ? () => toggleProduct(row.id) : undefined}
                    aria-label={`${row.name} einbeziehen`}
                  />
                  <label
                    htmlFor={`inventory-check-${row.id}`}
                    className="inventory-product-check-label"
                    onClick={!isGrv ? (e) => e.preventDefault() : undefined}
                    style={{ cursor: isGrv ? 'default' : 'pointer' }}
                  >
                    <span className="inventory-product-name">{row.name}</span>
                    <span className="inventory-product-hint">
                      {isGrv
                        ? 'Immer dabei — wir schätzen deine GRV-Rente.'
                        : row.hint}
                    </span>
                  </label>
                </div>

                {/* Expanded instance cards */}
                {checked && (
                  <>
                    {isGrv && (
                      <div className="inventory-instance-card" data-testid="instance-card-grv">
                        <GrvCard
                          draft={grvDraft}
                          onChange={setGrvDraft}
                          grossSalaryYear={grossSalaryYear}
                        />
                      </div>
                    )}

                    {!isGrv && (
                      <>
                        {renderProductInstances(row.id)}

                        {canMulti && (
                          <button
                            type="button"
                            className="inv-add-instance-btn"
                            onClick={() => addInstance(row.id)}
                          >
                            <Plus size={14} aria-hidden="true" />
                            + {row.addLabel}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Sticky footer ────────────────────────────────────────── */}
        <footer className="inventory-footer">
          <p className="inventory-footer-note">
            Keine Steuer-, Rechts- oder Anlageberatung. Diese Angaben dienen der
            Illustration.
          </p>
          <div className="inventory-footer-actions">
            <button
              type="button"
              className="inventory-btn-ghost"
              onClick={onDismiss}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="inventory-btn-primary"
              onClick={handleComplete}
            >
              <Check size={16} aria-hidden="true" />
              {buttonLabel}
            </button>
          </div>
        </footer>
      </div>

      {/* ── Remove confirmation dialog ─────────────────────────────── */}
      {removeConfirm && (
        <ConfirmRemoveDialog
          productName={removeConfirm.productId}
          label={removeConfirm.label}
          onConfirm={() => {
            removeInstance(removeConfirm.productId, removeConfirm.index)
            setRemoveConfirm(null)
          }}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InstanceHeader — per-instance label + remove button
// ---------------------------------------------------------------------------

interface InstanceHeaderProps {
  label: string
  instanceIndex: number
  instanceCount: number
  productId: string
  draft: { instanceLabel?: string; anbieter?: string }
  canRemove: boolean
  onLabelChange: (v: string) => void
  onRemove: () => void
}

function InstanceHeader({
  label,
  instanceCount,
  draft,
  canRemove,
  onLabelChange,
  onRemove,
}: InstanceHeaderProps) {
  if (instanceCount <= 1 && !canRemove) {
    // Single instance: no header needed (label edit optional but not cluttering)
    return null
  }

  return (
    <div className="inv-instance-header">
      <div className="inv-instance-label-wrap">
        <span className="inv-instance-label-prefix">Vertrag:</span>
        <input
          type="text"
          className="inv-instance-label-input"
          value={draft.instanceLabel ?? draft.anbieter ?? label}
          placeholder={label}
          aria-label="Vertragsbezeichnung"
          onChange={(e) => onLabelChange(e.target.value)}
        />
      </div>
      {canRemove && (
        <button
          type="button"
          className="inv-remove-btn"
          onClick={onRemove}
          aria-label="Diesen Vertrag entfernen"
          title="Vertrag entfernen"
        >
          <Trash2 size={14} aria-hidden="true" />
          Entfernen
        </button>
      )}
    </div>
  )
}
