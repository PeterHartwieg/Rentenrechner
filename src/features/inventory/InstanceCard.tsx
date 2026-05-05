/**
 * InstanceCard — per-product Layer 1 + Layer 3 field card for the InventoryWizard.
 *
 * Layer 1: anchor + high-impact fields (visible immediately).
 * Layer 3: expandable <details> block with fee decomposition, Beitragsdynamik,
 *   KVdR/freiwillig hint (derived from profile), statutory subsidy split (bAV),
 *   and vintage auto-detection chips.
 *
 * Layer 2 evidence badges are deferred to issue 09.
 *
 * Defaulted / estimated fields are annotated with a "🤔 Schätzung" note per
 * PRD G1 / spec acceptance criterion. The emoji is spec-mandated UX copy —
 * it appears ONLY in user-visible placeholder text, not elsewhere (CLAUDE.md).
 */

import { useState } from 'react'
import type { FeeModel } from '../../domain/fees'
import type { BavDurchfuehrungsweg } from '../../domain/products/bav'
import type { AltersvorsorgedepotSubtype } from '../../domain/products/altersvorsorgedepot'
import type { EvidenceState } from '../../domain/instances'
import type {
  InstanceStatus,
  ProductDraftState,
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
  GrvDraft,
} from './types'
import { estimateEpFromYears } from './inventoryHelpers'
import { VintageChips } from './VintageChips'
import type { Atom } from '../../app/recommendations'
import { FeeSection, type FeeInputMode } from '../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../inputs/sections/BeitragsdynamikField'
import { EvidenceBadge } from './EvidenceBadge'
import { InvField, InvNumber, InvSelect, InvText } from './fields'
import { DFW_OPTIONS, PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL } from './fieldHelpers'

// ---------------------------------------------------------------------------
// Internal shared primitives
// ---------------------------------------------------------------------------

interface BaseProps<T extends ProductDraftState> {
  draft: T
  onChange: (next: T) => void
  setEvidence?: (fieldPath: string, state: EvidenceState) => void
}

function evidenceState(
  draft: ProductDraftState,
  fieldPath: string,
): EvidenceState {
  return draft.evidenceMap?.[fieldPath] ?? 'model_estimate'
}

function hasEvidenceState(draft: ProductDraftState, fieldPath: string): boolean {
  return Object.prototype.hasOwnProperty.call(draft.evidenceMap ?? {}, fieldPath)
}

function shouldRenderEvidenceBadge(
  draft: ProductDraftState,
  fieldPath: string,
  isEmptyPlaceholder = false,
): boolean {
  return hasEvidenceState(draft, fieldPath) || !isEmptyPlaceholder
}

const STATUS_OPTIONS: readonly { value: InstanceStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv (laufende Beiträge)' },
  { value: 'paid_up', label: 'Beitragsfrei gestellt' },
  { value: 'surrendered', label: 'Gekündigt / übertragen' },
] as const

// ---------------------------------------------------------------------------
// Universal fields (shared across all products)
// ---------------------------------------------------------------------------

interface UniversalFieldsProps<T extends ProductDraftState> extends BaseProps<T> {
  /** When true, hides Vertragsbeginn and uses Depot/Sparplan-flavored copy. */
  isEtf?: boolean
}

function UniversalFields<T extends ProductDraftState>({ draft, onChange, setEvidence, isEtf }: UniversalFieldsProps<T>) {
  const update = (patch: Partial<ProductDraftState>) =>
    onChange({ ...draft, ...patch } as T)

  const currentYear = new Date().getFullYear()
  // Suppress estimate badges for placeholder values that are not meaningful estimates.
  // contractStartYear = currentYear is the default "not yet set" placeholder for all products.
  // currentValueEUR = 0 means the user hasn't entered a value yet.
  const isPlaceholderContractStart = draft.contractStartYear === currentYear
  const isPlaceholderCurrentValue = (draft.currentValueEUR ?? 0) <= 0

  return (
    <div className="inventory-field-grid">
      {/* Vertragsbeginn is not a meaningful concept for an ETF Sparplan/Depot */}
      {!isEtf && (
        <InvField
          label="Vertragsbeginn (Jahr)"
          hint="Beeinflusst die steuerliche Einordnung (z. B. Altvertrag vor 2005)."
        >
          <InvNumber
            value={draft.contractStartYear}
            min={1970}
            max={currentYear}
            step={1}
            suffix="Jahr"
            onChange={(n) => {
              setEvidence?.('contractStartYear', 'user_confirmed')
              update({ contractStartYear: n })
            }}
          />
          {shouldRenderEvidenceBadge(draft, 'contractStartYear', isPlaceholderContractStart) && (
            <EvidenceBadge
              state={evidenceState(draft, 'contractStartYear')}
              onConfirm={() => setEvidence?.('contractStartYear', 'user_confirmed')}
            />
          )}
        </InvField>
      )}

      <InvField
        label={isEtf ? 'Aktueller Depotwert (EUR)' : 'Aktueller Vertragswert (EUR)'}
        hint="Aus dem letzten Jahreskontoauszug oder der Standmitteilung."
      >
        <InvNumber
          value={draft.currentValueEUR ?? 0}
          min={0}
          max={10_000_000}
          step={100}
          suffix="EUR"
          onChange={(n) => {
            setEvidence?.('currentValueEUR', 'user_confirmed')
            update({ currentValueEUR: n })
          }}
        />
        {shouldRenderEvidenceBadge(draft, 'currentValueEUR', isPlaceholderCurrentValue) && (
          <EvidenceBadge
            state={evidenceState(draft, 'currentValueEUR')}
            onConfirm={() => setEvidence?.('currentValueEUR', 'user_confirmed')}
          />
        )}
      </InvField>

      <InvField label={isEtf ? 'Monatliche Sparrate (EUR)' : 'Monatlicher Beitrag (EUR)'}>
        <InvNumber
          value={draft.monthlyContribution}
          min={0}
          max={50_000}
          step={10}
          suffix="EUR/Monat"
          onChange={(n) => {
            update({ monthlyContribution: n })
            setEvidence?.('monthlyContribution', 'user_confirmed')
          }}
        />
      </InvField>

      <InvField label="Status">
        <InvSelect
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(v) => update({ status: v as InstanceStatus })}
        />
      </InvField>

      <InvField label={isEtf ? 'Depot / Broker (optional)' : 'Anbieter / Tarif (optional)'}>
        <InvText
          value={draft.anbieter ?? ''}
          placeholder={isEtf ? 'z. B. Scalable Capital, Trade Republic' : 'z. B. Allianz Direktversicherung'}
          onChange={(v) => update({ anbieter: v || undefined })}
        />
      </InvField>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layer 3 details disclosure
// ---------------------------------------------------------------------------

/**
 * Shared Layer 3 <details> block. Carries:
 *  - Fee decomposition via `FeeSection` (spec: "using FeeSection")
 *  - Beitragsdynamik via `BeitragsdynamikField` (spec: "using BeitragsdynamikField")
 *  - KVdR/freiwillig hint (profile-level, informational)
 *  - Statutory subsidy split (bAV only — passed via `bavSubsidy`)
 *  - Vintage auto-detection chips
 *
 * Adapter note: the wizard draft stores `effektivkostenPct` (scalar %).
 * We build a synthetic FeeModel (wrapperAssetFee = effektivkostenPct / 100,
 * all other fields zero) so `FeeSection` can be reused without schema changes.
 * On change we extract `wrapperAssetFee + fundAssetFee` back as effektivkostenPct.
 */

const LAYER3_FEE_PRESETS = [
  {
    label: 'Nettotarif ETF (0,8 %)',
    fees: {
      wrapperAssetFee: 0.008,
      fundAssetFee: 0,
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
      wrapperAssetFee: 0.015,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
]

interface Layer3Props {
  effektivkostenPct: number
  feeDetails?: FeeModel
  onEffektivkostenChange: (v: number) => void
  onFeeDetailsChange?: (fees: FeeModel, effektivkostenPct: number) => void
  beitragsdynamikPct: number
  onBeitragsdynamikChange: (v: number) => void
  bavSubsidy?: {
    /** User-entered gross conversion (EUR/month). */
    monthlyConversion: number
  }
}

function Layer3Details({
  effektivkostenPct,
  feeDetails,
  onEffektivkostenChange,
  onFeeDetailsChange,
  beitragsdynamikPct,
  onBeitragsdynamikChange,
  bavSubsidy,
}: Layer3Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')

  // Adapter: preserve an edited Einzelposten split; otherwise derive the all-in fee from the scalar.
  const feesForInput = feeDetails ?? allInFeeDetails(effektivkostenPct)
  const riy = feesForInput.wrapperAssetFee + feesForInput.fundAssetFee
  const handleFeesChange = (fees: FeeModel) => {
    const nextEffektivkostenPct = (fees.wrapperAssetFee + fees.fundAssetFee) * 100
    if (onFeeDetailsChange) {
      onFeeDetailsChange(fees, nextEffektivkostenPct)
      return
    }
    onEffektivkostenChange(nextEffektivkostenPct)
  }

  return (
    <details className="inv-layer3-details">
      <summary className="inv-layer3-summary">Details</summary>
      <div className="inv-layer3-body">
        {/* Vintage chips are shown at the card level (via VintageChips + runRules) once committed
            to the dashboard. The wizard has no instanceIds during draft entry, so chips appear
            after the user taps "Fertig & Vergleich starten". */}

        {/* Fee decomposition via FeeSection (spec requirement) */}
        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Kosten</p>
          <FeeSection
            fees={feesForInput}
            onChangeFees={handleFeesChange}
            presets={LAYER3_FEE_PRESETS}
            riy={riy}
            feeInputMode={feeMode}
            setFeeInputMode={setFeeMode}
          />
        </div>

        {/* Beitragsdynamik via BeitragsdynamikField (spec requirement) */}
        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Beitragsdynamik</p>
          <BeitragsdynamikField
            rate={beitragsdynamikPct / 100}
            onChangeRate={(decimal) => onBeitragsdynamikChange(decimal * 100)}
            activeHint="Beitrag wächst jährlich um diesen Prozentsatz (geometrisch)."
          />
        </div>

        {/* bAV-only: statutory subsidy split */}
        {bavSubsidy !== undefined && (
          <div className="inv-layer3-section">
            <p className="inventory-instance-section-heading">Förderung (geschätzt)</p>
            <p className="inventory-field-hint">
              Mindestens 15 % Arbeitgeber-Zuschuss bei Entgeltumwandlung (§1a Abs. 1a BetrAVG).
              Eigenbeitrag: {bavSubsidy.monthlyConversion} EUR/Monat brutto.
              Zuschuss ca. {Math.round(bavSubsidy.monthlyConversion * 0.15)} EUR/Monat (Schätzung).
            </p>
          </div>
        )}

        {/* KVdR informational hint */}
        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Krankenversicherung im Alter</p>
          <p className="inventory-field-hint">
            Der KVdR-Status (pflichtversichert in der gesetzlichen Krankenversicherung der
            Rentner) wird aus deinem Profil abgeleitet. Bei bAV gilt der §226 Abs. 2 SGB V
            Freibetrag (ca. 176 EUR/Monat 2026) — der Rechner berücksichtigt dies automatisch.
          </p>
        </div>
      </div>
    </details>
  )
}

interface EtfLayer3Props {
  terPct: number
  onTerChange: (v: number) => void
  sparratenDynamikPct: number
  onSparratenDynamikChange: (v: number) => void
}

function EtfLayer3Details({
  terPct,
  onTerChange,
  sparratenDynamikPct,
  onSparratenDynamikChange,
}: EtfLayer3Props) {
  return (
    <details className="inv-layer3-details">
      <summary className="inv-layer3-summary">Details</summary>
      <div className="inv-layer3-body">
        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Fondskosten</p>
          <div className="inventory-field-grid inventory-field-grid--narrow">
            <InvField
              label="TER / Fondskosten p.a."
              hint="Laufende Fondskosten des ETF aus Factsheet oder KIID."
            >
              <InvNumber
                value={terPct}
                min={0}
                max={3}
                step={0.01}
                suffix="% p.a."
                onChange={onTerChange}
              />
            </InvField>
          </div>
        </div>

        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Sparplan</p>
          <div className="inventory-field-grid inventory-field-grid--narrow">
            <InvField
              label="Sparraten-Dynamik p.a."
              hint={sparratenDynamikPct > 0 ? 'Sparrate wächst jährlich um diesen Prozentsatz.' : undefined}
            >
              <InvNumber
                value={sparratenDynamikPct}
                min={0}
                max={10}
                step={0.1}
                suffix="%"
                onChange={onSparratenDynamikChange}
              />
            </InvField>
          </div>
        </div>
      </div>
    </details>
  )
}

function allInFeeDetails(effektivkostenPct: number): FeeModel {
  return {
    wrapperAssetFee: effektivkostenPct / 100,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  }
}

// ---------------------------------------------------------------------------
// GRV card
// ---------------------------------------------------------------------------

interface GrvCardProps {
  draft: GrvDraft
  onChange: (next: GrvDraft) => void
  grossSalaryYear: number
}

export function GrvCard({ draft, onChange, grossSalaryYear }: GrvCardProps) {
  const derivedEp = estimateEpFromYears(draft.yearsWorked, grossSalaryYear)

  return (
    <>
      <p className="inventory-field-hint">
        Die gesetzliche Rentenversicherung wird automatisch berechnet. Gib an, wie
        lange du schon arbeitest — oder trage deine Entgeltpunkte aus der letzten
        Renteninformation ein.
      </p>

      <div className="inventory-field">
        <span>Wie moechtest du deine gesetzliche Rente erfassen?</span>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="grv-input-mode"
              checked={draft.useYearsEstimate}
              onChange={() => onChange({ ...draft, useYearsEstimate: true })}
            />
            <span>Schaetzen aus Arbeitsjahren und Gehalt</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="grv-input-mode"
              checked={!draft.useYearsEstimate}
              onChange={() => onChange({ ...draft, useYearsEstimate: false })}
            />
            <span>Entgeltpunkte aus Renteninformation eingeben</span>
          </label>
        </div>
      </div>

      <div className="inventory-field-grid">
        {draft.useYearsEstimate ? (
          <InvField
            label="Wie viele Jahre arbeitest du schon?"
            hint={`≈ ${derivedEp.toFixed(1)} Entgeltpunkte (geschätzt)`}
          >
            <InvNumber
              value={draft.yearsWorked}
              min={0}
              max={50}
              step={1}
              suffix="Jahre"
              onChange={(n) =>
                onChange({ ...draft, yearsWorked: n, useYearsEstimate: true })
              }
            />
            <span className="derived-note">Geschätzter Wert aus Arbeitsjahren</span>
          </InvField>
        ) : (
          <InvField
            label="Entgeltpunkte (aus Renteninformation)"
            hint="Aus dem Abschnitt 'Ihre Rentenauskunft' des letzten Renteninformationsbriefs."
          >
            <InvNumber
              value={draft.currentEntgeltpunkte}
              min={0}
              max={200}
              step={0.1}
              suffix="EP"
              onChange={(n) =>
                onChange({ ...draft, currentEntgeltpunkte: n, useYearsEstimate: false })
              }
            />
          </InvField>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// bAV card
// ---------------------------------------------------------------------------

// DFW_OPTIONS, PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL are imported from ./fieldHelpers

export function BavCard({
  draft,
  onChange,
  setEvidence,
  vintageAtoms,
}: BaseProps<BavDraft> & { vintageAtoms?: Atom[] }) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-bav">
      {vintageAtoms && vintageAtoms.length > 0 && (
        <VintageChips atoms={vintageAtoms} />
      )}
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} />

      <p className="inventory-instance-section-heading">bAV-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField label="Durchführungsweg">
          <InvSelect
            value={draft.durchfuehrungsweg}
            options={DFW_OPTIONS}
            onChange={(v) => {
              onChange({ ...draft, durchfuehrungsweg: v as BavDurchfuehrungsweg })
              setEvidence?.('durchfuehrungsweg', 'user_confirmed')
            }}
          />
        </InvField>

        <InvField
          label="Effektivkosten p.a. (aus PIB/KID)"
          hint="Renditeminderung aus dem Produktinformationsblatt. Typisch 0,6–1,5 % für ETF-Nettotarife."
        >
          <InvNumber
            value={draft.effektivkostenPct}
            min={0}
            max={5}
            step={0.05}
            suffix="% p.a."
            onChange={(n) => {
              setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')
              onChange({ ...draft, effektivkostenPct: n, feeDetails: allInFeeDetails(n) })
            }}
          />
          {shouldRenderEvidenceBadge(draft, 'fees.wrapperAssetFee', draft.effektivkostenPct <= 0) && (
            <EvidenceBadge
              state={evidenceState(draft, 'fees.wrapperAssetFee')}
              onConfirm={() => setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')}
            />
          )}
        </InvField>

        <InvField label="Auszahlungsform">
          <InvSelect
            value={draft.payoutMode}
            options={PAYOUT_OPTIONS_FULL}
            onChange={(v) => {
              onChange({ ...draft, payoutMode: v as BavDraft['payoutMode'] })
              setEvidence?.('payoutMode', 'user_confirmed')
            }}
          />
        </InvField>

        {draft.payoutMode === 'leibrente' && (
          <InvField
            label="Garantierter Rentenfaktor"
            hint="EUR/Monat je 10.000 EUR Kapital. Aus dem PIB oder Angebots-Beispielsrechnung."
          >
            <InvNumber
              value={draft.rentenfaktor}
              min={1}
              max={80}
              step={0.5}
              suffix="EUR/10k mtl."
              onChange={(n) => {
                setEvidence?.('rentenfaktor', 'user_confirmed')
                onChange({ ...draft, rentenfaktor: n })
              }}
            />
            <EvidenceBadge
              state={evidenceState(draft, 'rentenfaktor')}
              onConfirm={() => setEvidence?.('rentenfaktor', 'user_confirmed')}
            />
          </InvField>
        )}
      </div>

      <Layer3Details
        effektivkostenPct={draft.effektivkostenPct}
        feeDetails={draft.feeDetails}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
        onFeeDetailsChange={(fees, effektivkostenPct) =>
          onChange({ ...draft, effektivkostenPct, feeDetails: fees })
        }
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
        bavSubsidy={{ monthlyConversion: draft.monthlyContribution }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// pAV (private Rentenversicherung) card
// ---------------------------------------------------------------------------

export function PavCard({
  draft,
  onChange,
  setEvidence,
  vintageAtoms,
}: BaseProps<PavDraft> & { vintageAtoms?: Atom[] }) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-versicherung">
      {vintageAtoms && vintageAtoms.length > 0 && (
        <VintageChips atoms={vintageAtoms} />
      )}
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} />

      <p className="inventory-instance-section-heading">pAV-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField
          label="Effektivkosten p.a. (aus PIB/KID)"
          hint="Renditeminderung aus dem Produktinformationsblatt. Typisch 0,5–1,5 % für Nettotarife."
        >
          <InvNumber
            value={draft.effektivkostenPct}
            min={0}
            max={5}
            step={0.05}
            suffix="% p.a."
            onChange={(n) => {
              setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')
              onChange({ ...draft, effektivkostenPct: n, feeDetails: allInFeeDetails(n) })
            }}
          />
          {shouldRenderEvidenceBadge(draft, 'fees.wrapperAssetFee', draft.effektivkostenPct <= 0) && (
            <EvidenceBadge
              state={evidenceState(draft, 'fees.wrapperAssetFee')}
              onConfirm={() => setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')}
            />
          )}
        </InvField>

        <InvField label="Auszahlungsform">
          <InvSelect
            value={draft.payoutMode}
            options={PAYOUT_OPTIONS_FULL}
            onChange={(v) => {
              onChange({ ...draft, payoutMode: v as PavDraft['payoutMode'] })
              setEvidence?.('payoutMode', 'user_confirmed')
            }}
          />
        </InvField>

        {draft.payoutMode === 'leibrente' && (
          <InvField
            label="Garantierter Rentenfaktor"
            hint="EUR/Monat je 10.000 EUR Kapital. Aus dem PIB oder Angebots-Beispielsrechnung."
          >
            <InvNumber
              value={draft.rentenfaktor}
              min={1}
              max={80}
              step={0.5}
              suffix="EUR/10k mtl."
              onChange={(n) => {
                setEvidence?.('rentenfaktor', 'user_confirmed')
                onChange({ ...draft, rentenfaktor: n })
              }}
            />
            <EvidenceBadge
              state={evidenceState(draft, 'rentenfaktor')}
              onConfirm={() => setEvidence?.('rentenfaktor', 'user_confirmed')}
            />
          </InvField>
        )}
      </div>

      <Layer3Details
        effektivkostenPct={draft.effektivkostenPct}
        feeDetails={draft.feeDetails}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
        onFeeDetailsChange={(fees, effektivkostenPct) =>
          onChange({ ...draft, effektivkostenPct, feeDetails: fees })
        }
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Riester card
// ---------------------------------------------------------------------------

export function RiesterCard({
  draft,
  onChange,
  setEvidence,
  childBirthYears,
  vintageAtoms,
}: BaseProps<RiesterDraft> & { childBirthYears: readonly number[]; vintageAtoms?: Atom[] }) {
  const currentYear = new Date().getFullYear()
  const youngChildren = childBirthYears.filter((y) => y <= currentYear && currentYear - y < 25).length
  const hasChildren = youngChildren > 0
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-riester">
      {vintageAtoms && vintageAtoms.length > 0 && (
        <VintageChips atoms={vintageAtoms} />
      )}
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} />

      <p className="inventory-instance-section-heading">Riester-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField label="Auszahlungsform">
          <InvSelect
            value={draft.payoutMode}
            options={PAYOUT_OPTIONS_NO_KAPITAL}
            onChange={(v) =>
              onChange({ ...draft, payoutMode: v as RiesterDraft['payoutMode'] })
            }
          />
        </InvField>

        <InvField
          label="Zulagen-Status (automatisch)"
          hint="Abgeleitet aus deinem Profil (Kinder und Berufseinstieg)."
        >
          <div className="inventory-input-shell">
            <input
              type="text"
              readOnly
              value={
                hasChildren
                  ? `Grundzulage + ${youngChildren} Kinderzulage${youngChildren !== 1 ? 'n' : ''}`
                  : 'Nur Grundzulage (175 EUR/Jahr)'
              }
            />
          </div>
          {/* derived from profile, not user-entered — intentionally non-promotable */}
          <span className="derived-note">Automatisch aus Profil</span>
        </InvField>
      </div>

      <Layer3Details
        effektivkostenPct={0}
        onEffektivkostenChange={() => {}}
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Basisrente card
// ---------------------------------------------------------------------------

export function BasisrenteCard({ draft, onChange, setEvidence }: BaseProps<BasisrenteDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-basisrente">
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} />

      <p className="inventory-instance-section-heading">Basisrente-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField
          label="Effektivkosten p.a. (aus PIB/KID)"
          hint="Renditeminderung aus dem Produktinformationsblatt."
        >
          <InvNumber
            value={draft.effektivkostenPct}
            min={0}
            max={5}
            step={0.05}
            suffix="% p.a."
            onChange={(n) => {
              setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')
              onChange({ ...draft, effektivkostenPct: n, feeDetails: allInFeeDetails(n) })
            }}
          />
          {shouldRenderEvidenceBadge(draft, 'fees.wrapperAssetFee', draft.effektivkostenPct <= 0) && (
            <EvidenceBadge
              state={evidenceState(draft, 'fees.wrapperAssetFee')}
              onConfirm={() => setEvidence?.('fees.wrapperAssetFee', 'user_confirmed')}
            />
          )}
        </InvField>

        <InvField
          label="Garantierter Rentenfaktor"
          hint="EUR/Monat je 10.000 EUR Kapital. Basisrente wird immer als Leibrente ausgezahlt."
        >
          <InvNumber
            value={draft.rentenfaktor}
            min={1}
            max={80}
            step={0.5}
            suffix="EUR/10k mtl."
            onChange={(n) => {
              setEvidence?.('rentenfaktor', 'user_confirmed')
              onChange({ ...draft, rentenfaktor: n })
            }}
          />
          <EvidenceBadge
            state={evidenceState(draft, 'rentenfaktor')}
            onConfirm={() => setEvidence?.('rentenfaktor', 'user_confirmed')}
          />
        </InvField>
      </div>

      <Layer3Details
        effektivkostenPct={draft.effektivkostenPct}
        feeDetails={draft.feeDetails}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
        onFeeDetailsChange={(fees, effektivkostenPct) =>
          onChange({ ...draft, effektivkostenPct, feeDetails: fees })
        }
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AVD card
// ---------------------------------------------------------------------------

const AVD_SUBTYPE_OPTIONS: readonly { value: AltersvorsorgedepotSubtype; label: string }[] = [
  { value: 'standarddepot', label: 'Standarddepot (mit Glidepath, RIY-Cap 1 %)' },
  { value: 'depot_no_guarantee', label: 'Ohne Garantie (volle Flexibilität)' },
  { value: 'guarantee_80', label: 'Mit 80 % Kapitalgarantie' },
  { value: 'guarantee_100', label: 'Mit 100 % Kapitalgarantie' },
] as const

export function AvdCard({ draft, onChange, setEvidence }: BaseProps<AvdDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-altersvorsorgedepot">
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} />

      <p className="inventory-instance-section-heading">AVD-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField label="Vertragstyp">
          <InvSelect
            value={draft.subtype}
            options={AVD_SUBTYPE_OPTIONS}
            onChange={(v) =>
              onChange({ ...draft, subtype: v as AltersvorsorgedepotSubtype })
            }
          />
        </InvField>

        <InvField label="Automatischer Glidepath">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draft.useGlidepath}
              onChange={(e) => onChange({ ...draft, useGlidepath: e.target.checked })}
            />
            <span style={{ fontWeight: 'normal', fontSize: '0.88rem' }}>
              Aktiviert — reduziert Aktienanteil ab 15 Jahren vor Rente
            </span>
          </label>
        </InvField>
      </div>

      <Layer3Details
        effektivkostenPct={0}
        onEffektivkostenChange={() => {}}
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ETF card
// ---------------------------------------------------------------------------

export function EtfCard({ draft, onChange, setEvidence }: BaseProps<EtfDraft>) {
  return (
    <div className="inventory-instance-card" data-testid="instance-card-etf">
      <UniversalFields draft={draft} onChange={onChange} setEvidence={setEvidence} isEtf={true} />

      <p className="inventory-instance-section-heading">ETF-spezifisch</p>
      <div className="inventory-field-grid inventory-field-grid--narrow">
        <InvField
          label="TER p.a. (Fondskosten)"
          hint="Typisch 0,07–0,20 % für breit gestreute ETF-Indizes. Aus dem KIID / Factsheet."
        >
          <InvNumber
            value={draft.terPct}
            min={0}
            max={3}
            step={0.01}
            suffix="% p.a."
            onChange={(n) => {
              setEvidence?.('annualAssetFee', 'user_confirmed')
              onChange({ ...draft, terPct: n })
            }}
          />
          <EvidenceBadge
            state={evidenceState(draft, 'annualAssetFee')}
            onConfirm={() => setEvidence?.('annualAssetFee', 'user_confirmed')}
          />
        </InvField>
      </div>

      <EtfLayer3Details
        terPct={draft.terPct}
        onTerChange={(v) => {
          setEvidence?.('annualAssetFee', 'user_confirmed')
          onChange({ ...draft, terPct: v })
        }}
        sparratenDynamikPct={(draft.annualContributionGrowthRate ?? 0) * 100}
        onSparratenDynamikChange={(v) =>
          onChange({ ...draft, annualContributionGrowthRate: Math.max(0, v / 100) })
        }
      />
    </div>
  )
}
