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
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { FocusTrap } from '../../ui/FocusTrap'
import { ModalSlot } from '../../ui/chrome/ModalSlot'
import { useFeedbackTarget, qaTarget, useQaMode } from '../../features/qa-feedback'
import { Check, Plus, Trash2, ArrowRight } from 'lucide-react'
import type { Workspace } from '../../domain/workspace'
import type { EvidenceState } from '../../domain/instances'
import type { ProductId } from '../../engine/productRegistry'
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
  PersonalDetailsDraft,
  PensionBaseline,
} from './types'
import { NumberField } from '../../ui/NumberField'
import { InfoTip } from '../../ui/InfoTip'
import { VintageChips } from './VintageChips'
import {
  bavDraftVintageAtoms,
  pavDraftVintageAtoms,
  riesterDraftVintageAtoms,
} from './vintageChipsUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wizard step: 0 = personal details, 1 = product checklist. */
type WizardStep = 0 | 1

interface Props {
  /** Profile data for seeding GRV estimation and Riester Zulagen. */
  grossSalaryYear: number
  childBirthYears: readonly number[]
  /** Current age and retirement age — used to compute pAV runtime years for vintage chips. */
  age: number
  retirementAge: number
  /** GKV vs PKV — seeds the step-0 KV select. */
  publicHealthInsurance: boolean
  /**
   * Optional product seed (issue #13 topic preselection): when supplied, the
   * wizard's product checklist mounts with these products' rows pre-checked,
   * so a topic-page deep-link (e.g. `/?topic=etf-vs-bav`) lands the user on
   * a wizard with bAV + ETF (and any others in the list) already enabled.
   *
   * GRV is universally checked and cannot be unchecked — it is implicit and
   * does not need to appear in this list. Only non-GRV product ids are
   * honoured; unknown ids are silently ignored. Defaults to no preselection
   * (GRV-only checked) when `undefined`.
   */
  initialEnabledProducts?: readonly ProductId[]
  /** Called on successful exit with the new workspace. */
  onComplete: (workspace: Workspace) => void
  /** Called on dismiss without saving (close X, Escape, Abbrechen). */
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Default draft factory helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()
const MAX_PLANNED_CHILD_YEAR = CURRENT_YEAR + 20

// ---------------------------------------------------------------------------
// Default personal details factory (step 0)
// ---------------------------------------------------------------------------

function defaultPersonalDetails(
  seedAge: number,
  seedRetirementAge: number,
  seedGrossSalaryYear: number,
  seedPublicHealthInsurance: boolean,
  seedChildBirthYears: readonly number[],
): PersonalDetailsDraft {
  return {
    birthYear: CURRENT_YEAR - seedAge,
    grossSalaryYear: seedGrossSalaryYear,
    ehegattensplitting: false,
    retirementAge: seedRetirementAge,
    publicHealthInsurance: seedPublicHealthInsurance,
    childBirthYears: [...seedChildBirthYears],
    pensionBaseline: 'grv',
    manualMonthlyGrossPension: 0,
  }
}

// ---------------------------------------------------------------------------
// PersonalDetailsStep — step 0 of the wizard
// ---------------------------------------------------------------------------

interface PersonalDetailsStepProps {
  draft: PersonalDetailsDraft
  onChange: (next: PersonalDetailsDraft) => void
  onNext: () => void
  onDismiss: () => void
}

function PersonalDetailsStep({ draft, onChange, onNext, onDismiss }: PersonalDetailsStepProps) {
  const derivedAge = CURRENT_YEAR - draft.birthYear
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const { targetProps: nextBtnTargetProps } = useFeedbackTarget({
    id: 'inventory.wizard.step0.primaryCta',
    label: 'Weiter zu deinen Verträgen',
  })

  // Wrap onChange so any user edit clears stale validation messages immediately.
  const handleChange = useCallback(
    (next: PersonalDetailsDraft) => {
      setValidationErrors([])
      onChange(next)
    },
    [onChange],
  )

  function validate(): string[] {
    const errors: string[] = []
    if (!Number.isInteger(draft.birthYear) || draft.birthYear < 1900 || draft.birthYear > CURRENT_YEAR - 10) {
      errors.push('Bitte gib ein gültiges Geburtsjahr an (mind. 10 Jahre zurück).')
    }
    if (!Number.isFinite(draft.grossSalaryYear) || draft.grossSalaryYear < 0) {
      errors.push('Bitte gib ein gültiges Bruttogehalt an.')
    }
    if (!Number.isInteger(draft.retirementAge) || draft.retirementAge < derivedAge + 1 || draft.retirementAge > 85) {
      errors.push('Wunschrente-Alter muss nach dem aktuellen Alter und vor 85 liegen.')
    }
    for (const y of draft.childBirthYears) {
      if (!Number.isInteger(y) || y < 1950 || y > MAX_PLANNED_CHILD_YEAR) {
        errors.push(`Geburtsjahre der Kinder müssen zwischen 1950 und ${MAX_PLANNED_CHILD_YEAR} liegen.`)
        break
      }
    }
    return errors
  }

  function handleNext() {
    const errors = validate()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    onNext()
  }

  function addChild() {
    handleChange({
      ...draft,
      childBirthYears: [...draft.childBirthYears, CURRENT_YEAR - 5],
    })
  }

  function updateChild(index: number, year: number) {
    const next = [...draft.childBirthYears]
    next[index] = year
    handleChange({ ...draft, childBirthYears: next })
  }

  function removeChild(index: number) {
    handleChange({
      ...draft,
      childBirthYears: draft.childBirthYears.filter((_, i) => i !== index),
    })
  }

  const showManualPension = draft.pensionBaseline !== 'grv'

  return (
    <div data-testid="personal-details-step">
      <div className="inventory-body">
        <p className="inventory-lede">
          Diese Angaben fließen in alle Berechnungen ein.
        </p>

        {/* Section: Persönliches */}
        <div className="inventory-instance-card">
          <p className="inventory-instance-section-heading">Persönliche Angaben</p>

          <div className="inventory-field-grid">
            <div className="inventory-field">
              <NumberField
                label="Geburtsjahr"
                value={draft.birthYear}
                min={1940}
                max={CURRENT_YEAR - 10}
                step={1}
                decimals={0}
                onCommit={(v) => handleChange({ ...draft, birthYear: Number(v) })}
              />
              {Number.isFinite(derivedAge) && derivedAge >= 0 && derivedAge <= 110 && (
                <p className="inventory-field-hint">Aktuelles Alter: {derivedAge} Jahre</p>
              )}
            </div>

            <div className="inventory-field">
              <NumberField
                label="Bruttogehalt pro Jahr"
                value={draft.grossSalaryYear}
                min={0}
                max={2_000_000}
                step={1000}
                decimals={0}
                suffix="€"
                onCommit={(v) => handleChange({ ...draft, grossSalaryYear: Number(v) })}
              />
            </div>

            <div className="inventory-field">
              <NumberField
                label="Gewünschtes Renteneintrittsalter"
                value={draft.retirementAge}
                min={50}
                max={85}
                step={1}
                decimals={0}
                suffix="Jahre"
                onCommit={(v) => handleChange({ ...draft, retirementAge: Number(v) })}
              />
            </div>

            <div className="inventory-field" data-testid="field-public-health-insurance">
              <label htmlFor="step0-kv">Krankenversicherung</label>
              <div className="inventory-select-shell">
                <select
                  id="step0-kv"
                  value={draft.publicHealthInsurance ? 'gkv' : 'pkv'}
                  onChange={(e) =>
                    handleChange({ ...draft, publicHealthInsurance: e.target.value === 'gkv' })
                  }
                >
                  <option value="gkv">Gesetzlich (GKV)</option>
                  <option value="pkv">Privat (PKV)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Familie */}
        <div className="inventory-instance-card">
          <p className="inventory-instance-section-heading">Familie</p>

          <div className="inventory-field" data-testid="field-ehegattensplitting">
            <label className="field-inline">
              <input
                type="checkbox"
                checked={draft.ehegattensplitting}
                onChange={(e) => handleChange({ ...draft, ehegattensplitting: e.target.checked })}
                aria-label="Ehegattensplitting / gemeinsame Veranlagung"
              />
              <span>Ehegattensplitting (gemeinsame Veranlagung)</span>
              <InfoTip text="Bei aktiviertem Splitting wird das gemeinsam zu versteuernde Einkommen nach §32a Abs. 5 EStG halbiert besteuert. Eine Steuerklassen-Auswahl ist bei Zusammenveranlagung nicht erforderlich. Die Auswirkungen erscheinen automatisch in den Ergebnissen unten." />
            </label>
          </div>

          <div className="inventory-field" data-testid="field-children">
            <label>Kinder</label>
            {draft.childBirthYears.length === 0 && (
              <p className="inventory-field-hint">
                Keine Kinder angegeben. Kinder beeinflussen Riester-Zulagen und
                den Pflegeversicherungs-Beitrag.
              </p>
            )}
            {draft.childBirthYears.map((year, i) => (
              <div key={i} className="inventory-child-row">
                <NumberField
                  label={`Geburtsjahr Kind ${i + 1}${year > CURRENT_YEAR ? ' (geplant)' : ''}`}
                  value={year}
                  min={1950}
                  max={MAX_PLANNED_CHILD_YEAR}
                  step={1}
                  decimals={0}
                  onCommit={(v) => updateChild(i, Number(v))}
                />
                <button
                  type="button"
                  className="inv-remove-btn"
                  onClick={() => removeChild(i)}
                  aria-label={`Kind ${i + 1} entfernen`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Entfernen
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inv-add-instance-btn"
              onClick={addChild}
            >
              <Plus size={14} aria-hidden="true" />
              Kind hinzufügen
            </button>
          </div>
        </div>

        {/* Section: Rentenbasis */}
        <div className="inventory-instance-card">
          <p className="inventory-instance-section-heading">Gesetzliche Altersvorsorge</p>

          <div className="inventory-field" data-testid="field-pension-baseline">
            <label htmlFor="step0-pension-baseline">Welches System gilt für dich?</label>
            <div className="inventory-select-shell">
              <select
                id="step0-pension-baseline"
                value={draft.pensionBaseline}
                onChange={(e) =>
                  handleChange({
                    ...draft,
                    pensionBaseline: e.target.value as PensionBaseline,
                  })
                }
              >
                <option value="grv">Gesetzliche Rente (DRV)</option>
                <option value="beamtenpension">Beamtenpension</option>
                <option value="versorgungswerk">Berufsständisches Versorgungswerk</option>
              </select>
            </div>
            <p className="inventory-field-hint">
              {draft.pensionBaseline === 'grv'
                ? 'Du bist sozialversicherungspflichtig beschäftigt. Wir schätzen deine GRV-Rente im nächsten Schritt.'
                : draft.pensionBaseline === 'beamtenpension'
                  ? 'Beamtenversorgung nach BeamtVG. Schicht-1-bAV/Riester entfallen, Basisrente bleibt möglich.'
                  : 'Versorgungswerk (Ärzte, Anwälte, Architekten, …). GRV-Pflicht entfällt; Sonderausgabenabzug Schicht 1 wie GRV.'}
            </p>
          </div>

          {showManualPension && (
            <div className="inventory-field">
              <NumberField
                label="Geschätzte Brutto-Versorgung pro Monat"
                value={draft.manualMonthlyGrossPension}
                min={0}
                max={20_000}
                step={50}
                decimals={0}
                suffix="€/Monat"
                onCommit={(v) =>
                  handleChange({ ...draft, manualMonthlyGrossPension: Number(v) })
                }
              />
              <p className="inventory-field-hint">
                Aus deiner letzten Versorgungsauskunft — 0 lassen, wenn unbekannt.
              </p>
            </div>
          )}
        </div>

        {validationErrors.length > 0 && (
          <ul
            className="inventory-validation-errors"
            role="alert"
            aria-live="polite"
            data-testid="personal-details-errors"
          >
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

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
            onClick={handleNext}
            {...nextBtnTargetProps}
          >
            Weiter zu deinen Verträgen
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </div>
  )
}

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
    effektivkostenPct: 0.8,
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
    effektivkostenPct: 0.8,
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
    effektivkostenPct: 0.8,
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
    annualContributionGrowthRate: 0,
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
    <FocusTrap onEscape={onCancel}>
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
    </FocusTrap>
  )
}

// ---------------------------------------------------------------------------
// InventoryWizard component
// ---------------------------------------------------------------------------

export function InventoryWizard({
  grossSalaryYear,
  childBirthYears,
  age,
  retirementAge,
  publicHealthInsurance,
  initialEnabledProducts,
  onComplete,
  onDismiss,
}: Props) {
  // Step 0 = personal details; step 1 = product checklist.
  const [step, setStep] = useState<WizardStep>(0)

  // When the step changes, scroll the ModalSlot body container back to the top
  // so the user lands on the new step's first field. The step-content wrapper
  // is mounted inside ModalSlot's `.rw-modal-slot__body` (the scroll
  // container); we resolve the ancestor at effect time. ModalSlot's title
  // updates per step, so screen-readers get the change through aria-labelledby
  // on the dialog panel — no inner heading focus dance needed.
  const stepContentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scrollHost = stepContentRef.current?.closest<HTMLElement>(
      '.rw-modal-slot__body',
    )
    if (scrollHost && typeof scrollHost.scrollTo === 'function') {
      scrollHost.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [step])

  // Step 0 draft — seeded from parent props so the wizard is pre-filled when
  // the user has already set profile values in compare-mode.
  const [personalDetails, setPersonalDetails] = useState<PersonalDetailsDraft>(
    () =>
      defaultPersonalDetails(
        age,
        retirementAge,
        grossSalaryYear,
        publicHealthInsurance,
        childBirthYears,
      ),
  )

  // Derived values from personalDetails (used in product step for vintage chips etc.)
  const effectiveAge = CURRENT_YEAR - personalDetails.birthYear
  const effectiveRetirementAge = personalDetails.retirementAge

  // GRV is always "checked" (read-only) — everyone has the statutory pension.
  // Issue #13: when `initialEnabledProducts` is supplied via topic-preselection,
  // those product rows arrive pre-checked. GRV stays implicitly checked. The
  // checklist render below filters by known PRODUCT_ROWS ids, so any unknown
  // string in the seed is silently ignored.
  const [checkedProducts, setCheckedProducts] = useState<Set<string>>(
    () => {
      const seed = new Set<string>(['grv'])
      if (initialEnabledProducts) {
        for (const id of initialEnabledProducts) {
          seed.add(id)
        }
      }
      return seed
    },
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

  const { enabled: qaEnabled } = useQaMode()
  const { targetProps: dialogTargetProps } = useFeedbackTarget({
    id: 'inventory.wizard.dialog',
    label: 'Bestandsaufnahme',
    precision: 'section',
  })
  const { targetProps: stepContainerTargetProps } = useFeedbackTarget({
    id: `inventory.wizard.step${step}`,
    label: step === 0 ? 'Schritt 1: Persönliche Angaben' : 'Schritt 2: Vertragsauswahl',
    precision: 'section',
  })
  // Step 1 finish button. Step 0 button is instrumented directly in PersonalDetailsStep.
  const { targetProps: primaryCtaTargetProps } = useFeedbackTarget({
    id: 'inventory.wizard.step1.primaryCta',
    label: 'Fertig & Vergleich starten',
  })

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

  // Keyboard: Escape dismisses without saving (passed to FocusTrap as onEscape).
  // When the ConfirmRemoveDialog is open its own FocusTrap handles Escape first
  // (closing the confirm), and this callback is also called but is idempotent
  // (setRemoveConfirm(null) on an already-null state is a no-op).
  const handleEscape = useCallback(
    () => {
      if (removeConfirm) {
        setRemoveConfirm(null)
      } else {
        onDismiss()
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
      grossSalaryYear: personalDetails.grossSalaryYear,
      personalDetails,
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

  type EvidenceBackedDraft = {
    evidenceMap?: Record<string, EvidenceState>
    contractStartYear?: number
    currentValueEUR?: number
    effektivkostenPct?: number
    feeDetails?: unknown
    rentenfaktor?: number
    terPct?: number
  }

  function valueChanged(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return false
    if (typeof a === 'object' || typeof b === 'object') {
      return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
    }
    return true
  }

  function confirmedEvidenceForChangedValues<T extends EvidenceBackedDraft>(
    current: T,
    nextDraft: T,
  ): Record<string, EvidenceState> {
    const confirmed: Record<string, EvidenceState> = {}
    if (valueChanged(current.contractStartYear, nextDraft.contractStartYear)) {
      confirmed.contractStartYear = 'user_confirmed'
    }
    if (valueChanged(current.currentValueEUR, nextDraft.currentValueEUR)) {
      confirmed.currentValueEUR = 'user_confirmed'
    }
    if (
      valueChanged(current.effektivkostenPct, nextDraft.effektivkostenPct) ||
      valueChanged(current.feeDetails, nextDraft.feeDetails)
    ) {
      confirmed['fees.wrapperAssetFee'] = 'user_confirmed'
    }
    if (valueChanged(current.rentenfaktor, nextDraft.rentenfaktor)) {
      confirmed.rentenfaktor = 'user_confirmed'
    }
    if (valueChanged(current.terPct, nextDraft.terPct)) {
      confirmed.annualAssetFee = 'user_confirmed'
    }
    return confirmed
  }

  function makeSetEvidence<T extends EvidenceBackedDraft>(
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

  function makeDraftChange<T extends EvidenceBackedDraft>(
    setter: Dispatch<SetStateAction<T[]>>,
    index: number,
  ) {
    return (nextDraft: T) => {
      setter((prev) => {
        const next = [...prev]
        const current = next[index]
        next[index] = {
          ...nextDraft,
          evidenceMap: {
            ...(nextDraft.evidenceMap ?? {}),
            ...(current.evidenceMap ?? {}),
            ...confirmedEvidenceForChangedValues(current, nextDraft),
          },
        }
        return next
      })
    }
  }

  /** Returns QA target props for an instance wrapper inside the wizard step. */
  function instanceWrapperQaProps(productId: string, index: number) {
    return qaTarget(qaEnabled, `inventory.wizard.instance.${productId}.${index}`, {
      label: getLabelForInstance(productId, index),
      precision: 'section',
    })
  }

  function renderProductInstances(productId: string) {
    const count = getInstanceCount(productId)
    const canRemove = count > 1

    switch (productId) {
      case 'bav':
        return bavDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
            <VintageChips atoms={bavDraftVintageAtoms(draft, effectiveAge, effectiveRetirementAge)} />
            <BavCard
              draft={draft}
              onChange={makeDraftChange(setBavDrafts, i)}
              setEvidence={makeSetEvidence(setBavDrafts, i)}
            />
          </div>
        ))

      case 'versicherung':
        return pavDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
            <VintageChips atoms={pavDraftVintageAtoms(draft, effectiveAge, effectiveRetirementAge)} />
            <PavCard
              draft={draft}
              onChange={makeDraftChange(setPavDrafts, i)}
              setEvidence={makeSetEvidence(setPavDrafts, i)}
            />
          </div>
        ))

      case 'riester':
        return riesterDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
            <VintageChips atoms={riesterDraftVintageAtoms(draft, personalDetails.childBirthYears, effectiveAge, effectiveRetirementAge)} />
            <RiesterCard
              draft={draft}
              onChange={makeDraftChange(setRiesterDrafts, i)}
              setEvidence={makeSetEvidence(setRiesterDrafts, i)}
              childBirthYears={personalDetails.childBirthYears}
            />
          </div>
        ))

      case 'basisrente':
        return basisrenteDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
              onChange={makeDraftChange(setBasisrenteDrafts, i)}
              setEvidence={makeSetEvidence(setBasisrenteDrafts, i)}
            />
          </div>
        ))

      case 'altersvorsorgedepot':
        return avdDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
              onChange={makeDraftChange(setAvdDrafts, i)}
              setEvidence={makeSetEvidence(setAvdDrafts, i)}
            />
          </div>
        ))

      case 'etf':
        return etfDrafts.map((draft, i) => (
          <div key={i} className="inv-instance-wrapper" {...instanceWrapperQaProps(productId, i)}>
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
              onChange={makeDraftChange(setEtfDrafts, i)}
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

  // Step-specific header text
  const headingText = step === 0 ? 'Deine Angaben' : 'Was hast du schon?'
  const eyebrowText = step === 0 ? 'Schritt 1 von 2' : 'Schritt 2 von 2'

  return (
    <>
      <ModalSlot
        open
        onClose={handleEscape}
        title={headingText}
        eyebrow={eyebrowText}
        closeLabel="Bestandsaufnahme schließen"
        panelClassName="inventory-modal"
      >
        <div
          ref={stepContentRef}
          className="inventory-step-content"
          {...dialogTargetProps}
        >
          {/* ── Step 0: personal details ──────────────────────────────── */}
          {step === 0 && (
            <div {...stepContainerTargetProps}>
              <PersonalDetailsStep
                draft={personalDetails}
                onChange={setPersonalDetails}
                onNext={() => setStep(1)}
                onDismiss={onDismiss}
              />
            </div>
          )}

          {/* ── Step 1: product checklist ─────────────────────────────── */}
          {step === 1 && (
            <>
              {/* ── Body ─────────────────────────────────────────────────── */}
              <div className="inventory-body" {...stepContainerTargetProps}>
                <p className="inventory-lede">
                  Welche Verträge hast du bereits? Nur die wichtigsten Werte — den Rest schätzen wir.
                </p>

                {validationErrors.length > 0 && (
                  <ul className="inventory-validation-errors" role="alert">
                    {validationErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}

                {PRODUCT_ROWS.map((row) => {
                  const isGrv = row.id === 'grv'
                  // GRV row only relevant when the user picked "Gesetzliche Rente" as
                  // baseline. Beamtenpension and Versorgungswerk replace GRV — the
                  // estimate from step 0's manualMonthlyGrossPension feeds the engine
                  // instead.
                  if (isGrv && personalDetails.pensionBaseline !== 'grv') {
                    return null
                  }
                  const checked = isChecked(row.id)
                  const canMulti = MULTI_INSTANCE_PRODUCTS.has(row.id)
                  return (
                    <div
                      key={row.id}
                      className={`inventory-product-row${checked ? ' inventory-product-row--checked' : ''}`}
                      {...qaTarget(qaEnabled, `inventory.wizard.productRow.${row.id}`, { label: row.name })}
                    >
                      {/* Checkbox row — label wraps input so the entire row is clickable */}
                      <label
                        htmlFor={`inventory-check-${row.id}`}
                        className="inventory-product-check"
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
                        <span className="inventory-product-check-label">
                          <span className="inventory-product-name">{row.name}</span>
                          <span className="inventory-product-hint">
                            {isGrv
                              ? 'Immer dabei — wir schätzen deine GRV-Rente.'
                              : row.hint}
                          </span>
                        </span>
                      </label>

                      {/* Expanded instance cards */}
                      {checked && (
                        <>
                          {isGrv && (
                            <div className="inventory-instance-card" data-testid="instance-card-grv">
                              <GrvCard
                                draft={grvDraft}
                                onChange={setGrvDraft}
                                grossSalaryYear={personalDetails.grossSalaryYear}
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
                                  {row.addLabel}
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
                    {...primaryCtaTargetProps}
                  >
                    <Check size={16} aria-hidden="true" />
                    {buttonLabel}
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </ModalSlot>

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
    </>
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
  productId,
  draft,
  canRemove,
  onLabelChange,
  onRemove,
}: InstanceHeaderProps) {
  if (instanceCount <= 1 && !canRemove) {
    // Single instance: no header needed (label edit optional but not cluttering)
    return null
  }

  const isEtf = productId === 'etf'
  const labelPrefix = isEtf ? 'Depot:' : 'Vertrag:'
  const ariaLabel = isEtf ? 'Depotbezeichnung' : 'Vertragsbezeichnung'
  const removeAriaLabel = isEtf ? 'Dieses Depot entfernen' : 'Diesen Vertrag entfernen'
  const removeTitle = isEtf ? 'Depot entfernen' : 'Vertrag entfernen'

  return (
    <div className="inv-instance-header">
      <div className="inv-instance-label-wrap">
        <span className="inv-instance-label-prefix">{labelPrefix}</span>
        <input
          type="text"
          className="inv-instance-label-input"
          value={draft.instanceLabel ?? draft.anbieter ?? label}
          placeholder={label}
          aria-label={ariaLabel}
          onChange={(e) => onLabelChange(e.target.value)}
        />
      </div>
      {canRemove && (
        <button
          type="button"
          className="inv-remove-btn"
          onClick={onRemove}
          aria-label={removeAriaLabel}
          title={removeTitle}
        >
          <Trash2 size={14} aria-hidden="true" />
          Entfernen
        </button>
      )}
    </div>
  )
}
