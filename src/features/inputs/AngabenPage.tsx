import { useCallback, useEffect, useState, type ReactNode, type SetStateAction } from 'react'
import './AngabenPage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR, activeRules } from '../../rules'
import { defaultAssumptions } from '../../data/defaultScenario'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { useAngabenState } from '../../app/useAngabenState'
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
 * state. On phone the body is hidden via the native `hidden` attribute when
 * collapsed; React sets `hidden={isPhone && !open}` directly on the body
 * wrapper so no CSS selector is needed. Toggling the button flips that
 * boolean and updates the `aria-expanded` value; the body re-displays
 * without a remount. Keyboard a11y comes for free from the native
 * `<button>` element (Enter / Space toggle).
 *
 * On desktop + tablet the button is `disabled` so the click handler never
 * fires and the body stays visible. The kicker keeps its visual styling on
 * desktop + tablet via CSS.
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
  // Default phone state: collapsed. Desktop + tablet: body always rendered,
  // but `expanded` is still true so the aria-expanded value reads "true" for
  // assistive tech parsing the rendered DOM.
  const isPhone = viewport === 'phone'
  const [open, setOpen] = useState<boolean>(false)
  const expanded = isPhone ? open : true

  return (
    <div className="angaben-aside-card">
      <button
        type="button"
        className="angaben-aside-toggle"
        // Desktop + tablet: the button is `disabled` so click and keyboard
        // activation are no-ops and the element is removed from the tab
        // order. This is acceptable because the card body is always visible
        // on these viewports — AT users access the content directly without
        // needing to interact with the toggle. On phone the button is
        // enabled and drives the disclosure (`aria-expanded` + `hidden`).
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

// §3 Nr. 63 EStG contribution-cap headroom for the bAV-Brutto hint. Computed
// at module-eval time — `activeRules` is a module-level constant, so the
// value is fixed for the lifetime of the bundle. Mirrors `RESOLVED_RENDITEN`
// above; no React memo / effect is needed.
const BAV_TAX_FREE_MONTHLY =
  (activeRules.socialSecurity.pensionCapYear * activeRules.bav.taxFreePctOfPensionCap) / 12

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
 * State scope: profile / assumptions flow through `useAngabenState`
 * (issue #282 — mode-aware binding). The hook captures the active mode once
 * at mount via `detectSavedMode()` and routes reads + writes to whichever
 * store is authoritative:
 *   - compare-mode (or first-time visitor with no saved state): edits flow
 *     into `useCalculatorState` and persist via `STORAGE_KEY_V1`; the `/`
 *     compare dashboard reads the same key on next mount.
 *   - combine-mode (returning user with `mode: 'combine'` on the v2
 *     workspace): edits flow into the workspace `baseline.profile` /
 *     `baseline.assumptions` and persist via `STORAGE_KEY_V2`; the `/`
 *     combine dashboard reads the same workspace on next mount.
 * The mode-detection heuristic and the workspace-projection strategy live in
 * `src/app/useAngabenState.ts` — extend behaviour there, not here.
 *
 * `familienstand` and `bundesland` remain ephemeral on this page in BOTH
 * modes — they are not part of `PersonalProfile` / `ScenarioAssumptions` and
 * extending those types is a P0 storage-shape change (per CLAUDE.md
 * "Storage path bypassing `migrateAndValidateState`"). `retirementHealthStatus`
 * lives on `assumptions.statutoryPension` and DOES persist via the active
 * store in both modes.
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

  // Mode-aware state binding (issue #282). `useAngabenState` captures the
  // active session mode once at mount and routes reads + writes to either the
  // compare-mode singleton (STORAGE_KEY_V1) or the combine-mode workspace
  // (STORAGE_KEY_V2). The `/` dashboard for the matching mode reads the same
  // store on its next mount, so edits round-trip in both modes. The hook
  // exposes the same `{ profile, setProfile, assumptions, setAssumptions }`
  // shape that `useCalculatorState` does — the four section components below
  // stay mode-agnostic. See `src/app/useAngabenState.ts` for the routing
  // logic and the heuristic that pins the mode.
  const { profile, setProfile, assumptions, setAssumptions, mode } = useAngabenState()
  // `familienstand` and `bundesland` are NOT part of `PersonalProfile`, so
  // they remain ephemeral on this page in BOTH modes and reset to the
  // defaults on every reload / route change. Routing them through the
  // calculator state would require extending `PersonalProfile`'s shape —
  // a P0 storage-shape change per CLAUDE.md's "Storage path bypassing
  // `migrateAndValidateState`" P1 guardrail. The visible storage copy below
  // honestly names which fields persist (and which do not) so the copy and
  // reality cannot drift.
  const [familienstand, setFamilienstand] = useState<string>(FAMILIENSTAND_DEFAULT)
  const [bundesland, setBundesland] = useState<string>(BUNDESLAND_DEFAULT)
  // `retirementHealthStatus` lives on `assumptions.statutoryPension`, so the
  // page reads it directly from the persisted scenario and writes it back via
  // `setAssumptions`. Fall back to 'kvdr' if the persisted scenario does not
  // carry one so the radio always has a checked option. The section component
  // takes a narrow `Dispatch<SetStateAction<RetirementHealthStatus>>` setter,
  // so we adapt the assumption-side update behind a memoised callback.
  const retirementHealthStatus =
    assumptions.statutoryPension.retirementHealthStatus ?? 'kvdr'
  const setRetirementHealthStatus = useCallback(
    (next: SetStateAction<'kvdr' | 'freiwillig_gkv' | 'pkv'>) => {
      setAssumptions((current) => {
        const prev = current.statutoryPension.retirementHealthStatus ?? 'kvdr'
        const resolved = typeof next === 'function' ? next(prev) : next
        if (resolved === prev) return current
        return {
          ...current,
          statutoryPension: {
            ...current.statutoryPension,
            retirementHealthStatus: resolved,
          },
        }
      })
    },
    [setAssumptions],
  )

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
              navigate(ROUTES.home)
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
              Alter, Einkommen, Renteneintrittsalter und Annahmen werden{' '}
              <strong>lokal in deinem Browser</strong> gespeichert (localStorage) und
              bei späteren Besuchen wiederhergestellt
              {mode === 'combine' ? ' (Workspace-Speicher)' : ''}.
              Familienstand und Bundesland gelten nur für die laufende Sitzung
              und werden nicht persistiert. Es werden keine Daten an Server
              übertragen, keine Cookies gesetzt und keine Identifier persistiert.
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
              bavTaxFreeMonthly={BAV_TAX_FREE_MONTHLY}
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
                <strong>Lokal im Browser.</strong> Alter, Einkommen,
                Renteneintrittsalter und die Renditeannahmen werden im
                localStorage gespeichert; Familienstand und Bundesland gelten
                nur für die laufende Sitzung und werden nicht persistiert.
                Keine Server-Übertragung, kein Account, keine Cookies, keine
                Identifier. Du kannst den Browser-Speicher jederzeit über die
                Einstellungen deines Browsers leeren — damit ist auch der
                gespeicherte RentenWiki-Stand entfernt.
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
                    navigate(ROUTES.methode)
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
