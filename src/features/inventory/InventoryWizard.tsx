/**
 * InventoryWizard — combine-mode existing-portfolio entry (Group G issue 05).
 *
 * Full-screen modal overlay showing a 7-product checklist. Ticking a product
 * expands its inline InstanceCard (Layer 1 fields only). On exit the wizard
 * builds a v2 Workspace baseline, sets mode: 'combine', persists via
 * saveWorkspace(), and routes to the combine-mode dashboard.
 *
 * Product order: GRV always first (universal), then PRIMARY_PRODUCT_IDS
 * (ETF, bAV, versicherung) then SECONDARY_PRODUCT_IDS (basisrente,
 * altersvorsorgedepot, riester) from triggers.ts. Rationale: GRV is the
 * baseline income for everyone; the primary products (ETF, bAV, pAV) are the
 * most commonly held; secondary products (Basisrente, AVD, Riester) are more
 * niche and appear below the fold to reduce visual noise.
 *
 * Out of scope: multi-instance (issue 06), evidence badges (issue 09),
 * auto-pinned baseline mechanics (issue 07).
 */

import './InventoryWizard.css'
import { useCallback, useState } from 'react'
import { X, Check } from 'lucide-react'
import type { Workspace } from '../../domain/workspace'
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

function defaultBav(): BavDraft {
  return {
    productId: 'bav',
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

function defaultPav(): PavDraft {
  return {
    productId: 'versicherung',
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

function defaultRiester(): RiesterDraft {
  return {
    productId: 'riester',
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 100,
    anbieter: undefined,
    payoutMode: 'leibrente',
    zulageStatus: '',
  }
}

function defaultBasisrente(): BasisrenteDraft {
  return {
    productId: 'basisrente',
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    effektivkostenPct: 0,
    rentenfaktor: 28,
  }
}

function defaultAvd(): AvdDraft {
  return {
    productId: 'altersvorsorgedepot',
    status: 'active',
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    subtype: 'standarddepot',
    useGlidepath: true,
  }
}

function defaultEtf(): EtfDraft {
  return {
    productId: 'etf',
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
// Product order: GRV first (always-on), then PRIMARY (ETF, bAV, versicherung),
// then SECONDARY (basisrente, altersvorsorgedepot, riester).
// ---------------------------------------------------------------------------

interface ProductRowMeta {
  id: string
  name: string
  hint: string
}

const PRODUCT_ROWS: readonly ProductRowMeta[] = [
  {
    id: 'grv',
    name: 'Gesetzliche Rente (GRV)',
    hint: 'Deine Deutsche Rentenversicherung — immer dabei.',
  },
  {
    id: 'etf',
    name: 'ETF-Sparplan',
    hint: 'Freies Depot oder Sparplan (ohne Versicherungsmantel).',
  },
  {
    id: 'bav',
    name: 'Betriebliche Altersvorsorge (bAV)',
    hint: 'Über den Arbeitgeber abgeschlossene Entgeltumwandlung.',
  },
  {
    id: 'versicherung',
    name: 'Private Rentenversicherung (pAV)',
    hint: 'Klassische oder fondsgebundene Lebens-/Rentenversicherung.',
  },
  {
    id: 'basisrente',
    name: 'Basisrente (Rürup-Rente)',
    hint: 'Schicht-1-Rentenversicherung mit Sonderausgabenabzug.',
  },
  {
    id: 'altersvorsorgedepot',
    name: 'Altersvorsorgedepot (AVD)',
    hint: 'Gefördertes Depot (Altersvorsorgereformgesetz 2026).',
  },
  {
    id: 'riester',
    name: 'Riester-Rente',
    hint: 'Zulagengeförderte Altersvorsorge (§10a EStG).',
  },
] as const

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

  const [grvDraft, setGrvDraft] = useState<GrvDraft>(() => defaultGrv())
  const [bavDraft, setBavDraft] = useState<BavDraft>(() => defaultBav())
  const [pavDraft, setPavDraft] = useState<PavDraft>(() => defaultPav())
  const [riesterDraft, setRiesterDraft] = useState<RiesterDraft>(() => defaultRiester())
  const [basisrenteDraft, setBasisrenteDraft] = useState<BasisrenteDraft>(
    () => defaultBasisrente(),
  )
  const [avdDraft, setAvdDraft] = useState<AvdDraft>(() => defaultAvd())
  const [etfDraft, setEtfDraft] = useState<EtfDraft>(() => defaultEtf())

  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const isChecked = (id: string) => checkedProducts.has(id)

  function toggleProduct(id: string) {
    if (id === 'grv') return // GRV is always on
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
      if (e.key === 'Escape') onDismiss()
    },
    [onDismiss],
  )

  function handleComplete() {
    // Validation hook: spec says wizard defaults are always valid; this
    // is an extension point for future anchor-field checks.
    const errors: string[] = []
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    const workspace = buildWorkspaceFromDraft({
      grvDraft,
      bavDraft: isChecked('bav') ? bavDraft : null,
      pavDraft: isChecked('versicherung') ? pavDraft : null,
      riesterDraft: isChecked('riester') ? riesterDraft : null,
      basisrenteDraft: isChecked('basisrente') ? basisrenteDraft : null,
      avdDraft: isChecked('altersvorsorgedepot') ? avdDraft : null,
      etfDraft: isChecked('etf') ? etfDraft : null,
      grossSalaryYear,
    })

    saveWorkspace(workspace)
    onComplete(workspace)
  }

  // Label changes when user has no contracts beyond GRV (Anna path)
  const anyContractChecked = checkedProducts.size > 1
  const buttonLabel = anyContractChecked ? 'Fertig & Vergleich starten' : 'Weiter ohne Verträge'

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

                {/* Expanded instance card (Layer 1 only) */}
                {checked && (
                  <>
                    {row.id === 'grv' && (
                      <GrvCard
                        draft={grvDraft}
                        onChange={setGrvDraft}
                        grossSalaryYear={grossSalaryYear}
                      />
                    )}
                    {row.id === 'bav' && (
                      <BavCard draft={bavDraft} onChange={setBavDraft} />
                    )}
                    {row.id === 'versicherung' && (
                      <PavCard draft={pavDraft} onChange={setPavDraft} />
                    )}
                    {row.id === 'riester' && (
                      <RiesterCard
                        draft={riesterDraft}
                        onChange={setRiesterDraft}
                        childBirthYears={childBirthYears}
                      />
                    )}
                    {row.id === 'basisrente' && (
                      <BasisrenteCard
                        draft={basisrenteDraft}
                        onChange={setBasisrenteDraft}
                      />
                    )}
                    {row.id === 'altersvorsorgedepot' && (
                      <AvdCard draft={avdDraft} onChange={setAvdDraft} />
                    )}
                    {row.id === 'etf' && (
                      <EtfCard draft={etfDraft} onChange={setEtfDraft} />
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
    </div>
  )
}
