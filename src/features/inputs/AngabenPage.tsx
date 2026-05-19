import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './AngabenPage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR, activeRules } from '../../rules'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { PersonalProfile, ScenarioAssumptions } from '../../domain'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { useViewport } from '../../ui/chrome/useViewport'
import { AngabenPersonSection } from './sections/AngabenPersonSection'
import { AngabenEinkommenSection } from './sections/AngabenEinkommenSection'
import { AngabenRenteneintrittSection } from './sections/AngabenRenteneintrittSection'
import { AngabenAnnahmenSection } from './sections/AngabenAnnahmenSection'

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

/**
 * Right-rail aside card. Renders a single explanation card. The card is
 * always expanded on tablet + desktop (the kicker is decorative). On phone
 * the kicker becomes a `<button>` that toggles the card body; markup carries
 * `aria-expanded` and `aria-controls` per WAI-ARIA disclosure pattern.
 *
 * Implementation note: the body is always present in the DOM so screen
 * readers parse the full source on tablet + desktop without depending on JS
 * state. On phone, CSS hides the body (`display: none`) when the wrapper
 * carries `data-open="false"`. Toggling the button updates the data
 * attribute and the `aria-expanded` value; the body re-displays without a
 * remount. Keyboard a11y comes for free from the native `<button>` element
 * (Enter / Space toggle).
 *
 * On desktop + tablet, `data-open` is forced to `"true"` and the button
 * scoping disables the click handler so the card behaves exactly like the
 * pre-PR-1-round-1 implementation. The kicker keeps its visual `kicker`
 * styling on desktop + tablet via CSS.
 */
function AngabenAsideCard({
  kicker,
  bodyId,
  children,
}: {
  kicker: string
  /** Stable id used by `aria-controls`. Must be unique on the page. */
  bodyId: string
  children: ReactNode
}) {
  const viewport = useViewport()
  // Default phone state: collapsed. Desktop + tablet: forced open via CSS,
  // but `expanded` is still true so the aria-expanded value reads "true" for
  // assistive tech parsing the rendered DOM.
  const isPhone = viewport === 'phone'
  const [open, setOpen] = useState<boolean>(false)
  const expanded = isPhone ? open : true

  return (
    <div className="angaben-aside-card" data-open={expanded ? 'true' : 'false'}>
      <button
        type="button"
        className="angaben-aside-toggle"
        // Disabled on desktop + tablet so users see the kicker as a label
        // (not a clickable affordance) and screen readers do not surface a
        // false button. The CSS hides the chevron on those viewports too.
        // `aria-disabled` is the correct attribute for a button whose role
        // is intentionally suppressed without removing it from the focus
        // order in unexpected ways; we additionally use the `disabled`
        // attribute so click + keyboard activation are both no-ops.
        disabled={!isPhone}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => {
          if (!isPhone) return
          setOpen((v) => !v)
        }}
      >
        <span className="angaben-aside-kicker">{kicker}</span>
        <span className="angaben-aside-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      <div id={bodyId} className="angaben-aside-body-wrap" hidden={isPhone && !open}>
        {children}
      </div>
    </div>
  )
}

// Static labelling for the GKV vs PKV radio (cross-year — kept inline as copy).
const FAMILIENSTAND_DEFAULT = 'ledig'
const BUNDESLAND_DEFAULT = 'Berlin'

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
 *     (Person / Einkommen / Renteneintritt / Annahmen). Each section lives
 *     in its own file under `sections/AngabenXxxSection.tsx` — the page
 *     shell is a thin orchestrator that owns ephemeral state and wires the
 *     setters in. Round-1 review feedback: the inline implementation drifted
 *     from the `src/features/inputs/sections/` convention used by other
 *     input surfaces (PayoutModeSection, FeeSection, etc.).
 *   - right rail: "Warum wir das fragen" explanations + storage / source
 *     note. On phone each card folds into a button-triggered disclosure
 *     (round-1 review: the PR objective wanted phone collapse and we shipped
 *     a CSS-reorder that left both cards expanded).
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
  const [familienstand, setFamilienstand] = useState<string>(FAMILIENSTAND_DEFAULT)
  const [bundesland, setBundesland] = useState<string>(BUNDESLAND_DEFAULT)
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
  const bavTaxFreeMonthly = useMemo(
    () =>
      (activeRules.socialSecurity.pensionCapYear * activeRules.bav.taxFreePctOfPensionCap) / 12,
    [],
  )

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

            <AngabenPersonSection
              profile={profile}
              setProfile={setProfile}
              familienstand={familienstand}
              setFamilienstand={setFamilienstand}
              bundesland={bundesland}
              setBundesland={setBundesland}
              num={SECTIONS[0].n}
              id={SECTIONS[0].id}
              title={SECTIONS[0].title}
            />

            <AngabenEinkommenSection
              profile={profile}
              setProfile={setProfile}
              assumptions={assumptions}
              setAssumptions={setAssumptions}
              bavTaxFreeMonthly={bavTaxFreeMonthly}
              num={SECTIONS[1].n}
              id={SECTIONS[1].id}
              title={SECTIONS[1].title}
            />

            <AngabenRenteneintrittSection
              profile={profile}
              setProfile={setProfile}
              assumptions={assumptions}
              setAssumptions={setAssumptions}
              retirementHealthStatus={retirementHealthStatus}
              setRetirementHealthStatus={setRetirementHealthStatus}
              num={SECTIONS[2].n}
              id={SECTIONS[2].id}
              title={SECTIONS[2].title}
            />

            <AngabenAnnahmenSection
              assumptions={assumptions}
              setAssumptions={setAssumptions}
              resolvedRenditen={RESOLVED_RENDITEN}
              num={SECTIONS[3].n}
              id={SECTIONS[3].id}
              title={SECTIONS[3].title}
            />
          </article>

          {/* Right rail — "Warum wir das fragen". Folds below body on phone
              and each card collapses into a button-triggered disclosure. */}
          <aside className="angaben-aside">
            <AngabenAsideCard
              kicker="Warum wir das fragen"
              bodyId="angaben-aside-warum"
            >
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
            </AngabenAsideCard>

            <AngabenAsideCard
              kicker="Datenhaltung"
              bodyId="angaben-aside-datenhaltung"
            >
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
            </AngabenAsideCard>
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
