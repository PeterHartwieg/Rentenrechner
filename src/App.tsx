import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { AppView } from './app/useRoute'
import { useRoute, detectSavedMode, appViewFromMode, routeToPath } from './app/useRoute'
import { useWorkspaceUiState } from './app/useWorkspaceUiState'
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
const AngabenPage = lazy(() =>
  import('./features/inputs/AngabenPage').then((m) => ({ default: m.AngabenPage })),
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
const VertragDetailPage = lazy(() =>
  import('./features/vertrag-detail/VertragDetailPage').then((m) => ({ default: m.VertragDetailPage })),
)
const KapitalPage = lazy(() =>
  import('./features/kapital/KapitalPage').then((m) => ({ default: m.KapitalPage })),
)
const VergleichDetailPage = lazy(() =>
  import('./features/vergleich-detail/VergleichDetailPage').then((m) => ({ default: m.VergleichDetailPage })),
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

  // Workspace UI toggles (selected scenario id, real-values toggle, cashflow
  // product picker, tarifgebunden checkbox, show-assumptions toggle). Lifted
  // into `App` so the `selectedScenarioId` survives SPA navigation between
  // `Calculator` and the `/vergleich/details` drill-in — without this lift
  // the drill-in would default back to `'basis'` even when the user picked a
  // different return scenario on `VergleichPage` (PR 290 Codex P1 fix).
  const workspaceUi = useWorkspaceUiState()

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
  // Dispatch on the tagged-union variant. The `route` value is a stable
  // object created by `pathToRoute`; the discriminant `kind` field drives
  // the switch. Dynamic routes carry their payload inside the variant
  // (e.g. `route.instanceId` for `vertrag`).
  switch (route.kind) {
    case 'impressum':
      body = <ImpressumPage navigate={navigate} />
      break
    case 'datenschutz':
      body = <DatenschutzPage navigate={navigate} />
      break
    case 'artikel':
      body = <ArticleHubPage navigate={navigate} />
      break
    case 'methode':
      body = <MethodePage navigate={navigate} />
      break
    case 'eingaben':
      body = <AngabenPage navigate={navigate} />
      break
    case 'rentenluecke-rechner':
      body = <RentenluckeRechnerPage navigate={navigate} />
      break
    case 'bav-rechner':
      body = <BavRechnerPage navigate={navigate} />
      break
    case 'etf-vs-bav':
      body = <EtfVsBavPage navigate={navigate} />
      break
    case 'riester-rechner':
      body = <RiesterRechnerPage navigate={navigate} />
      break
    case 'altersvorsorgedepot-rechner':
      body = <AltersvorsorgedepotRechnerPage navigate={navigate} />
      break
    case 'riester-vs-altersvorsorgedepot':
      body = <RiesterVsAltersvorsorgedepotPage navigate={navigate} />
      break
    case 'basisrente-rechner':
      body = <BasisrenteRechnerPage navigate={navigate} />
      break
    case 'private-rentenversicherung-rechner':
      body = <PrivateRentenversicherungRechnerPage navigate={navigate} />
      break
    case 'rente-netto-berechnen':
      body = <RenteNettoBerechnePage navigate={navigate} />
      break
    case 'altersvorsorgeprodukte-vergleichen':
      body = <AltersvorsorgeproduktePage navigate={navigate} />
      break
    case 'not-found':
      body = <PageNotFound />
      break
    case 'vertrag':
      // Combine-mode drill-in from Mein Plan. The page itself handles the
      // invalid-id and compare-mode empty states; App.tsx only routes the
      // tagged variant and forwards the instance id.
      body = <VertragDetailPage instanceId={route.instanceId} navigate={navigate} />
      break
    case 'kapital':
      // Full-page lifecycle chart + Wendepunkte table (PR 8). Dual-source:
      // the page itself reads workspace.mode and renders compare-mode or
      // combine-mode data — no per-mode App.tsx branching needed.
      body = <KapitalPage navigate={navigate} />
      break
    case 'vergleich-detail':
      // Compare-mode-only per-product breakdown drill-in (PR 10). The page
      // reads workspace.mode and renders a combine-mode empty state when
      // the user is on Mein Plan. `selectedScenarioId` flows from the lifted
      // `useWorkspaceUiState` so the drill-in respects the user's scenario
      // pick on `VergleichPage` (PR 290 Codex P1 fix). `onSelectScenario`
      // lets the page read a `?scenario=<id>` query param on first mount
      // and sync the workspace UI for non-SPA arrivals (PR 290 R3 Codex P2
      // fix — Cmd/Ctrl-click, hard reload, JS-disabled fallback).
      body = (
        <VergleichDetailPage
          navigate={navigate}
          selectedScenarioId={workspaceUi.selectedScenarioId}
          onSelectScenario={workspaceUi.setSelectedScenarioId}
        />
      )
      break
    case 'home':
      if (calculatorView === 'landing') {
        body = <LandingPage onChoice={handleLandingChoice} navigate={navigate} />
      } else {
        body = (
          <Calculator
            navigate={navigate}
            pendingChoice={pendingChoice}
            onPendingChoiceConsumed={() => setPendingChoice(null)}
            onGoHome={handleGoHome}
            workspaceUi={workspaceUi}
          />
        )
      }
      break
    default: {
      const _exhaustive: never = route
      body = <PageNotFound />
      void _exhaustive
    }
  }

  // Editorial mode (cream bg + serif H1) — extended by PR 3 to cover the
  // Artikel hub plus every `/<topic>-rechner` route (which now sits inside
  // the cream-and-serif `ArticleLayout`). PR 4 added `/methode` (sober).
  // Legal pages stay sober. `/vertrag/:id` (PR 7) is sober. The home route
  // is editorial only when the LandingPage is showing (compare/combine
  // dashboards are sober).
  const isHome = route.kind === 'home'
  const isEditorial =
    (isHome && calculatorView === 'landing') || isEditorialChromeRoute(routeToPath(route))

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
