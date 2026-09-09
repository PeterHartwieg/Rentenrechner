import { useEffect, useRef, useSyncExternalStore } from 'react'
import './LandingPage.css'
import { LegalFooter } from '../legal/LegalFooter'
import type { ProductId } from '../../domain'
import type { Route } from '../../app/useRoute'
import { detectSavedMode, ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { JsonLd } from '../../seo/JsonLd'
import {
  buildHomeOrganizationJsonLd,
  buildHomeWebApplicationJsonLd,
  buildHomeWebSiteJsonLd,
} from '../../seo/organization'
import {
  buildCanonicalUrl,
  publicRouteRegistry,
  resolveTopicPreselection,
} from '../../seo/publicRouteRegistry'
import {
  HUB_CLUSTERS,
  countHubArticles,
  resolveFeaturedArticles,
} from './hubClusters'
import { RULES_YEAR } from '../../rules'
import { copy, resolveLang, DEFAULT_LANG } from '../../content/copy'
import type { CopyLang } from '../../content/copy'

/**
 * LandingChoice — payload fired by the two CTA buttons (and by the
 * `?topic=<slug>` auto-fire on first-time landing).
 *
 * `visibleProducts` (issue #13) is optional preselection metadata that the
 * caller may forward into the workspace (compare-mode) or the InventoryWizard
 * (combine-mode). It is `undefined` for plain CTA clicks; only the
 * topic-preselection auto-fire path populates it.
 */
export type LandingChoice =
  | { kind: 'combine'; visibleProducts?: readonly ProductId[] }
  | { kind: 'compare'; visibleProducts?: readonly ProductId[] }

interface Props {
  onChoice: (choice: LandingChoice) => void
  /**
   * Optional navigate handler. Threaded through to `LegalFooter` so the
   * footer's `Impressum` / `Datenschutz` links use SPA navigation when the
   * landing page is rendered inside the live app. The SSG prerender pass
   * passes a no-op — the rendered HTML still carries `<a href>` attributes,
   * so direct loads work; the SPA router takes over after hydration.
   */
  navigate?: (target: Route) => void
}

// Step copy lives in the copy catalog (`landing.step.*`); only the decorative
// ordinal stays inline. See `src/content/copy/entries/landing.copy.json`.
const PROCESS_STEPS: ReadonlyArray<{ n: string; headingKey: string; bodyKey: string }> = [
  { n: 'I.', headingKey: 'landing.step.beschreiben.heading', bodyKey: 'landing.step.beschreiben.body' },
  { n: 'II.', headingKey: 'landing.step.rechnen.heading', bodyKey: 'landing.step.rechnen.body' },
  { n: '+', headingKey: 'landing.step.entscheiden.heading', bodyKey: 'landing.step.entscheiden.body' },
]

// Runtime language pilot (Slice 6): the UI language is derived from the URL
// `?lang` param read as an *external store*. Using useSyncExternalStore (rather
// than setState-in-effect) keeps SSR + the German SSG prerender in German and
// lets the client switch after hydration with no hydration mismatch.
const LANG_CHANGE_EVENT = 'rw:langchange'

function subscribeLang(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(LANG_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(LANG_CHANGE_EVENT, onChange)
  }
}

const getLangSnapshot = (): CopyLang => resolveLang(window.location.search)
const getServerLangSnapshot = (): CopyLang => DEFAULT_LANG

function subscribeSavedMode(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

const getSavedSnapshot = () => detectSavedMode() !== null
const getServerSavedSnapshot = () => false

/**
 * Editorial hero with start/resume and compare actions beside a static example.
 * Two short onboarding steps and optional contracts precede articles, about,
 * and the topic hub. The example never consumes or modifies personal state.
 *
 * Topic preselection (issue #13): on mount the page reads `?topic=<slug>`
 * from `window.location.search`. If the slug matches a registered route's
 * `preselection` AND `detectSavedMode()` returns `null` (first-time visitor,
 * no saved workspace), the matching `LandingChoice` is auto-fired. Returning
 * users are never overridden — saved state always wins (PRD US-18).
 *
 * Inline JSON-LD (issue #03): `WebSite` + `Organization` + `WebApplication`.
 * All three blocks are emitted via the typed `<JsonLd>` component into the
 * page body so the SSG prerender output already carries them.
 */
export function LandingPage({ onChoice, navigate }: Props) {
  const route = publicRouteRegistry['/']
  const canonical = buildCanonicalUrl('/')
  const featured = resolveFeaturedArticles()
  const hubArticleCount = countHubArticles()

  // Runtime language pilot (Slice 6): `?lang` read as an external store (see the
  // module-level helpers). `t` reads the catalog with an explicit German
  // fallback for untranslated keys.
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot)
  const t = (key: string) => copy.text(key, lang)
  const hasSavedPlan = useSyncExternalStore(subscribeSavedMode, getSavedSnapshot, getServerSavedSnapshot)
  const exampleCurrency = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  })

  function switchLang(next: CopyLang) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (next === DEFAULT_LANG) url.searchParams.delete('lang')
    else url.searchParams.set('lang', next)
    window.history.replaceState(null, '', url.toString())
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT))
  }

  // Prerender path may pass undefined for `navigate`. We pass a stable no-op
  // through to LegalFooter — the rendered HTML still emits `<a href>` so
  // direct loads work; the live app threads its real navigate from useRoute.
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  // Auto-fire-once guard (issue #13): useEffect deps are stable (`onChoice` is
  // the only referenced value) but React 19 strict-mode runs effects twice in
  // dev. The ref ensures we never double-fire `onChoice` if the component
  // re-renders.
  const autoFiredRef = useRef(false)

  useEffect(() => {
    if (autoFiredRef.current) return
    if (typeof window === 'undefined') return
    // Returning users: saved state always wins. Never override on `?topic=`.
    if (detectSavedMode() !== null) return
    const preselection = resolveTopicPreselection(window.location.search)
    if (!preselection) return
    autoFiredRef.current = true
    if (preselection.mode === 'compare') {
      onChoice({ kind: 'compare', visibleProducts: preselection.visibleProducts })
    } else {
      onChoice({ kind: 'combine', visibleProducts: preselection.visibleProducts })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="landing-shell landing-shell--editorial">
      <main className="landing-main">
        {/* Hero and a clearly labelled, static result example. */}
        <section className="landing-top">
          <div className="landing-hero">
            <div className="landing-kicker">{t('landing.hero.kicker')}</div>
            <h1 className="landing-headline">{t('landing.hero.heading')}</h1>
            <p className="landing-subline">{t('landing.hero.lead')}</p>

            <div className="landing-cta-row">
              <button
                type="button"
                className="landing-btn landing-btn--primary"
                onClick={() => onChoice({ kind: 'combine' })}
              >
                <span>{t(hasSavedPlan ? 'landing.cta.resume' : 'landing.cta.combine')}</span>
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="landing-btn landing-btn--secondary"
                onClick={() => onChoice({ kind: 'compare' })}
              >
                <span>{t('landing.cta.compare')}</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>

            <p className="landing-microcopy">{t('landing.hero.microcopy')}</p>
          </div>

          <aside className="landing-example" aria-label={t('landing.example.aria')}>
            <h2 className="landing-aside-kicker">{t('landing.example.heading')}</h2>
            <div className="landing-example-total">{t('landing.example.total')}</div>
            <p className="landing-example-label">
              {t('landing.example.label')}<br />
              <span>{t('landing.example.basis')}</span>
            </p>
            <dl className="landing-example-rows">
              <div><dt>{t('landing.example.pension')}</dt><dd>{exampleCurrency.format(1900)}</dd></div>
              <div><dt>{t('landing.example.etf')}</dt><dd>{exampleCurrency.format(350)}</dd></div>
              <div><dt>{t('landing.example.bav')}</dt><dd>{exampleCurrency.format(200)}</dd></div>
            </dl>
            <p className="landing-example-note">{t('landing.example.note')}</p>
          </aside>
        </section>

        <ol className="landing-steps" aria-label={t('landing.steps.aria')}>
          {PROCESS_STEPS.map((step) => (
            <li key={step.n} className="landing-step">
              <div className="landing-step-num" aria-hidden="true">{step.n}</div>
              <div className="landing-step-h">{t(step.headingKey)}</div>
              <div className="landing-step-p">{t(step.bodyKey)}</div>
            </li>
          ))}
        </ol>

        <aside className="landing-aside" aria-label={t('landing.aside.aria')}>
          <div className="landing-aside-card landing-aside-card--featured">
            <div className="landing-aside-kicker">{t('landing.featured.kicker')}</div>
            <ul className="landing-featured-list">
              {featured.map((a) => (
                <li key={a.href} className="landing-featured-item">
                  <a href={a.href} className="landing-featured-link">
                    <span className="landing-featured-title">{a.label}</span>
                    <span className="landing-featured-meta">{a.cluster}</span>
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="/artikel"
              className="landing-featured-all"
              onClick={(event) => {
                if (!navigate) return
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.artikel)
              }}
            >
              Alle {hubArticleCount} Themen ansehen →
            </a>
          </div>

          <div className="landing-aside-card landing-aside-card--about">
            <div className="landing-aside-kicker">{t('landing.about.kicker')}</div>
            <p className="landing-about-body">
              RentenWiki.de ist ein Einzelprojekt von Peter Hartwieg.
              Keine Werbung, keine Provisionen. Freiwillige Unterstützung
              fließt nach Abzug der Zahlungsgebühren zurück in die Weiterentwicklung.
              {' '}<a href="#unterstuetzen">Projekt unterstützen</a>
            </p>
            <p className="landing-about-license">
              Der Quellcode steht unter{' '}
              <span className="landing-about-license-name">PolyForm Noncommercial 1.0.0</span>
              {' '}offen. Versicherungs­makler, Anlageberater und Arbeitgeber
              brauchen eine separate kommerzielle Lizenz.
            </p>
          </div>
        </aside>

        {/* Topic-page hub — issue #03. Sectioned `Alles im Überblick` block
            below the hero. Five clusters, 10 anchors. */}
        <nav className="landing-hub" aria-labelledby="landing-hub-heading">
          <h2 id="landing-hub-heading" className="landing-hub-heading">
            {t('landing.hub.heading')}
          </h2>
          <div className="landing-hub-clusters">
            {HUB_CLUSTERS.map((cluster) => (
              <section key={cluster.heading} className="landing-hub-cluster">
                <h3 className="landing-hub-cluster-heading">{cluster.heading}</h3>
                <ul className="landing-hub-links">
                  {cluster.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className="landing-hub-link">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </main>

      {/* Visible "Stand" line for JSON-LD `dateModified` (Google structured-data
          guideline: every JSON-LD field must have a visible counterpart). */}
      {/* Runtime language pilot (Slice 6): display-only DE/EN switch. Exports
          and legal text stay German; this only re-renders catalog strings. */}
      <div className="landing-lang-switch" role="group" aria-label="Sprache / Language">
        <button
          type="button"
          className={lang === 'de' ? 'is-active' : undefined}
          aria-pressed={lang === 'de'}
          onClick={() => switchLang('de')}
        >
          Deutsch
        </button>
        <button
          type="button"
          className={lang === 'en' ? 'is-active' : undefined}
          aria-pressed={lang === 'en'}
          onClick={() => switchLang('en')}
        >
          English
        </button>
      </div>

      <p className="landing-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />

      {/* Inline JSON-LD (issue #03): WebSite + Organization + WebApplication. */}
      <JsonLd data={buildHomeWebSiteJsonLd(canonical)} />
      <JsonLd data={buildHomeOrganizationJsonLd(canonical)} />
      <JsonLd
        data={buildHomeWebApplicationJsonLd({
          canonical,
          title: route.title,
          summary: route.summary,
          dateModified: route.dateModified,
        })}
      />
    </div>
  )
}
