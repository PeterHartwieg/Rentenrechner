import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { Route, AppView } from './app/useRoute'
import { useRoute, detectSavedMode, appViewFromMode } from './app/useRoute'
import type { LandingChoice } from './features/landing/LandingPage'
import { QaFeedbackProvider, QaModeIndicator } from './features/qa-feedback'
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
  let body: ReactNode
  if (route === '/impressum') body = <ImpressumPage navigate={navigate} />
  else if (route === '/datenschutz') body = <DatenschutzPage navigate={navigate} />
  else if (route === '/rentenluecke-rechner') body = <RentenluckeRechnerPage />
  else if (route === '/bav-rechner') body = <BavRechnerPage />
  else if (route === '/etf-vs-bav') body = <EtfVsBavPage />
  else if (route === '/riester-rechner') body = <RiesterRechnerPage />
  else if (route === '/altersvorsorgedepot-rechner') body = <AltersvorsorgedepotRechnerPage />
  else if (route === '/riester-vs-altersvorsorgedepot') body = <RiesterVsAltersvorsorgedepotPage />
  else if (route === '/basisrente-rechner') body = <BasisrenteRechnerPage />
  else if (route === '/private-rentenversicherung-rechner') body = <PrivateRentenversicherungRechnerPage />
  else if (route === '/rente-netto-berechnen') body = <RenteNettoBerechnePage />
  else if (route === '/altersvorsorgeprodukte-vergleichen') body = <AltersvorsorgeproduktePage />
  else if (route === '/404') body = <PageNotFound />
  else body = <CalculatorRoute navigate={navigate} />
  // QA feedback mode (issue 02 — Phase 1 Lane A). Wraps the entire route
  // surface so the overlay can target legal pages too. Inert when disabled
  // (?qa=1 / ?qa=0 controls activation; sessionStorage persists per session).
  //
  // The single Suspense boundary covers every lazy route component above.
  // For prerendered routes the lazy chunks load after initial paint; the
  // prerendered HTML stays visible until React swaps in the hydrated tree.
  return (
    <QaFeedbackProvider>
      <Suspense fallback={null}>{body}</Suspense>
      <QaModeIndicator />
    </QaFeedbackProvider>
  )
}

interface CalculatorRouteProps {
  navigate: (target: Route) => void
}

/**
 * Owner of the landing-vs-dashboard decision for route `/`. Lives in
 * `App.tsx` (not inside the lazy `Calculator`) so a first-time visitor sees
 * the LandingPage from the initial bundle without paying for the calculator
 * chunk. Only when the user clicks a CTA (or is a returning user with saved
 * state) do we suspend on the lazy `Calculator` import.
 *
 * Returning users (`detectSavedMode()` non-null) skip the landing branch
 * entirely; the parent Suspense boundary is the only thing they see while
 * the dashboard chunk loads — typically a single frame on broadband.
 */
function CalculatorRoute({ navigate }: CalculatorRouteProps) {
  const [view, setView] = useState<AppView>(() => appViewFromMode(detectSavedMode()))
  const [pendingChoice, setPendingChoice] = useState<LandingChoice | null>(null)

  function handleLandingChoice(choice: LandingChoice) {
    // The dashboard's mode + (compare-mode) visibleProducts seed + (combine-
    // mode) wizard launch all happen inside Calculator's pendingChoice
    // useEffect. We only flip the local view here so the lazy boundary
    // unsuspends and Calculator mounts.
    setPendingChoice(choice)
    setView(choice.kind)
  }

  function handleGoHome() {
    setView('landing')
    setPendingChoice(null)
  }

  if (view === 'landing') {
    return <LandingPage onChoice={handleLandingChoice} navigate={navigate} />
  }

  return (
    <Calculator
      navigate={navigate}
      pendingChoice={pendingChoice}
      onPendingChoiceConsumed={() => setPendingChoice(null)}
      onGoHome={handleGoHome}
    />
  )
}

export default App
