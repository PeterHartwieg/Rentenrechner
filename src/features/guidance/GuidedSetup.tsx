import './GuidedSetup.css'
import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../../domain'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'

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
  rentengap: ALL_PRODUCTS,
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

interface PathSpecific {
  bavGrossConversion: number
  bavContractualMatchPct: number
  etfTerPct: number
  currentEntgeltpunkte: number
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
    bavContractualMatchPct: assumptions.bav.contractualMatchPercent * 100,
    etfTerPct: assumptions.etf.annualAssetFee * 100,
    currentEntgeltpunkte: assumptions.statutoryPension.currentEntgeltpunkte ?? 0,
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
    }

    const nextAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      ...assumptions,
      visibleProducts: VISIBLE_PRODUCTS_BY_PATH[path],
      bav: {
        ...assumptions.bav,
        monthlyGrossConversion:
          path === 'bav_offer' ? extras.bavGrossConversion : assumptions.bav.monthlyGrossConversion,
        contractualMatchPercent:
          path === 'bav_offer'
            ? extras.bavContractualMatchPct / 100
            : assumptions.bav.contractualMatchPercent,
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
        currentEntgeltpunkte:
          path === 'rentengap'
            ? extras.currentEntgeltpunkte
            : assumptions.statutoryPension.currentEntgeltpunkte,
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
                    label="AG-Zuschuss (vertraglich)"
                    value={extras.bavContractualMatchPct}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(value) =>
                      setExtras((e) => ({ ...e, bavContractualMatchPct: value }))
                    }
                    suffix="% vom Brutto"
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
                <SimpleNumber
                  label="Aktuelle Entgeltpunkte"
                  value={extras.currentEntgeltpunkte}
                  min={0}
                  max={70}
                  step={0.5}
                  onChange={(value) =>
                    setExtras((e) => ({ ...e, currentEntgeltpunkte: value }))
                  }
                  suffix="EP"
                />
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
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
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
    </label>
  )
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
  return (
    <aside className="guided-post-hint" role="note">
      <div>
        <h3>Warum mehr als ein Taschenrechner?</h3>
        <p>
          Diese Effekte beeinflussen dein Ergebnis konkret — der Rechner berücksichtigt sie für
          2026 automatisch:
        </p>
        {factors.length > 0 && (
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
      <button
        type="button"
        className="guided-post-hint-close"
        onClick={onDismiss}
        aria-label="Hinweis schließen"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
