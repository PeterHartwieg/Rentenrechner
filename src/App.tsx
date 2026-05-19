import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { AppView } from './app/useRoute'
import { useRoute, detectSavedMode, appViewFromMode } from './app/useRoute'
import type { LandingChoice } from './features/landing/LandingPage'
import { QaFeedbackProvider, QaModeIndicator } from './features/qa-feedback'
import { AppShell } from './ui/chrome/AppShell'
import { isEditorialChromeRoute } from './features/articles/articleResolver'
import './App.css'

// ---------------------------------------------------------------------------
// Code-splitting boundaries.
// ---------------------------------------------------------------------------
// `Calculator` (compare-mode + combine-mode dashboard, engine, charts,
// Monte Carlo, recommender, inventory) is the heaviest chunk by far —
// hidden behind the landing page on `/` for first-time visitors.
//
// Topic pages, legal pages and the 404 page each emit their own chunk so a
// user landing on `/bav-rechner/` only fetches that page's JS plus the small
// app shell.  The prerender step (scripts/prerender.mjs) renders the page
// content statically into the HTML so first paint is unaffected by the lazy
// boundary; the lazy chunk loads after the initial bundle and React hydrates
// the prerendered DOM once it arrives.
//
// `LandingPage` is lazy too: route `/` has no `data-rentenwiki-prerendered`
// marker (createRoot replaces the prerendered HTML on hydration regardless),
// so paying the extra round-trip on the homepage is acceptable, and topic
// pages don't have to ship LandingPage's icons + hub-cluster data.
// ---------------------------------------------------------------------------
const Calculator = lazy(() => import('./Calculator'))
const LandingPage = lazy(() =>
  import('./features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)
const ImpressumPage = lazy(() =>
  import('./features/legal/ImpressumPage').then((m) => ({ default: m.ImpressumPage })),
)
const DatenschutzPage = lazy(() =>
  import('./features/legal/DatenschutzPage').then((m) => ({ default: m.DatenschutzPage })),
)
const ArticleHubPage = lazy(() =>
  import('./features/articles/ArticleHubPage').then((m) => ({ default: m.ArticleHubPage })),
)
const MethodePage = lazy(() =>
  import('./features/methode/MethodePage').then((m) => ({ default: m.MethodePage })),
)
const RentenluckeRechnerPage = lazy(() =>
  import('./features/publicPages/RentenluckeRechnerPage').then((m) => ({ default: m.RentenluckeRechnerPage })),
)
const BavRechnerPage = lazy(() =>
  import('./features/publicPages/BavRechnerPage').then((m) => ({ default: m.BavRechnerPage })),
)
const EtfVsBavPage = lazy(() =>
  import('./features/publicPages/EtfVsBavPage').then((m) => ({ default: m.EtfVsBavPage })),
)
const RiesterRechnerPage = lazy(() =>
  import('./features/publicPages/RiesterRechnerPage').then((m) => ({ default: m.RiesterRechnerPage })),
)
const AltersvorsorgedepotRechnerPage = lazy(() =>
  import('./features/publicPages/AltersvorsorgedepotRechnerPage').then((m) => ({
    default: m.AltersvorsorgedepotRechnerPage,
  })),
)
const RiesterVsAltersvorsorgedepotPage = lazy(() =>
  import('./features/publicPages/RiesterVsAltersvorsorgedepotPage').then((m) => ({
    default: m.RiesterVsAltersvorsorgedepotPage,
  })),
)
const BasisrenteRechnerPage = lazy(() =>
  import('./features/publicPages/BasisrenteRechnerPage').then((m) => ({ default: m.BasisrenteRechnerPage })),
)
const PrivateRentenversicherungRechnerPage = lazy(() =>
  import('./features/publicPages/PrivateRentenversicherungRechnerPage').then((m) => ({
    default: m.PrivateRentenversicherungRechnerPage,
  })),
)
const RenteNettoBerechnePage = lazy(() =>
  import('./features/publicPages/RenteNettoBerechnePage').then((m) => ({ default: m.RenteNettoBerechnePage })),
)
const AltersvorsorgeproduktePage = lazy(() =>
  import('./features/publicPages/AltersvorsorgeproduktePage').then((m) => ({
    default: m.AltersvorsorgeproduktePage,
  })),
)
const PageNotFound = lazy(() =>
  import('./features/publicPages/PageNotFound').then((m) => ({ default: m.PageNotFound })),
)

function App() {
  const { route, navigate } = useRoute()

  // Landing-vs-dashboard decision for route `/`. Lifted into `App` (from the
  // pre-PR-2 `CalculatorRoute` wrapper) so the top-level `<AppShell>` can read
  // the view and flip into editorial mode when the LandingPage is showing.
  // Returning users (`detectSavedMode()` non-null) bypass the landing branch
  // entirely — they pay the lazy Calculator chunk cost on first paint.
  const [calculatorView, setCalculatorView] = useState<AppView>(() =>
    appViewFromMode(detectSavedMode()),
  )
  const [pendingChoice, setPendingChoice] = useState<LandingChoice | null>(null)

  function handleLandingChoice(choice: LandingChoice) {
    // The dashboard's mode + (compare-mode) visibleProducts seed + (combine-
    // mode) wizard launch all happen inside Calculator's pendingChoice
    // useEffect. We only flip the view here so the lazy boundary
    // unsuspends and Calculator mounts.
    setPendingChoice(choice)
    setCalculatorView(choice.kind)
  }

  function handleGoHome() {
    setCalculatorView('landing')
    setPendingChoice(null)
  }

  let body: ReactNode
  if (route === '/impressum') body = <ImpressumPage navigate={navigate} />
  else if (route === '/datenschutz') body = <DatenschutzPage navigate={navigate} />
  else if (route === '/artikel') body = <ArticleHubPage navigate={navigate} />
  else if (route === '/methode') body = <MethodePage navigate={navigate} />
  else if (route === '/rentenluecke-rechner') body = <RentenluckeRechnerPage navigate={navigate} />
  else if (route === '/bav-rechner') body = <BavRechnerPage navigate={navigate} />
  else if (route === '/etf-vs-bav') body = <EtfVsBavPage navigate={navigate} />
  else if (route === '/riester-rechner') body = <RiesterRechnerPage navigate={navigate} />
  else if (route === '/altersvorsorgedepot-rechner') body = <AltersvorsorgedepotRechnerPage navigate={navigate} />
  else if (route === '/riester-vs-altersvorsorgedepot') body = <RiesterVsAltersvorsorgedepotPage navigate={navigate} />
  else if (route === '/basisrente-rechner') body = <BasisrenteRechnerPage navigate={navigate} />
  else if (route === '/private-rentenversicherung-rechner') body = <PrivateRentenversicherungRechnerPage navigate={navigate} />
  else if (route === '/rente-netto-berechnen') body = <RenteNettoBerechnePage navigate={navigate} />
  else if (route === '/altersvorsorgeprodukte-vergleichen') body = <AltersvorsorgeproduktePage navigate={navigate} />
  else if (route === '/404') body = <PageNotFound />
  else if (calculatorView === 'landing') {
    body = <LandingPage onChoice={handleLandingChoice} navigate={navigate} />
  } else {
    body = (
      <Calculator
        navigate={navigate}
        pendingChoice={pendingChoice}
        onPendingChoiceConsumed={() => setPendingChoice(null)}
        onGoHome={handleGoHome}
      />
    )
  }

  // Editorial mode (cream bg + serif H1) — extended by PR 3 to cover the
  // Artikel hub plus every `/<topic>-rechner` route (which now sits inside
  // the cream-and-serif `ArticleLayout`). PR 4 will add `/methode` once it
  // ships. Legal pages stay sober (sans + white) because they are not
  // editorial content.
  const isEditorial =
    (route === '/' && calculatorView === 'landing') || isEditorialChromeRoute(route)

  // QA feedback mode (issue 02 — Phase 1 Lane A). Wraps the entire route
  // surface so the overlay can target legal pages too. Inert when disabled
  // (?qa=1 / ?qa=0 controls activation; sessionStorage persists per session).
  //
  // The single Suspense boundary covers every lazy route component above.
  // For prerendered routes the lazy chunks load after initial paint; the
  // prerendered HTML stays visible until React swaps in the hydrated tree.
  // Wrap every route in the shared chrome (PR 1). AppShell renders the
  // DisclaimerBanner above the StatusBar; individual pages must NOT render
  // their own DisclaimerBanner (PrintReport.tsx remains the only other
  // render path, for the printed report).
  return (
    <QaFeedbackProvider>
      <AppShell route={route} navigate={navigate} editorial={isEditorial}>
        <Suspense fallback={null}>{body}</Suspense>
      </AppShell>
      <QaModeIndicator />
    </QaFeedbackProvider>
  )
}

export default App
