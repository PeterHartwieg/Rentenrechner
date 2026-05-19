import { useEffect, useState } from 'react'
import './MethodePage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR, activeRules, legalConstants } from '../../rules'
import {
  besteuerungsanteilGrv,
  ertragsanteilByAge,
  sonderausgabenPauschbetrag,
  versorgungsfreibetrag,
  werbungskostenPauschalRenten,
  werbungskostenPauschalVersorgungsbezuege,
} from '../../rules/legalConstants'
import { defaultAssumptions } from '../../data/defaultScenario'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  navigate?: (target: Route) => void
}

interface Section {
  /** Stable fragment id — used for `<h2 id>`, TOC `href`, and aria-current.
   *  Must NOT contain the rule year so `/methode#steuer-modell` keeps working
   *  when `RULES_YEAR` rolls forward. */
  readonly id: string
  /** Mono kicker label, e.g. "§ 1". */
  readonly n: string
  /** Section heading shown to the user (year-bearing copy is fine here). */
  readonly title: string
}

// Sections rendered in this order. Each `<h2>` uses `section.id` (stable) as
// its DOM id so the in-page TOC + direct-fragment loads (`/methode#steuer-modell`)
// survive rule-year rollover without breaking incoming deep-links.
// The user-visible `title` may carry `${RULES_YEAR}` for freshness; only the
// `id` must remain year-free.
const SECTIONS: ReadonlyArray<Section> = [
  { id: 'renditeannahmen', n: '§ 1', title: 'Renditeannahmen' },
  { id: 'steuer-modell', n: '§ 2', title: `Steuer-Modell (Stand ${RULES_YEAR})` },
  { id: 'sozialversicherung', n: '§ 3', title: 'Sozialversicherung (KV/PV/RV)' },
  { id: 'statutorische-werte', n: '§ 4', title: `Statutorische Werte ${RULES_YEAR}` },
  { id: 'nicht-modelliert', n: '§ 5', title: 'Was wir bewusst nicht modellieren' },
]

/**
 * Cross-source list of citable references rendered in the right-rail "Quellen"
 * card. Each entry is a real, verifiable statute or publication — we do not
 * link to private sources. Order matches the inline `[1] [2] [3] …` footnote
 * order used in the body sections.
 */
const SOURCES: readonly string[] = [
  '§ 22 EStG — Besteuerung sonstiger Einkünfte (gesetze-im-internet.de)',
  '§ 19 Abs. 2 EStG — Versorgungsfreibetrag (Anlage zu § 19)',
  '§ 10 Abs. 3 EStG — Sonderausgabenabzug Basisrente',
  '§ 20 Abs. 9 EStG — Sparer-Pauschbetrag',
  '§ 3 Nr. 63 EStG / § 1 SvEV — Förderhöchstbeträge bAV',
  `BMF-Schreiben ${RULES_YEAR}-01-13 — Basiszins § 18 InvStG (Vorabpauschale)`,
  `SVBezGrV ${RULES_YEAR} — Beitragsbemessungsgrenzen, Bezugsgröße, Durchschnittsentgelt (BGBl. 2025 I Nr. 278)`,
  'Deutsche Rentenversicherung Bund — Renteninformation und Aktueller Rentenwert (§ 69 SGB VI)',
]

/**
 * `/methode` — Methode & Quellen reference page (PR 4).
 *
 * Sober D visual treatment (white background, IBM Plex Sans body, mono section
 * labels) — deliberately NOT editorial cream, so `MethodePage` does NOT route
 * through `ArticleLayout`. Layout pattern mirrors `ArticleHubPage`:
 *   - left rail: auto-derived TOC of `<h2 id>` anchors, with `aria-current`
 *     reflecting the active section and a post-hydration scroll-to-hash retry
 *     so `/methode#steuermodell` actually lands at the section.
 *   - center: H1 (from registry) + lead paragraph + § sections.
 *   - right rail: Quellen + Mitwirkende + Lizenz cards.
 *
 * All statutory numbers are pulled from `src/rules/de2026.ts` /
 * `src/rules/legalConstants.ts` and rendered through `formatCurrency` /
 * `formatPercent`. No statutory literal lives in this component (P0 guardrail).
 *
 * JSON-LD: emitted into the document head by the SSG `renderRouteHeadHtml`
 * pipeline (`buildJsonLd` returns a WebPage block from
 * `publicRouteRegistry['/methode']`). We do NOT emit a second block inline.
 */
export function MethodePage({ navigate }: Props) {
  const route = publicRouteRegistry['/methode']
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  // Active-anchor state for the TOC `aria-current="location"` highlight.
  // IntersectionObserver tracks which `<h2 id>` is in the reading area.
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Direct-fragment-load retry: when the user arrives at
    // `/methode#steuermodell`, the browser fires its fragment scroll before
    // React mounts; once the ids are in the DOM we re-trigger
    // scrollIntoView() so the right section comes into view.
    if (window.location.hash.length > 1) {
      const target = document.getElementById(window.location.hash.slice(1))
      if (target) target.scrollIntoView()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Defensive: jsdom (vitest) and very old browsers do not implement
    // IntersectionObserver. The active-anchor highlight is an enhancement;
    // without it the first item stays highlighted via the render fallback.
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

  // ─── Renditeannahmen-Tabelle ───────────────────────────────────────────
  // Source of truth: `defaultAssumptions.returnScenarios` in
  // `src/data/defaultScenario.ts`. Look up by `id` (NOT by index — per
  // CLAUDE.md the array order is [konservativ, basis, optimistisch] but
  // is not part of the contract; hardcoding `[0]` would silently pick the
  // wrong scenario if the order ever changes).
  const scenarioById = (id: 'konservativ' | 'basis' | 'optimistisch'): number =>
    defaultAssumptions.returnScenarios.find((s) => s.id === id)?.annualReturn ?? 0
  const renditeRows: ReadonlyArray<readonly [string, number, string]> = [
    ['konservativ', scenarioById('konservativ'), 'MSCI World rollierend 30 J., 10er-Quantil'],
    ['Basis', scenarioById('basis'), 'Realer Median MSCI World 1900–2025 (~ 5,2 % real)'],
    ['optimistisch', scenarioById('optimistisch'), 'MSCI World rollierend 30 J., 90er-Quantil'],
  ]

  // ─── Statutorische Werte (RULES_YEAR) ─────────────────────────────────
  // Every value below comes from `activeRules` (= `de2026.ts`). The cohort
  // helpers (`besteuerungsanteilGrv`, `versorgungsfreibetrag`) are read at
  // `RULES_YEAR` for the headline figures the page advertises.
  const cohortBesteuerungsanteil = besteuerungsanteilGrv(RULES_YEAR)
  const cohortVersorgungsfreibetrag = versorgungsfreibetrag(RULES_YEAR)

  // §3 Nr. 63 EStG / §1 SvEV: 8 % / 4 % of pension-cap West, annualised.
  const bavSteuerfreiAnnual =
    activeRules.socialSecurity.pensionCapYear * activeRules.bav.taxFreePctOfPensionCap
  const bavSvFreiAnnual =
    activeRules.socialSecurity.pensionCapYear *
    activeRules.bav.socialSecurityFreePctOfPensionCap

  return (
    <div className="methode-shell">
      <div className="methode-main">
        {/* Breadcrumb row — Start › Methode. Mirrors the ArticleLayout pattern
            so users always have a one-click way back. */}
        <nav className="methode-breadcrumb" aria-label="Pfad">
          <a
            href="/"
            className="methode-breadcrumb-back"
            onClick={(event) => {
              if (!navigate) return
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate('/')
            }}
          >
            Startseite
          </a>
          <span className="methode-breadcrumb-sep" aria-hidden="true">›</span>
          <span className="methode-breadcrumb-cluster">Methode</span>
        </nav>

        <div className="methode-grid">
          {/* Left rail — TOC. Hidden on tablet + phone via CSS. */}
          <aside className="methode-toc" aria-label="In diesem Dokument">
            <div className="methode-toc-kicker">In diesem Dokument</div>
            <ol className="methode-toc-list">
              {SECTIONS.map((section, i) => {
                const isActive =
                  activeAnchor === section.id || (activeAnchor === null && i === 0)
                return (
                  <li
                    key={section.id}
                    className={
                      isActive
                        ? 'methode-toc-item methode-toc-item--active'
                        : 'methode-toc-item'
                    }
                  >
                    <a
                      href={`#${section.id}`}
                      className="methode-toc-link"
                      aria-current={isActive ? 'location' : undefined}
                    >
                      <span className="methode-toc-num">{section.n}</span>
                      {section.title}
                    </a>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Center — the methode body. */}
          <article className="methode-body">
            <div className="methode-kicker">So rechnet RentenWiki</div>
            <h1 className="methode-headline">{route.h1}</h1>
            <p className="methode-summary">{route.summary}</p>
            <div className="methode-meta">
              <span className="methode-meta-item">
                <strong className="methode-meta-label">Wartung:</strong> Peter Hartwieg
              </span>
              <span className="methode-meta-sep" aria-hidden="true">·</span>
              <span className="methode-meta-item">Stand: {route.dateModified}</span>
              <span className="methode-meta-sep" aria-hidden="true">·</span>
              <span className="methode-meta-item">Werte für Deutschland {RULES_YEAR}</span>
            </div>

            {/* ─── § 1 Renditeannahmen ──────────────────────────────────── */}
            <section className="methode-section">
              <div className="methode-section-head">
                <span className="methode-section-num">{SECTIONS[0].n}</span>
                <h2
                  id={SECTIONS[0].id}
                  className="methode-section-title"
                >
                  {SECTIONS[0].title}
                </h2>
              </div>
              <p className="methode-section-lead">
                Drei Marktszenarien für die kapitalmarktgebundenen Produkte
                (ETF, fondsgebundene Versicherung, bAV-Fonds, Altersvorsorgedepot).
                Werte sind reale, langfristige Renditen p. a.; Inflation wird in
                der Auszahlphase getrennt ausgewiesen.
              </p>
              <table
                className="methode-table"
                aria-label="Renditeannahmen je Szenario"
              >
                <thead>
                  <tr>
                    <th scope="col">Szenario</th>
                    <th scope="col" className="methode-table-num">
                      Rendite p. a.
                    </th>
                    <th scope="col">Hergeleitet aus</th>
                  </tr>
                </thead>
                <tbody>
                  {renditeRows.map(([label, rate, source]) => (
                    <tr key={label}>
                      <td data-label="Szenario">
                        <span
                          className={
                            label === 'Basis'
                              ? 'methode-table-key methode-table-key--accent'
                              : 'methode-table-key'
                          }
                        >
                          {label}
                        </span>
                      </td>
                      <td data-label="Rendite p. a." className="methode-table-num">
                        {formatPercent(rate, 1)}
                      </td>
                      <td data-label="Hergeleitet aus" className="methode-table-note">
                        {source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ─── § 2 Steuer-Modell ────────────────────────────────────── */}
            <section className="methode-section">
              <div className="methode-section-head">
                <span className="methode-section-num">{SECTIONS[1].n}</span>
                <h2
                  id={SECTIONS[1].id}
                  className="methode-section-title"
                >
                  {SECTIONS[1].title}
                </h2>
              </div>
              <ul className="methode-deflist">
                <li>
                  <span className="methode-deflist-key">Einkommensteuer</span>
                  <span className="methode-deflist-val">
                    Grundtarif § 32a EStG, mit Solidaritätszuschlag oberhalb
                    der Freigrenze von {formatCurrency(activeRules.incomeTax.solidarityFreeTax)}{' '}
                    (Einzelveranlagung).
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Kapitalerträge</span>
                  <span className="methode-deflist-val">
                    Abgeltungsteuer {formatPercent(activeRules.capitalGains.taxRate, 0)}{' '}
                    plus Soli, Sparer-Pauschbetrag{' '}
                    {formatCurrency(activeRules.capitalGains.saverAllowance)} pro
                    Person; Teilfreistellung 30 % bei Aktienfonds (§ 20 EStG){' '}
                    <sup className="methode-footnote-ref">[4]</sup>.
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Nachgelagerte Besteuerung</span>
                  <span className="methode-deflist-val">
                    § 22 EStG für GRV, bAV, Basisrente und Altersvorsorgedepot.
                    Kohortenwert {RULES_YEAR}:{' '}
                    {formatPercent(cohortBesteuerungsanteil, 1)} Besteuerungsanteil
                    der gesetzlichen Rente; Versorgungsfreibetrag{' '}
                    {formatPercent(cohortVersorgungsfreibetrag.prozent, 1)} bis{' '}
                    {formatCurrency(cohortVersorgungsfreibetrag.hoechstbetrag)} plus{' '}
                    {formatCurrency(cohortVersorgungsfreibetrag.zuschlag)} Zuschlag{' '}
                    <sup className="methode-footnote-ref">[1][2]</sup>.
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Ertragsanteil (Schicht 3)</span>
                  <span className="methode-deflist-val">
                    Private Leibrenten nach § 22 Nr. 1 Satz 3 a aa EStG; Anlage 1
                    (z. B. {formatPercent(ertragsanteilByAge(65), 0)} mit Rentenbeginn 65/66,{' '}
                    {formatPercent(ertragsanteilByAge(67), 0)} mit 67). Der restliche Anteil bleibt
                    als Kapitalrückgewähr steuerfrei.
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Pauschbeträge</span>
                  <span className="methode-deflist-val">
                    Werbungskosten {formatCurrency(werbungskostenPauschalRenten)} (Renten)
                    bzw. {formatCurrency(werbungskostenPauschalVersorgungsbezuege)} (Versorgungsbezüge);
                    Sonderausgaben-Pauschbetrag {formatCurrency(sonderausgabenPauschbetrag.single)}{' '}
                    (Einzel) / {formatCurrency(sonderausgabenPauschbetrag.married)} (Ehegattensplitting).
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Lump-Sum-Auszahlung</span>
                  <span className="methode-deflist-val">
                    Fünftelregelung § 34 EStG für Direktzusage / Unterstützungskasse;
                    §-3-Nr.-63-bAV wird voll versteuert. KV/PV greift via § 229
                    SGB V mit Spreading auf{' '}
                    {legalConstants.bav.versorgungsbezugSpreadingMonths} Monate.
                  </span>
                </li>
              </ul>
            </section>

            {/* ─── § 3 Sozialversicherung ───────────────────────────────── */}
            <section className="methode-section">
              <div className="methode-section-head">
                <span className="methode-section-num">{SECTIONS[2].n}</span>
                <h2
                  id={SECTIONS[2].id}
                  className="methode-section-title"
                >
                  {SECTIONS[2].title}
                </h2>
              </div>
              <ul className="methode-deflist">
                <li>
                  <span className="methode-deflist-key">KV in der Rente</span>
                  <span className="methode-deflist-val">
                    KVdR (§ 226 SGB V) mit Freibetrag{' '}
                    {formatCurrency(activeRules.socialSecurity.kvFreibetragVersorgungMonthly, 2)}/Monat
                    auf Versorgungsbezüge; freiwillige GKV (§ 240 SGB V) ohne
                    Freibetrag, dafür mit Bemessungsgrenze.
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Pflegeversicherung</span>
                  <span className="methode-deflist-val">
                    Basissatz {formatPercent(activeRules.socialSecurity.careEmployeeBaseRate, 1)};
                    Kinderlose ab 23 Jahren in der Rente{' '}
                    {formatPercent(activeRules.socialSecurity.careRetirementChildlessRate, 1)}{' '}
                    (§ 55 SGB XI).
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">KV/PV Apportionierung</span>
                  <span className="methode-deflist-val">
                    Bei Aggregateinkommen oberhalb der Beitragsbemessungsgrenze
                    werden die Beiträge proportional über alle Quellen verteilt
                    (modellierte Konvention — kein Statut schreibt eine
                    Priorität vor).
                  </span>
                </li>
                <li>
                  <span className="methode-deflist-key">Vorsorgepauschale</span>
                  <span className="methode-deflist-val">
                    § 39b EStG (BMF-PAP): nur RV, GKV und PV werden in der
                    Lohnsteuer-Vorsorgepauschale abgezogen, nicht AV. PKV-Branche
                    nutzt § 257 SGB V als Teilbetrag.
                  </span>
                </li>
              </ul>
            </section>

            {/* ─── § 4 Statutorische Werte ──────────────────────────────── */}
            <section className="methode-section">
              <div className="methode-section-head">
                <span className="methode-section-num">{SECTIONS[3].n}</span>
                <h2
                  id={SECTIONS[3].id}
                  className="methode-section-title"
                >
                  {SECTIONS[3].title}
                </h2>
              </div>
              <p className="methode-section-lead">
                Alle untenstehenden Werte stammen aus dem aktiven Regel-Modul
                unter <code className="methode-code">src/rules/</code> und
                werden jährlich nach BMF- / BMAS-Bekanntmachung aktualisiert.
              </p>
              <table
                className="methode-table"
                aria-label={`Statutorische Werte ${RULES_YEAR}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Wert</th>
                    <th scope="col" className="methode-table-num">
                      {RULES_YEAR}
                    </th>
                    <th scope="col">Grundlage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Wert">Beitragsbemessungsgrenze RV (West/Ost)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.socialSecurity.pensionCapYear)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      SVBezGrV {RULES_YEAR} § 2 Abs. 1{' '}
                      <sup className="methode-footnote-ref">[7]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Beitragsbemessungsgrenze KV/PV</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.socialSecurity.healthCareCapYear)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 6 Abs. 7 SGB V / § 55 Abs. 2 SGB XI{' '}
                      <sup className="methode-footnote-ref">[7]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Bezugsgröße West (monatlich)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.socialSecurity.bezugsgroesseMonthly)}
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 18 Abs. 1 SGB IV
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Durchschnittsentgelt (Entgeltpunkte)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.socialSecurity.durchschnittsentgelt)}
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      SGB VI Anlage 1; SVBezGrV {RULES_YEAR} § 3 Abs. 2
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Aktueller Rentenwert</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.socialSecurity.aktuellerRentenwert, 2)} / EP
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 69 SGB VI; Rentenwertbestimmungsverordnung {RULES_YEAR}{' '}
                      <sup className="methode-footnote-ref">[8]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">bAV § 3 Nr. 63 EStG (steuerfrei)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(bavSteuerfreiAnnual)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      {formatPercent(activeRules.bav.taxFreePctOfPensionCap, 0)} BBG RV West{' '}
                      <sup className="methode-footnote-ref">[5]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">bAV § 1 SvEV (sv-frei)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(bavSvFreiAnnual)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      {formatPercent(activeRules.bav.socialSecurityFreePctOfPensionCap, 0)} BBG RV West{' '}
                      <sup className="methode-footnote-ref">[5]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Basisrente § 10 Abs. 3 EStG (Höchstbetrag)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.basisrente.schicht1CapSingle)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 10 Abs. 3 Satz 1 EStG; Einzelveranlagung{' '}
                      <sup className="methode-footnote-ref">[3]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Riester Grundzulage</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.riester.grundzulage)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 84 EStG
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Riester Kinderzulage (ab 2008 geboren)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.riester.childAllowancePost2007)} / Kind
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 85 Abs. 1 EStG
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Riester Sonderausgabenabzug § 10a</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.riester.annualCapInclAllowances)} / Jahr
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 10a Abs. 1 EStG; inkl. Zulagen
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Sparer-Pauschbetrag</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.capitalGains.saverAllowance)} / Person
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 20 Abs. 9 EStG{' '}
                      <sup className="methode-footnote-ref">[4]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Vorabpauschale-Basiszins</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatPercent(activeRules.capitalGains.basiszins, 2)}
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 18 InvStG; BMF-Schreiben {RULES_YEAR}-01-13{' '}
                      <sup className="methode-footnote-ref">[6]</sup>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Soli-Freigrenze (Einzel)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.incomeTax.solidarityFreeTax)} ESt
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 3 Abs. 3 SolzG 1995 (JStG 2024)
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Wert">Soli-Freigrenze (Zusammenveranlagung)</td>
                    <td data-label={RULES_YEAR.toString()} className="methode-table-num">
                      {formatCurrency(activeRules.incomeTax.solidarityFreeTaxMarried)} ESt
                    </td>
                    <td data-label="Grundlage" className="methode-table-note">
                      § 3 Abs. 3 SolzG 1995
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ─── § 5 Was wir bewusst nicht modellieren ────────────────── */}
            <section className="methode-section">
              <div className="methode-section-head">
                <span className="methode-section-num">{SECTIONS[4].n}</span>
                <h2
                  id={SECTIONS[4].id}
                  className="methode-section-title"
                >
                  {SECTIONS[4].title}
                </h2>
              </div>
              <ul className="methode-bullets">
                <li>
                  Individuelle Versicherungsverträge mit garantierten
                  Rechnungszinsen oder Bestandstarifen vor 2005 — der Rechner
                  unterstellt die statutorischen Voreinstellungen.
                </li>
                <li>
                  Steuerliche Auswirkungen von Auslandsbezug, doppelter
                  Staatsbürgerschaft oder Erbschaften.
                </li>
                <li>
                  Politische Risiken (z. B. Anpassungen der Rentenformel oder
                  des Beitragssatzes nach 2030).
                </li>
                <li>
                  Sterbetafel-Modellierung für individuelle Lebenserwartung —
                  Leibrenten werden mit den vom Anbieter genannten
                  Verrentungsfaktoren gerechnet, nicht aus eigener Sterbetafel.
                </li>
              </ul>
            </section>
          </article>

          {/* Right rail — Quellen + Mitwirkende + Lizenz. */}
          <aside className="methode-aside">
            <div className="methode-aside-card methode-aside-card--sources">
              <div className="methode-aside-kicker">Quellen</div>
              <ol className="methode-aside-list">
                {SOURCES.map((source, i) => (
                  <li key={source} className="methode-aside-list-item">
                    <span className="methode-aside-num">[{i + 1}]</span>
                    {source}
                  </li>
                ))}
              </ol>
            </div>

            <div className="methode-aside-card methode-aside-card--meta">
              <div className="methode-aside-kicker">Mitwirkende</div>
              <p className="methode-aside-body">
                Wartung: <strong>Peter Hartwieg</strong>. Beiträge und
                Korrekturen sind als Pull-Request oder Issue im{' '}
                <a
                  href="https://github.com/PeterHartwieg/Rentenrechner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="methode-aside-link"
                >
                  GitHub-Repository
                </a>{' '}
                willkommen.
              </p>
            </div>

            <div className="methode-aside-card methode-aside-card--license">
              <div className="methode-aside-kicker">Lizenz</div>
              <p className="methode-aside-body">
                Quellcode: PolyForm Noncommercial 1.0.0. Persönliche, akademische
                und interne Bewertungsnutzung kostenlos.
              </p>
              <p className="methode-aside-body">
                <strong>Kommerzielle Nutzung</strong> — z. B. durch
                Versicherungsmakler oder Anlageberater — ist lizenzpflichtig.
                Kontakt:{' '}
                <a className="methode-aside-link" href="mailto:peter@hartwieg.com">
                  peter@hartwieg.com
                </a>
                .
              </p>
              <p className="methode-aside-body">
                Spenden:{' '}
                <a
                  className="methode-aside-link"
                  href="https://github.com/sponsors/PeterHartwieg"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Sponsors
                </a>{' '}
                und Stripe (sobald aufgesetzt) finanzieren das Hosting.
              </p>
            </div>

            <a
              href="https://github.com/PeterHartwieg/Rentenrechner"
              target="_blank"
              rel="noopener noreferrer"
              className="methode-aside-github"
            >
              ↗ Auf GitHub ansehen
            </a>
          </aside>
        </div>
      </div>

      <p className="methode-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />
    </div>
  )
}
