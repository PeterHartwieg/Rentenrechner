import './GuidedSetup.css'
import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { PersonalProfile, ScenarioAssumptions } from '../../domain'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import {
  bavTotalMatchPct,
  applyBavTotalMatch,
} from '../../app/productPresentation'
import {
  PATH_OPTIONS,
  VISIBLE_PRODUCTS_BY_PATH,
  type GuidedPath,
} from '../../content/triggers'
import { estimateEpFromYears } from '../inventory/inventoryHelpers'
import { WIZARD_REGISTRY } from './wizards/wizardRegistry'
import type { BasicInputs, PathSpecific } from './wizards/shared'

export type { GuidedPath }

/**
 * §1a Abs. 1a BetrAVG mandates a 15 % statutory employer subsidy on bAV
 * Entgeltumwandlung. The guided form therefore shows a *total* AG-Zuschuss
 * field (statutory + contractual) so non-experts see a realistic 15 % default
 * instead of the bare contractual 0 %. The split into statutory + contractual
 * happens in `applyAndComplete` before writing back to assumptions, using the
 * `applyBavTotalMatch` helper that the "Annahmen anpassen" panel also calls —
 * so both UIs round-trip the same value.
 */

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

  const ActiveWizard = path !== null ? WIZARD_REGISTRY[path] : null

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

        {ActiveWizard === null ? (
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

            <ActiveWizard
              profile={profile}
              assumptions={assumptions}
              basics={basics}
              setBasics={setBasics}
              extras={extras}
              setExtras={setExtras}
              onApplyAndComplete={applyAndComplete}
              onBack={() => setPath(null)}
            />
          </>
        )}
      </div>
    </div>
  )
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
