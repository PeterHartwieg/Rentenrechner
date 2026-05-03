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
import type { BavDurchfuehrungsweg } from '../../domain/products/bav'
import type { AltersvorsorgedepotSubtype } from '../../domain/products/altersvorsorgedepot'
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
import { detectVintageChips } from './vintageDetection'
import { InfoTip } from '../../ui/InfoTip'
import { FeeSection, type FeeInputMode } from '../inputs/sections/FeeSection'
import { BeitragsdynamikField } from '../inputs/sections/BeitragsdynamikField'

// ---------------------------------------------------------------------------
// Internal shared primitives
// ---------------------------------------------------------------------------

interface BaseProps<T extends ProductDraftState> {
  draft: T
  onChange: (next: T) => void
}

function InvField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="inventory-field">
      <span>{label}</span>
      {children}
      {hint && <p className="inventory-field-hint">{hint}</p>}
    </div>
  )
}

function InvNumber({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange: (n: number) => void
}) {
  return (
    <div className="inventory-input-shell">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix && <em>{suffix}</em>}
    </div>
  )
}

function InvSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="inventory-select-shell">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function InvText({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inventory-input-shell">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * "🤔 Schätzung" placeholder shown next to defaulted fields.
 * The emoji is spec-mandated UX copy (issue 05 acceptance criterion / PRD G1).
 */
function EstimateNote({ label = 'Schätzung' }: { label?: string }) {
  return (
    <span className="inventory-estimate-note">
      {'🤔'} {label}
    </span>
  )
}

const STATUS_OPTIONS: readonly { value: InstanceStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv (laufende Beiträge)' },
  { value: 'paid_up', label: 'Beitragsfrei gestellt' },
  { value: 'surrendered', label: 'Gekündigt / übertragen' },
] as const

// ---------------------------------------------------------------------------
// Vintage chips
// ---------------------------------------------------------------------------

function VintageChips({
  contractStartYear,
  durchfuehrungsweg,
}: {
  contractStartYear: number
  durchfuehrungsweg?: string
}) {
  const chips = detectVintageChips({ contractStartYear, durchfuehrungsweg })
  if (chips.length === 0) return null

  return (
    <div className="inv-vintage-chips">
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
// Universal fields (shared across all products)
// ---------------------------------------------------------------------------

function UniversalFields<T extends ProductDraftState>({ draft, onChange }: BaseProps<T>) {
  const update = (patch: Partial<ProductDraftState>) =>
    onChange({ ...draft, ...patch } as T)

  const currentYear = new Date().getFullYear()

  return (
    <div className="inventory-field-grid">
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
          onChange={(n) => update({ contractStartYear: n })}
        />
        {draft.contractStartYear === currentYear && (
          <EstimateNote label="Bitte prüfen" />
        )}
      </InvField>

      <InvField
        label="Aktueller Vertragswert (EUR)"
        hint="Aus dem letzten Jahreskontoauszug oder der Standmitteilung."
      >
        <InvNumber
          value={draft.currentValueEUR ?? 0}
          min={0}
          max={10_000_000}
          step={100}
          suffix="EUR"
          onChange={(n) => update({ currentValueEUR: n })}
        />
        {(draft.currentValueEUR === undefined || draft.currentValueEUR === 0) && (
          <EstimateNote />
        )}
      </InvField>

      <InvField label="Monatlicher Beitrag (EUR)">
        <InvNumber
          value={draft.monthlyContribution}
          min={0}
          max={50_000}
          step={10}
          suffix="EUR/Monat"
          onChange={(n) => update({ monthlyContribution: n })}
        />
      </InvField>

      <InvField label="Status">
        <InvSelect
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(v) => update({ status: v as InstanceStatus })}
        />
      </InvField>

      <InvField label="Anbieter / Tarif (optional)">
        <InvText
          value={draft.anbieter ?? ''}
          placeholder="z. B. Allianz Direktversicherung"
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
  contractStartYear: number
  durchfuehrungsweg?: string
  effektivkostenPct: number
  onEffektivkostenChange: (v: number) => void
  beitragsdynamikPct: number
  onBeitragsdynamikChange: (v: number) => void
  bavSubsidy?: {
    /** User-entered gross conversion (EUR/month). */
    monthlyConversion: number
  }
}

function Layer3Details({
  contractStartYear,
  durchfuehrungsweg,
  effektivkostenPct,
  onEffektivkostenChange,
  beitragsdynamikPct,
  onBeitragsdynamikChange,
  bavSubsidy,
}: Layer3Props) {
  const [feeMode, setFeeMode] = useState<FeeInputMode>('effektivkosten')

  // Adapter: scalar effektivkostenPct (%) → FeeModel (decimal)
  const syntheticFees = {
    wrapperAssetFee: effektivkostenPct / 100,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  }
  const riy = effektivkostenPct / 100

  return (
    <details className="inv-layer3-details">
      <summary className="inv-layer3-summary">Details</summary>
      <div className="inv-layer3-body">
        {/* Vintage chips */}
        <VintageChips
          contractStartYear={contractStartYear}
          durchfuehrungsweg={durchfuehrungsweg}
        />

        {/* Fee decomposition via FeeSection (spec requirement) */}
        <div className="inv-layer3-section">
          <p className="inventory-instance-section-heading">Kosten</p>
          <FeeSection
            fees={syntheticFees}
            onChangeFees={(fees) =>
              onEffektivkostenChange((fees.wrapperAssetFee + fees.fundAssetFee) * 100)
            }
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

      <div className="inventory-field-grid">
        <InvField
          label="Wie viele Jahre arbeitest du schon?"
          hint={
            draft.useYearsEstimate
              ? `≈ ${derivedEp.toFixed(1)} Entgeltpunkte (geschätzt)`
              : undefined
          }
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
          {draft.useYearsEstimate && <EstimateNote />}
        </InvField>

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
          {draft.useYearsEstimate && (
            <EstimateNote label={`${derivedEp.toFixed(1)} EP geschätzt`} />
          )}
        </InvField>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// bAV card
// ---------------------------------------------------------------------------

const DFW_OPTIONS: readonly { value: BavDurchfuehrungsweg; label: string }[] = [
  { value: 'direktversicherung_3_63', label: 'Direktversicherung (§3 Nr. 63 EStG, ab 2005)' },
  { value: 'pensionskasse_3_63', label: 'Pensionskasse' },
  { value: 'pensionsfonds_3_63', label: 'Pensionsfonds' },
  { value: 'direktversicherung_40b_alt', label: 'Direktversicherung Altvertrag (vor 2005)' },
  { value: 'direktzusage', label: 'Direktzusage' },
  { value: 'unterstuetzungskasse', label: 'Unterstützungskasse' },
] as const

const PAYOUT_OPTIONS_FULL: readonly { value: string; label: string }[] = [
  { value: 'leibrente', label: 'Lebenslange Rente (Leibrente)' },
  { value: 'zeitrente', label: 'Zeitrente (befristet)' },
  { value: 'kapitalverzehr', label: 'Kapitalentnahme' },
] as const

const PAYOUT_OPTIONS_NO_KAPITAL: readonly { value: string; label: string }[] = [
  { value: 'leibrente', label: 'Lebenslange Rente (Leibrente)' },
  { value: 'zeitrente', label: 'Zeitrente (befristet)' },
] as const

export function BavCard({ draft, onChange }: BaseProps<BavDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-bav">
      <UniversalFields draft={draft} onChange={onChange} />

      <p className="inventory-instance-section-heading">bAV-spezifisch</p>
      <div className="inventory-field-grid">
        <InvField label="Durchführungsweg">
          <InvSelect
            value={draft.durchfuehrungsweg}
            options={DFW_OPTIONS}
            onChange={(v) =>
              onChange({ ...draft, durchfuehrungsweg: v as BavDurchfuehrungsweg })
            }
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
            onChange={(n) => onChange({ ...draft, effektivkostenPct: n })}
          />
          {draft.effektivkostenPct === 0 && <EstimateNote />}
        </InvField>

        <InvField label="Auszahlungsform">
          <InvSelect
            value={draft.payoutMode}
            options={PAYOUT_OPTIONS_FULL}
            onChange={(v) =>
              onChange({ ...draft, payoutMode: v as BavDraft['payoutMode'] })
            }
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
              onChange={(n) => onChange({ ...draft, rentenfaktor: n })}
            />
            {draft.rentenfaktor === 30 && <EstimateNote />}
          </InvField>
        )}
      </div>

      <Layer3Details
        contractStartYear={draft.contractStartYear}
        durchfuehrungsweg={draft.durchfuehrungsweg}
        effektivkostenPct={draft.effektivkostenPct}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
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

export function PavCard({ draft, onChange }: BaseProps<PavDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-versicherung">
      <UniversalFields draft={draft} onChange={onChange} />

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
            onChange={(n) => onChange({ ...draft, effektivkostenPct: n })}
          />
          {draft.effektivkostenPct === 0 && <EstimateNote />}
        </InvField>

        <InvField label="Auszahlungsform">
          <InvSelect
            value={draft.payoutMode}
            options={PAYOUT_OPTIONS_FULL}
            onChange={(v) =>
              onChange({ ...draft, payoutMode: v as PavDraft['payoutMode'] })
            }
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
              onChange={(n) => onChange({ ...draft, rentenfaktor: n })}
            />
            {draft.rentenfaktor === 28 && <EstimateNote />}
          </InvField>
        )}
      </div>

      <Layer3Details
        contractStartYear={draft.contractStartYear}
        effektivkostenPct={draft.effektivkostenPct}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
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
  childBirthYears,
}: BaseProps<RiesterDraft> & { childBirthYears: readonly number[] }) {
  const currentYear = new Date().getFullYear()
  const youngChildren = childBirthYears.filter((y) => currentYear - y < 25).length
  const hasChildren = youngChildren > 0
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-riester">
      <UniversalFields draft={draft} onChange={onChange} />

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
          <EstimateNote label="aus Profil abgeleitet" />
        </InvField>
      </div>

      <Layer3Details
        contractStartYear={draft.contractStartYear}
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

export function BasisrenteCard({ draft, onChange }: BaseProps<BasisrenteDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-basisrente">
      <UniversalFields draft={draft} onChange={onChange} />

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
            onChange={(n) => onChange({ ...draft, effektivkostenPct: n })}
          />
          {draft.effektivkostenPct === 0 && <EstimateNote />}
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
            onChange={(n) => onChange({ ...draft, rentenfaktor: n })}
          />
          {draft.rentenfaktor === 28 && <EstimateNote />}
        </InvField>
      </div>

      <Layer3Details
        contractStartYear={draft.contractStartYear}
        effektivkostenPct={draft.effektivkostenPct}
        onEffektivkostenChange={(v) => onChange({ ...draft, effektivkostenPct: v })}
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

export function AvdCard({ draft, onChange }: BaseProps<AvdDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-altersvorsorgedepot">
      <UniversalFields draft={draft} onChange={onChange} />

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
        contractStartYear={draft.contractStartYear}
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

export function EtfCard({ draft, onChange }: BaseProps<EtfDraft>) {
  const [beitragsdynamik, setBeitragsdynamik] = useState(0)

  return (
    <div className="inventory-instance-card" data-testid="instance-card-etf">
      <UniversalFields draft={draft} onChange={onChange} />

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
            onChange={(n) => onChange({ ...draft, terPct: n })}
          />
          {draft.terPct === 0.2 && <EstimateNote />}
        </InvField>
      </div>

      <Layer3Details
        contractStartYear={draft.contractStartYear}
        effektivkostenPct={draft.terPct}
        onEffektivkostenChange={(v) => onChange({ ...draft, terPct: v })}
        beitragsdynamikPct={beitragsdynamik}
        onBeitragsdynamikChange={setBeitragsdynamik}
      />
    </div>
  )
}
