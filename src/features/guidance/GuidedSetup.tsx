import './GuidedSetup.css'
import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../../domain'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import {
  STATUTORY_BAV_SUBSIDY_PCT,
  bavTotalMatchPct,
  applyBavTotalMatch,
} from '../../app/productPresentation'

export type GuidedPath = 'bav_offer' | 'etf_vs_insurance' | 'rentengap' | 'expert'

const ALL_PRODUCTS: ProductId[] = [
  'etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester',
]

/**
 * Visible-product preset per guided path. The path choice is the user's strongest
 * signal about which products are relevant — narrowing the comparison up front
 * reduces noise. The user can re-add products via the visibility chips at any time.
 */
const VISIBLE_PRODUCTS_BY_PATH: Record<GuidedPath, ProductId[]> = {
  bav_offer: ['etf', 'bav'],
  etf_vs_insurance: ['etf', 'versicherung'],
  // Pension-gap users typically don't want a 6-way comparison up front.
  // Start with ETF + bAV (the two most-common decision pair) and let them
  // add other products via the comparison picker.
  rentengap: ['etf', 'bav'],
  expert: ALL_PRODUCTS,
}

interface PathOption {
  id: GuidedPath
  title: string
  description: string
}

const PATH_OPTIONS: PathOption[] = [
  {
    id: 'bav_offer',
    title: 'Ich habe ein bAV-Angebot',
    description:
      'Ein Arbeitgeber- oder Versicherungs-Angebot zur Entgeltumwandlung prüfen — inkl. AG-Zuschuss, Steuern und KV/PV in der Rente.',
  },
  {
    id: 'etf_vs_insurance',
    title: 'ETF gegen Versicherung vergleichen',
    description:
      'Was bringt ein günstiges ETF-Depot im Vergleich zu einer privaten Rentenversicherung — mit Kosten, Steuer und Auszahlungsform.',
  },
  {
    id: 'rentengap',
    title: 'Rentenlücke grob schätzen',
    description:
      'Wie viel netto bleibt aus der gesetzlichen Rente — und welche zusätzliche Vorsorge schließt die Lücke realistisch?',
  },
  {
    id: 'expert',
    title: 'Expertenmodus',
    description:
      'Direkt ins volle Dashboard mit allen Eingaben. Geführter Einstieg wird übersprungen.',
  },
]

interface BasicInputs {
  age: number
  retirementAge: number
  grossSalaryYear: number
  publicHealthInsurance: boolean
}

/**
 * §1a Abs. 1a BetrAVG mandates a 15 % statutory employer subsidy on bAV
 * Entgeltumwandlung. The guided form therefore shows a *total* AG-Zuschuss
 * field (statutory + contractual) so non-experts see a realistic 15 % default
 * instead of the bare contractual 0 %. The split into statutory + contractual
 * happens in `applyAndComplete` before writing back to assumptions, using the
 * `applyBavTotalMatch` helper that the "Annahmen anpassen" panel also calls —
 * so both UIs round-trip the same value.
 */

interface PathSpecific {
  bavGrossConversion: number
  /** Total AG-Zuschuss in % of Bruttoumwandlung — statutory 15 % plus any extra contractual share. */
  bavTotalMatchPct: number
  etfTerPct: number
  /**
   * Years already worked under the GRV. We back-calculate Entgeltpunkte from
   * `years × min(salary, BBG) / durchschnittsentgelt` — same formula the engine
   * uses for the future-EP projection. Direct EP entry is unfriendly to non-experts.
   */
  yearsWorked: number
  /** Wunschnetto: target net monthly pension. 0/undefined skips the Lücke card. */
  desiredNetMonthlyPension: number
}

interface Props {
  /** Currently active profile / assumptions — used to seed the form. */
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  onApply: (profile: PersonalProfile, assumptions: ScenarioAssumptions) => void
  onComplete: (options?: { isExpert?: boolean; suggestedView?: 'angebot' | 'vergleich' }) => void
  onSkipPermanently: () => void
  onDismiss: () => void
}

export function GuidedSetup({
  profile,
  assumptions,
  onApply,
  onComplete,
  onSkipPermanently,
  onDismiss,
}: Props) {
  const [path, setPath] = useState<GuidedPath | null>(null)
  const [basics, setBasics] = useState<BasicInputs>({
    age: profile.age,
    retirementAge: profile.retirementAge,
    grossSalaryYear: profile.grossSalaryYear,
    publicHealthInsurance: profile.publicHealthInsurance,
  })
  const [extras, setExtras] = useState<PathSpecific>({
    bavGrossConversion: assumptions.bav.monthlyGrossConversion,
    bavTotalMatchPct: bavTotalMatchPct(assumptions.bav),
    etfTerPct: assumptions.etf.annualAssetFee * 100,
    // Reverse-engineer years worked from existing EP if state was already set,
    // so reopening the wizard doesn't reset the user's number.
    yearsWorked: estimateYearsFromEp(
      assumptions.statutoryPension.currentEntgeltpunkte ?? 0,
      profile.grossSalaryYear,
    ),
    desiredNetMonthlyPension: profile.desiredNetMonthlyPension ?? 0,
  })

  function pickPath(p: GuidedPath) {
    if (p === 'expert') {
      onComplete({ isExpert: true })
      return
    }
    setPath(p)
  }

  function applyAndComplete() {
    if (!path) return

    const nextProfile: PersonalProfile = {
      ...defaultProfile,
      ...profile,
      age: basics.age,
      retirementAge: basics.retirementAge,
      grossSalaryYear: basics.grossSalaryYear,
      publicHealthInsurance: basics.publicHealthInsurance,
      desiredNetMonthlyPension:
        path === 'rentengap' && extras.desiredNetMonthlyPension > 0
          ? extras.desiredNetMonthlyPension
          : profile.desiredNetMonthlyPension,
    }

    const backCalculatedEp =
      path === 'rentengap'
        ? estimateEpFromYears(extras.yearsWorked, basics.grossSalaryYear)
        : assumptions.statutoryPension.currentEntgeltpunkte

    const nextAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      ...assumptions,
      visibleProducts: VISIBLE_PRODUCTS_BY_PATH[path],
      bav: {
        ...assumptions.bav,
        monthlyGrossConversion:
          path === 'bav_offer' ? extras.bavGrossConversion : assumptions.bav.monthlyGrossConversion,
        // Total AG-Zuschuss splits into the statutory 15 % (always on for new contracts
        // per §1a Abs. 1a BetrAVG) and any contractual share above it. The engine caps
        // the statutory leg at the actual AG SV saving, so a user value below 15 % is
        // still safe to apply with statutory enabled.
        ...(path === 'bav_offer'
          ? applyBavTotalMatch(extras.bavTotalMatchPct)
          : {
              contractualMatchPercent: assumptions.bav.contractualMatchPercent,
              statutoryMinimumSubsidyEnabled: assumptions.bav.statutoryMinimumSubsidyEnabled,
            }),
      },
      etf: {
        ...assumptions.etf,
        annualAssetFee:
          path === 'etf_vs_insurance' || path === 'bav_offer'
            ? extras.etfTerPct / 100
            : assumptions.etf.annualAssetFee,
      },
      statutoryPension: {
        ...assumptions.statutoryPension,
        currentEntgeltpunkte: backCalculatedEp,
      },
    }

    onApply(nextProfile, nextAssumptions)
    // bAV-offer users still need to fill product-specific offer fields → land them in
    // the input panel. Other paths jump straight to the result.
    onComplete({ suggestedView: path === 'bav_offer' ? 'angebot' : 'vergleich' })
  }

  return (
    <div className="guided-setup-overlay" role="dialog" aria-modal="true" aria-labelledby="guided-setup-heading">
      <div className="guided-setup-card">
        <button
          type="button"
          className="guided-setup-close"
          onClick={onDismiss}
          aria-label="Geführten Einstieg schließen"
        >
          <X size={18} aria-hidden="true" />
        </button>

        {path === null ? (
          <>
            <header className="guided-setup-header">
              <p className="guided-setup-eyebrow">Willkommen</p>
              <h2 id="guided-setup-heading">Was möchtest du vergleichen?</h2>
              <p className="guided-setup-lede">
                Wähle einen Einstieg — wir fragen anschließend nur die wichtigsten Werte ab.
                Alle weiteren Eingaben kannst du danach im Dashboard anpassen.
              </p>
            </header>

            <ul className="guided-path-list">
              {PATH_OPTIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="guided-path-btn"
                    onClick={() => pickPath(option.id)}
                  >
                    <div>
                      <strong>{option.title}</strong>
                      <span>{option.description}</span>
                    </div>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <footer className="guided-setup-footer">
              <button
                type="button"
                className="guided-setup-link"
                onClick={onSkipPermanently}
              >
                Geführten Einstieg dauerhaft ausblenden
              </button>
            </footer>
          </>
        ) : (
          <>
            <header className="guided-setup-header">
              <p className="guided-setup-eyebrow">
                {PATH_OPTIONS.find((p) => p.id === path)?.title}
              </p>
              <h2 id="guided-setup-heading">Wenige Eingaben — los geht&apos;s</h2>
              <p className="guided-setup-lede">
                Diese Werte reichen für eine erste belastbare Berechnung. Der Rechner ergänzt
                gesetzliche und steuerliche Annahmen für 2026 automatisch.
              </p>
            </header>

            <div className="guided-form-grid">
              <SimpleNumber
                label="Alter heute"
                value={basics.age}
                min={18}
                max={70}
                onChange={(value) => setBasics((b) => ({ ...b, age: value }))}
                suffix="Jahre"
              />
              <SimpleNumber
                label="Renteneintritt"
                value={basics.retirementAge}
                min={Math.max(60, basics.age + 1)}
                max={75}
                onChange={(value) => setBasics((b) => ({ ...b, retirementAge: value }))}
                suffix="Jahre"
              />
              <SimpleNumber
                label="Brutto pro Jahr"
                value={basics.grossSalaryYear}
                min={0}
                max={500_000}
                step={1000}
                onChange={(value) => setBasics((b) => ({ ...b, grossSalaryYear: value }))}
                suffix="EUR"
              />
              <label className="guided-toggle">
                <input
                  type="checkbox"
                  checked={basics.publicHealthInsurance}
                  onChange={(e) =>
                    setBasics((b) => ({ ...b, publicHealthInsurance: e.target.checked }))
                  }
                />
                <span>
                  <strong>Gesetzlich krankenversichert</strong>
                  <small>Ausschalten, falls privat krankenversichert (PKV).</small>
                </span>
              </label>

              {path === 'bav_offer' && (
                <>
                  <SimpleNumber
                    label="bAV-Bruttoumwandlung"
                    value={extras.bavGrossConversion}
                    min={0}
                    max={2000}
                    step={10}
                    onChange={(value) =>
                      setExtras((e) => ({ ...e, bavGrossConversion: value }))
                    }
                    suffix="EUR/Monat"
                  />
                  <SimpleNumber
                    label="AG-Zuschuss (gesamt)"
                    value={extras.bavTotalMatchPct}
                    min={STATUTORY_BAV_SUBSIDY_PCT}
                    max={100}
                    step={5}
                    onChange={(value) =>
                      setExtras((e) => ({ ...e, bavTotalMatchPct: value }))
                    }
                    suffix="% vom Brutto"
                    hint={`Mindestens ${STATUTORY_BAV_SUBSIDY_PCT} % gesetzlicher AG-Zuschuss (§1a Abs. 1a BetrAVG).`}
                  />
                  <SimpleNumber
                    label="ETF-TER (Vergleich)"
                    value={extras.etfTerPct}
                    min={0}
                    max={3}
                    step={0.05}
                    onChange={(value) => setExtras((e) => ({ ...e, etfTerPct: value }))}
                    suffix="% p.a."
                  />
                </>
              )}

              {path === 'etf_vs_insurance' && (
                <SimpleNumber
                  label="ETF-TER"
                  value={extras.etfTerPct}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(value) => setExtras((e) => ({ ...e, etfTerPct: value }))}
                  suffix="% p.a."
                />
              )}

              {path === 'rentengap' && (
                <>
                  <SimpleNumber
                    label="Wie viele Jahre arbeitest du schon?"
                    value={extras.yearsWorked}
                    min={0}
                    max={50}
                    step={1}
                    onChange={(value) =>
                      setExtras((e) => ({ ...e, yearsWorked: value }))
                    }
                    suffix="Jahre"
                    hint={`≈ ${estimateEpFromYears(extras.yearsWorked, basics.grossSalaryYear).toFixed(1)} Entgeltpunkte (geschätzt)`}
                  />
                  <SimpleNumber
                    label="Was möchtest du im Monat haben? (optional)"
                    value={extras.desiredNetMonthlyPension}
                    min={0}
                    max={20_000}
                    step={100}
                    onChange={(value) =>
                      setExtras((e) => ({ ...e, desiredNetMonthlyPension: value }))
                    }
                    suffix="EUR netto"
                    hint="Wunschnetto in der Rente — wir zeigen dir die Lücke."
                  />
                </>
              )}
            </div>

            <p className="guided-setup-note">
              Standardannahme: bAV als Direktversicherung, lebenslange Rente,
              gesetzlich pflichtversichert in der Rente. Diese und weitere Punkte kannst du im
              Dashboard pro Produkt anpassen.
            </p>

            <footer className="guided-setup-footer guided-setup-actions">
              <button type="button" className="guided-setup-link" onClick={() => setPath(null)}>
                Zurück
              </button>
              <button
                type="button"
                className="guided-setup-primary"
                onClick={applyAndComplete}
              >
                <Check size={16} aria-hidden="true" />
                Vergleich starten
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function SimpleNumber({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="guided-field">
      <span>{label}</span>
      <div className="guided-input-shell">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
      {hint && <small className="guided-field-hint">{hint}</small>}
    </label>
  )
}

/**
 * Back-calculate Entgeltpunkte from years worked × current gross salary.
 * EP/year = min(salary, BBG) / durchschnittsentgelt — same formula the engine uses
 * for future EP. Rough by construction (assumes constant salary), but consistent.
 */
function estimateEpFromYears(years: number, grossSalaryYear: number): number {
  if (!Number.isFinite(years) || years <= 0) return 0
  if (!Number.isFinite(grossSalaryYear) || grossSalaryYear <= 0) return 0
  const cappedSalary = Math.min(
    grossSalaryYear,
    de2026Rules.socialSecurity.pensionCapYear,
  )
  const epPerYear =
    de2026Rules.socialSecurity.durchschnittsentgelt > 0
      ? cappedSalary / de2026Rules.socialSecurity.durchschnittsentgelt
      : 0
  return Math.max(0, years * epPerYear)
}

/** Inverse of estimateEpFromYears, used to seed the years-worked field from existing state. */
function estimateYearsFromEp(ep: number, grossSalaryYear: number): number {
  if (!Number.isFinite(ep) || ep <= 0) return 0
  if (!Number.isFinite(grossSalaryYear) || grossSalaryYear <= 0) return 0
  const cappedSalary = Math.min(
    grossSalaryYear,
    de2026Rules.socialSecurity.pensionCapYear,
  )
  const epPerYear =
    de2026Rules.socialSecurity.durchschnittsentgelt > 0
      ? cappedSalary / de2026Rules.socialSecurity.durchschnittsentgelt
      : 0
  if (epPerYear <= 0) return 0
  return Math.round(ep / epPerYear)
}

interface PostHintProps {
  onDismiss: () => void
  /** Factors actually relevant to the current scenario, derived in App.tsx. */
  factors: PostHintFactor[]
}

export interface PostHintFactor {
  id: string
  label: string
  detail: string
}

export function GuidedSetupPostHint({ onDismiss, factors }: PostHintProps) {
  const [expanded, setExpanded] = useState(false)
  const factorCount = factors.length

  return (
    <aside className="guided-post-hint" role="note">
      <button
        type="button"
        className="guided-post-hint-trigger"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="guided-post-hint-trigger-text">
          Warum mehr als ein Taschenrechner?
          {factorCount > 0 && (
            <span className="guided-post-hint-count">
              {factorCount} relevante Effekte für dein Szenario
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="guided-post-hint-close"
        onClick={onDismiss}
        aria-label="Hinweis schließen"
      >
        <X size={16} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="guided-post-hint-body">
          <p>
            Diese Effekte beeinflussen dein Ergebnis konkret — der Rechner berücksichtigt sie für
            2026 automatisch:
          </p>
          {factorCount > 0 && (
            <ul className="guided-post-hint-factors">
              {factors.map((factor) => (
                <li key={factor.id}>
                  <Check size={14} aria-hidden="true" />
                  <span>
                    <strong>{factor.label}</strong> — {factor.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
