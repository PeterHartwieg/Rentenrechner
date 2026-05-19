import { useEffect, useState } from 'react'
import './AngabenPage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR, activeRules } from '../../rules'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { PersonalProfile, ScenarioAssumptions } from '../../domain'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { formatPercent } from '../../utils/format'

interface Props {
  navigate?: (target: Route) => void
}

interface Section {
  /** Stable fragment id — used for `<h2 id>`, TOC `href`, and aria-current.
   *  Year-free so `/eingaben#person` keeps working when `RULES_YEAR` rolls
   *  forward. Mirrors the MethodePage pattern. */
  readonly id: string
  /** Mono kicker label, e.g. "§ 1". */
  readonly n: string
  /** Section heading shown to the user. */
  readonly title: string
}

// Sections rendered in this order. Section 4 ("Annahmen") folds in the
// pre-redesign Annahmen tab; the chrome nav drops Annahmen entirely.
const SECTIONS: ReadonlyArray<Section> = [
  { id: 'person', n: '§ 1', title: 'Person' },
  { id: 'einkommen', n: '§ 2', title: 'Einkommen' },
  { id: 'renteneintritt', n: '§ 3', title: 'Renteneintritt' },
  { id: 'annahmen', n: '§ 4', title: 'Annahmen' },
]

/**
 * Required return-scenario ids — module-eval-time fail-fast (mirrors
 * `RESOLVED_RENDITEN` in `MethodePage.tsx`). If any of these slugs is renamed
 * in `defaultAssumptions.returnScenarios`, this page fails to import rather
 * than silently rendering 0 %.
 *
 * Per CLAUDE.md: never index `returnScenarios[0]` for Basis — order in the
 * default array is [konservativ, basis, optimistisch], not part of the contract.
 */
const REQUIRED_SCENARIO_IDS = ['konservativ', 'basis', 'optimistisch'] as const
type ScenarioId = (typeof REQUIRED_SCENARIO_IDS)[number]

const RESOLVED_RENDITEN: Readonly<Record<ScenarioId, number>> = (() => {
  const out = {} as Record<ScenarioId, number>
  for (const id of REQUIRED_SCENARIO_IDS) {
    const scenario = defaultAssumptions.returnScenarios.find((s) => s.id === id)
    if (!scenario) {
      throw new Error(
        `AngabenPage: missing return scenario "${id}" in defaultAssumptions.returnScenarios — ` +
          `Renditeannahmen receipt cannot render without it.`,
      )
    }
    out[id] = scenario.annualReturn
  }
  return out
})()

// Static labelling for the GKV vs PKV radio (cross-year — kept inline as copy).
const KV_OPTIONS = [
  { value: 'gkv', label: 'Gesetzlich (GKV)' },
  { value: 'pkv', label: 'Privat (PKV)' },
] as const

const FAMILIENSTAND_OPTIONS = [
  { value: 'ledig', label: 'ledig' },
  { value: 'verheiratet', label: 'verheiratet (Splitting)' },
  { value: 'eingetragene-partnerschaft', label: 'eingetragene Lebenspartnerschaft' },
] as const

const RETIREMENT_HEALTH_OPTIONS = [
  { value: 'kvdr', label: 'KVdR (§ 226 SGB V)' },
  { value: 'freiwillig_gkv', label: 'freiwillige GKV (§ 240 SGB V)' },
  { value: 'pkv', label: 'PKV in der Rente' },
] as const

/**
 * `/eingaben` — Deine Angaben (PR 5).
 *
 * Sober D visual treatment: white background, IBM Plex Sans body, mono `§`
 * section labels, dark rules. Form-receipt fidelity: monospace value cell,
 * dotted-underline contextual hints, label above. The page is deliberately
 * NOT routed through `ArticleLayout` and NOT included in
 * `isEditorialChromeRoute` — Sober D, not editorial cream.
 *
 * Layout pattern mirrors `MethodePage`:
 *   - left rail: sticky TOC of `<h2 id>` anchors with `aria-current`
 *     reflecting the active section + post-hydration scroll-to-hash retry.
 *   - center: H1 (from registry) + lead paragraph + four § sections
 *     (Person / Einkommen / Renteneintritt / Annahmen).
 *   - right rail: "Warum wir das fragen" explanations + storage / source note.
 *
 * State scope: the page owns ephemeral local state for the form fields so
 * the receipt renders interactively at all three viewports. Engine-side
 * state (compare-mode `useCalculatorState`, combine-mode workspace,
 * scenario library, share-URL) is intentionally untouched in PR 5 — the
 * storage hookup is queued for a later PR. Engine, storage, and prerender
 * data shapes stay byte-identical.
 *
 * Statutory values rendered on this page (return scenarios, Sparer-
 * Pauschbetrag, Bezugsgröße, etc.) are read from `activeRules` and
 * `defaultAssumptions`. Paragraph citations (`§ 3 Nr. 63`, `§ 32a Abs. 5`)
 * are acceptable as literals — they reference statutes by name, not values.
 *
 * JSON-LD: emitted into the document head by the SSG `renderRouteHeadHtml`
 * pipeline (`buildJsonLd` returns a WebPage block from
 * `publicRouteRegistry['/eingaben']`). We do NOT emit a second block inline.
 */
export function AngabenPage({ navigate }: Props) {
  const route = publicRouteRegistry['/eingaben']
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  // Ephemeral local state. The page is illustrative — engine and storage
  // wiring stays in `useCalculatorState` / `useWorkspace` (PR 6+). Initial
  // values come from `defaultProfile` + `defaultAssumptions` so the receipt
  // shows realistic numbers from the first render.
  const [profile, setProfile] = useState<PersonalProfile>(defaultProfile)
  const [familienstand, setFamilienstand] = useState<string>('ledig')
  const [bundesland, setBundesland] = useState<string>('Berlin')
  // `retirementHealthStatus` is optional in `GrvAssumptions` (defaults to
  // KVdR semantically); fall back to 'kvdr' if the default scenario does not
  // carry one so the radio always has a checked option.
  const [retirementHealthStatus, setRetirementHealthStatus] = useState<
    'kvdr' | 'freiwillig_gkv' | 'pkv'
  >(defaultAssumptions.statutoryPension.retirementHealthStatus ?? 'kvdr')
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(defaultAssumptions)

  // Active-anchor state for the TOC `aria-current="location"` highlight.
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Direct-fragment-load retry (mirrors MethodePage): the browser fires
    // its fragment scroll before React mounts; once the ids are in the DOM
    // we re-trigger scrollIntoView so the right section comes into view.
    if (window.location.hash.length > 1) {
      const target = document.getElementById(window.location.hash.slice(1))
      if (target) target.scrollIntoView()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveAnchor(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  // Derived: contribution-cap headroom for the "Brutto" hint.
  // §3 Nr. 63 EStG cap, computed from `activeRules` (no statutory literals
  // are rendered inline as values — only as paragraph citations).
  const bavTaxFreeAnnual =
    activeRules.socialSecurity.pensionCapYear * activeRules.bav.taxFreePctOfPensionCap
  const bavTaxFreeMonthly = bavTaxFreeAnnual / 12

  // Inflation control toggles the inflation rate around an Expert-mode default.
  const inflationEnabled = assumptions.inflationRate > 0

  return (
    <div className="angaben-shell">
      <div className="angaben-main">
        <nav className="angaben-breadcrumb" aria-label="Pfad">
          <a
            href="/"
            className="angaben-breadcrumb-back"
            onClick={(event) => {
              if (!navigate) return
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate('/')
            }}
          >
            Startseite
          </a>
          <span className="angaben-breadcrumb-sep" aria-hidden="true">›</span>
          <span className="angaben-breadcrumb-cluster">Angaben</span>
        </nav>

        <div className="angaben-grid">
          {/* Left rail — TOC. Hidden on tablet + phone via CSS. */}
          <aside className="angaben-toc" aria-label="In diesem Dokument">
            <div className="angaben-toc-kicker">In diesem Dokument</div>
            <ol className="angaben-toc-list">
              {SECTIONS.map((section, i) => {
                const isActive =
                  activeAnchor === section.id || (activeAnchor === null && i === 0)
                return (
                  <li
                    key={section.id}
                    className={
                      isActive
                        ? 'angaben-toc-item angaben-toc-item--active'
                        : 'angaben-toc-item'
                    }
                  >
                    <a
                      href={`#${section.id}`}
                      className="angaben-toc-link"
                      aria-current={isActive ? 'location' : undefined}
                    >
                      <span className="angaben-toc-num">{section.n}</span>
                      {section.title}
                    </a>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Center — the receipt body. */}
          <article className="angaben-body">
            <div className="angaben-kicker">Eingaben für RentenWiki</div>
            <h1 className="angaben-headline">{route.h1}</h1>
            <p className="angaben-summary">{route.summary}</p>

            <div className="angaben-storage-note">
              Alle Angaben werden ausschließlich <strong>lokal in deinem Browser</strong>{' '}
              gespeichert. Es werden keine Daten an Server übertragen, keine Cookies
              gesetzt und keine Identifier persistiert.
            </div>

            {/* ─── § 1 Person ─────────────────────────────────────────── */}
            <section className="angaben-section">
              <div className="angaben-section-head">
                <span className="angaben-section-num">{SECTIONS[0].n}</span>
                <h2 id={SECTIONS[0].id} className="angaben-section-title">
                  {SECTIONS[0].title}
                </h2>
              </div>
              <p className="angaben-section-lead">
                Geburtsjahr, Familienstand und Krankenversicherung. Treiben die
                Kohortenwerte für Versorgungsfreibetrag und Besteuerungsanteil
                sowie den Splittingtarif.
              </p>

              <div className="angaben-fields">
                <label className="angaben-field">
                  <span className="angaben-field-label">Alter</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={18}
                      max={profile.retirementAge - 1}
                      value={profile.age}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, age: Number(e.target.value) }))
                      }
                    />
                    <span className="angaben-field-suffix">Jahre</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Geburtsjahr fixiert Kohortenwerte (§ 22 Nr. 1, § 19 Abs. 2 EStG)
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Familienstand</span>
                  <span className="angaben-field-shell">
                    <select
                      value={familienstand}
                      onChange={(e) => setFamilienstand(e.target.value)}
                    >
                      {FAMILIENSTAND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span className="angaben-field-caret" aria-hidden="true">▾</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Ehegattensplitting nach § 32a Abs. 5 EStG
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Bundesland</span>
                  <span className="angaben-field-shell">
                    <input
                      type="text"
                      value={bundesland}
                      onChange={(e) => setBundesland(e.target.value)}
                    />
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Kirchensteuersatz Bayern/BW vs. übrige Länder
                    </span>
                  </span>
                </label>

                <div className="angaben-field">
                  <span className="angaben-field-label">Krankenversicherung</span>
                  <div className="angaben-radio-group">
                    {KV_OPTIONS.map((opt) => (
                      <label key={opt.value} className="angaben-radio">
                        <input
                          type="radio"
                          name="kv"
                          checked={
                            opt.value === (profile.publicHealthInsurance ? 'gkv' : 'pkv')
                          }
                          onChange={() =>
                            setProfile((p) => ({
                              ...p,
                              publicHealthInsurance: opt.value === 'gkv',
                            }))
                          }
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="angaben-field">
                  <span className="angaben-field-label">Kinder (Anzahl)</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={profile.childBirthYears.length}
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(10, Number(e.target.value)))
                        setProfile((p) => {
                          const current = p.childBirthYears
                          if (n === current.length) return p
                          if (n > current.length) {
                            // Default to 5 years before RULES_YEAR for new entries.
                            const extra = Array.from(
                              { length: n - current.length },
                              () => RULES_YEAR - 5,
                            )
                            return { ...p, childBirthYears: [...current, ...extra] }
                          }
                          return { ...p, childBirthYears: current.slice(0, n) }
                        })
                      }}
                    />
                    <span className="angaben-field-suffix">Kinder</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Pflegebeiträge-Zuschlag (§ 55 SGB XI) und Riester-Kinderzulagen
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Kirchensteuer</span>
                  <span className="angaben-check">
                    <input
                      type="checkbox"
                      checked={profile.churchTax}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, churchTax: e.target.checked }))
                      }
                    />
                    <span>kirchensteuerpflichtig</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Auf Einkommen- und Kapitalertragsteuer; Satz je Bundesland
                    </span>
                  </span>
                </label>
              </div>
            </section>

            {/* ─── § 2 Einkommen ──────────────────────────────────────── */}
            <section className="angaben-section">
              <div className="angaben-section-head">
                <span className="angaben-section-num">{SECTIONS[1].n}</span>
                <h2 id={SECTIONS[1].id} className="angaben-section-title">
                  {SECTIONS[1].title}
                </h2>
              </div>
              <p className="angaben-section-lead">
                Bruttogehalt steuert Lohnsteuer, Vorsorgepauschale und die
                Förderhöchstbeträge der betrieblichen Altersvorsorge.
              </p>

              <div className="angaben-fields">
                <label className="angaben-field">
                  <span className="angaben-field-label">Bruttoeinkommen pro Jahr</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={profile.grossSalaryYear}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          grossSalaryYear: Math.max(0, Number(e.target.value)),
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">EUR p.a.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Vorsorgepauschale § 39b EStG; § 3 Nr. 63 EStG / § 1 SvEV
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">bAV-Brutto pro Monat</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={assumptions.bav.monthlyGrossConversion}
                      onChange={(e) =>
                        setAssumptions((a) => ({
                          ...a,
                          bav: {
                            ...a.bav,
                            monthlyGrossConversion: Math.max(0, Number(e.target.value)),
                          },
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">EUR mtl.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Voll steuer- und SV-frei bis ca. {Math.round(bavTaxFreeMonthly)} EUR/Monat
                      (§ 3 Nr. 63 EStG)
                    </span>
                  </span>
                </label>

                {profile.publicHealthInsurance && (
                  <label className="angaben-field">
                    <span className="angaben-field-label">GKV-Zusatzbeitrag</span>
                    <span className="angaben-field-shell">
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={profile.healthAdditionalContributionPct}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            healthAdditionalContributionPct: Math.max(0, Number(e.target.value)),
                          }))
                        }
                      />
                      <span className="angaben-field-suffix">% p.a.</span>
                    </span>
                    <span className="angaben-field-meta">
                      <span className="angaben-field-hint">
                        Kassenindividuell; Lohnsteuer-PAP nutzt diesen Wert direkt
                      </span>
                    </span>
                  </label>
                )}

                {!profile.publicHealthInsurance && (
                  <label className="angaben-field">
                    <span className="angaben-field-label">PKV-Prämie (KV)</span>
                    <span className="angaben-field-shell">
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={profile.pkvMonthlyPremium}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            pkvMonthlyPremium: Math.max(0, Number(e.target.value)),
                          }))
                        }
                      />
                      <span className="angaben-field-suffix">EUR mtl.</span>
                    </span>
                    <span className="angaben-field-meta">
                      <span className="angaben-field-hint">
                        Beitragszuschuss § 257 SGB V; Teilbeträge gehen in die Vorsorgepauschale
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </section>

            {/* ─── § 3 Renteneintritt ─────────────────────────────────── */}
            <section className="angaben-section">
              <div className="angaben-section-head">
                <span className="angaben-section-num">{SECTIONS[2].n}</span>
                <h2 id={SECTIONS[2].id} className="angaben-section-title">
                  {SECTIONS[2].title}
                </h2>
              </div>
              <p className="angaben-section-lead">
                Renteneintrittsalter und Status in der Krankenversicherung der
                Rentner fixieren Besteuerungsanteil und Versorgungsfreibetrag —
                beide sind kohortengebunden.
              </p>

              <div className="angaben-fields">
                <label className="angaben-field">
                  <span className="angaben-field-label">Renteneintrittsalter</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={Math.max(55, profile.age + 1)}
                      max={75}
                      value={profile.retirementAge}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          retirementAge: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">Jahre</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Renteneintrittsjahr fixiert Kohortenwerte zum Renteneintritt
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Kapital aufgebraucht bis</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={profile.retirementAge + 1}
                      max={110}
                      value={assumptions.retirementEndAge}
                      onChange={(e) =>
                        setAssumptions((a) => ({
                          ...a,
                          retirementEndAge: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">Jahre</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Nur für Kapitalverzehr (ETF, bAV/pAV in „selbstgesteuert"-Modus)
                    </span>
                  </span>
                </label>

                <div className="angaben-field">
                  <span className="angaben-field-label">Status KV in der Rente</span>
                  <div className="angaben-radio-group">
                    {RETIREMENT_HEALTH_OPTIONS.map((opt) => (
                      <label key={opt.value} className="angaben-radio">
                        <input
                          type="radio"
                          name="retirementHealth"
                          checked={retirementHealthStatus === opt.value}
                          onChange={() => setRetirementHealthStatus(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="angaben-field">
                  <span className="angaben-field-label">Wunsch-Nettorente pro Monat</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={profile.desiredNetMonthlyPension}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          desiredNetMonthlyPension: Math.max(0, Number(e.target.value)),
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">EUR mtl.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Optional — leeren oder 0 setzen, falls keine Zielmarke gesetzt
                    </span>
                  </span>
                </label>
              </div>
            </section>

            {/* ─── § 4 Annahmen (folds in old Annahmen tab) ───────────── */}
            <section className="angaben-section">
              <div className="angaben-section-head">
                <span className="angaben-section-num">{SECTIONS[3].n}</span>
                <h2 id={SECTIONS[3].id} className="angaben-section-title">
                  {SECTIONS[3].title}
                </h2>
              </div>
              <p className="angaben-section-lead">
                Renditeannahmen für die kapitalmarktgebundenen Produkte und
                Inflationsmodellierung. Voreinstellungen folgen MSCI-World-Werten
                über 30-jährige Rolling-Fenster.
              </p>

              <div className="angaben-fields">
                <label className="angaben-field">
                  <span className="angaben-field-label">Konservatives Szenario</span>
                  <span className="angaben-field-shell">
                    <span>{formatPercent(RESOLVED_RENDITEN.konservativ, 1)}</span>
                    <span className="angaben-field-suffix">real p.a.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      10er-Quantil rollierend 30 J., MSCI World
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Basis-Szenario</span>
                  <span className="angaben-field-shell">
                    <span>{formatPercent(RESOLVED_RENDITEN.basis, 1)}</span>
                    <span className="angaben-field-suffix">real p.a.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Realer Median MSCI World 1900–2025 (~ 5,2 % real)
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Optimistisches Szenario</span>
                  <span className="angaben-field-shell">
                    <span>{formatPercent(RESOLVED_RENDITEN.optimistisch, 1)}</span>
                    <span className="angaben-field-suffix">real p.a.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      90er-Quantil rollierend 30 J., MSCI World
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Monte-Carlo-Volatilität</span>
                  <span className="angaben-field-shell">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={1}
                      value={Math.round(assumptions.monteCarlo.annualVolatility * 100)}
                      onChange={(e) =>
                        setAssumptions((a) => ({
                          ...a,
                          monteCarlo: {
                            ...a.monteCarlo,
                            annualVolatility: Math.max(0, Number(e.target.value)) / 100,
                          },
                        }))
                      }
                    />
                    <span className="angaben-field-suffix">% p.a.</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      Annualisierte Volatilität für die stochastische Bandbreite
                    </span>
                  </span>
                </label>

                <label className="angaben-field">
                  <span className="angaben-field-label">Inflation</span>
                  <span className="angaben-check">
                    <input
                      type="checkbox"
                      checked={inflationEnabled}
                      onChange={(e) =>
                        setAssumptions((a) => ({
                          ...a,
                          inflationRate: e.target.checked ? 0.02 : 0,
                        }))
                      }
                    />
                    <span>Inflation modellieren</span>
                  </span>
                  <span className="angaben-field-meta">
                    <span className="angaben-field-hint">
                      EZB-Mittelfrist-Ziel 2 % als Vorbelegung — beliebig anpassbar
                    </span>
                  </span>
                </label>

                {inflationEnabled && (
                  <label className="angaben-field">
                    <span className="angaben-field-label">Inflationsrate p.a.</span>
                    <span className="angaben-field-shell">
                      <input
                        type="number"
                        min={0}
                        max={8}
                        step={0.1}
                        value={Number((assumptions.inflationRate * 100).toFixed(1))}
                        onChange={(e) =>
                          setAssumptions((a) => ({
                            ...a,
                            inflationRate: Math.max(0, Number(e.target.value)) / 100,
                          }))
                        }
                      />
                      <span className="angaben-field-suffix">% p.a.</span>
                    </span>
                    <span className="angaben-field-meta">
                      <span className="angaben-field-hint">
                        Reduziert reale Werte in der Auszahlphase
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </section>
          </article>

          {/* Right rail — "Warum wir das fragen". Folds below body on phone. */}
          <aside className="angaben-aside">
            <div className="angaben-aside-card">
              <div className="angaben-aside-kicker">Warum wir das fragen</div>
              <ul className="angaben-aside-list">
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">§ Person</span>
                  <span className="angaben-aside-list-val">
                    Geburtsjahr und Renteneintritt steuern Kohortenwerte
                    (§ 22 Nr. 1, § 19 Abs. 2 EStG). Familienstand schaltet das
                    Ehegattensplitting (§ 32a Abs. 5 EStG).
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">§ Einkommen</span>
                  <span className="angaben-aside-list-val">
                    Bruttogehalt entscheidet über Vorsorgepauschale (§ 39b EStG)
                    und die § 3 Nr. 63 EStG / § 1 SvEV-Förderhöchstbeträge bei der
                    bAV.
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">§ Renteneintritt</span>
                  <span className="angaben-aside-list-val">
                    Renteneintrittsalter und -jahr fixieren Besteuerungsanteil und
                    Versorgungsfreibetrag — beides kohortengebunden. Der KV-Status
                    in der Rente entscheidet zwischen § 226 SGB V und § 240 SGB V.
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">§ Annahmen</span>
                  <span className="angaben-aside-list-val">
                    Renditeannahmen folgen historischen MSCI-World-Renditen über
                    30 Jahre rollierend (konservativ = 10er-Quantil, Basis = realer
                    Median, optimistisch = 90er-Quantil). Inflation:
                    EZB-Mittelfrist-Ziel 2 %.
                  </span>
                </li>
              </ul>
            </div>

            <div className="angaben-aside-card">
              <div className="angaben-aside-kicker">Datenhaltung</div>
              <p className="angaben-aside-body">
                <strong>Lokal im Browser.</strong> Keine Server-Übertragung, kein
                Account, keine Cookies, keine Identifier. Du kannst den
                Browser-Speicher jederzeit über die Einstellungen deines Browsers
                leeren — damit ist auch dein RentenWiki-Stand entfernt.
              </p>
              <p className="angaben-aside-body">
                Methodische Details und die zugehörigen Paragrafen findest du auf{' '}
                <a
                  href="/methode"
                  className="angaben-aside-list-val"
                  style={{ textDecoration: 'underline', color: 'var(--rw-accent)' }}
                  onClick={(event) => {
                    if (!navigate) return
                    if (!shouldUseSpaNavigation(event)) return
                    event.preventDefault()
                    navigate('/methode')
                  }}
                >
                  Methode &amp; Quellen
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>

      <p className="angaben-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />
    </div>
  )
}
