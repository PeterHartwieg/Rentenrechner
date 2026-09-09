# UI Context Map

For each screen section: the component file, co-located CSS, and what state it reads.

## App-level routing

`App.tsx` is the route dispatcher and lazy-load boundary. `Calculator.tsx`
renders the saved compare/combine workspace at `/`; first-time visitors see
the landing page. Static public pages are described by
`src/seo/publicRouteRegistry.ts`, while the router also owns workspace flows
and a dynamic contract-detail route:

```text
App.tsx  (route detector + lazy boundaries)
├── /                         → LandingPage (fresh) or Calculator → the plan
├── /vergleich                → VergleichJourneyPage (public, prerendered)
├── /vergleich/details        → VergleichDetailPage
├── /eingaben[/produkte]      → two-step input flow
├── /vorsorge/neu             → VorsorgeNeuPage (contract picker; ?produkt=<id>
│                               opens the editor for a new instance)
├── /vertrag/:instanceId      → VertragDetailPage (dynamic, not prerendered)
├── /vertrag/:id/bearbeiten   → VertragBearbeitenPage (contract editor)
├── /alternativen             → AlternativenPage (?id=<whatIfId>)
├── /kapital                  → KapitalPage
├── /artikel, /methode        → editorial hub / methodology
├── calculator/topic routes   → prerendered pages from publicRouteRegistry
├── /impressum, /datenschutz  → legal pages
└── unknown path              → PageNotFound
```

`/` is always the personal plan for a returning user (a `?s=` share link still
renders the comparison inside `Calculator`); the independent comparison lives at
`/vergleich` and reads the compare-mode singleton only. `pathToRoute` matches
`/vertrag/:id/bearbeiten` **before** the bare `/vertrag/:id` pattern, whose
`(.+)` is greedy. Of the new routes only `/vergleich` is public and prerendered;
`/vorsorge/neu`, `/vertrag/:id/bearbeiten` and `/alternativen` depend on
workspace state and stay dynamic.

Routing is implemented by [`useRoute.ts`](../../src/app/useRoute.ts) as a typed
tagged union with `pathToRoute`, `routeToPath`, and `ROUTES` constructors (no
react-router dependency). Static routes are prerendered and served through the
Cloudflare Worker; host fallbacks also live in `public/_redirects` and
`vercel.json`. Add a route to the union, both conversion functions, the App
dispatch, and—when public/indexable—the public route registry.

## Calculator layout overview

```text
Calculator
├── compare mode
│   └── VergleichPage           (linear six-product comparison + actions)
├── combine mode
│   ├── MeinPlanPage            (PlanOverview when a `summary` prop is passed,
│   │                            otherwise the legacy linear portfolio view)
│   └── three closed disclosures below it:
│       ├── Annahmen & Risiko   (ScenarioToolbar, AssumptionsPanel, warnings)
│       ├── Empfehlung          (contribution recommender modal trigger)
│       └── Details & Export    (CombineDetailView: CSV + Drucken, no copy-link —
│                                the share URL encodes compare inputs only)
├── InventoryWizard             (fixed overlay when starting a portfolio)
├── PrintReport                 (display:none on screen; first child = disclaimer block)
├── LegalFooter                 (Impressum / Datenschutzerklärung / Lizenz)
└── inputs/details/capital      (separate routes, not workspace tabs)
```

## Component map

### Input components (`src/features/inputs/`)

| Component | File | CSS | What it edits |
|-----------|------|-----|---------------|
| Scenario presets | `ScenarioPresetPanel.tsx` | `ScenarioPresetPanel.css` | Full scenario replace via presets from `src/data/presets.ts` |
| Personal profile | `ProfileInputs.tsx` | — | `PersonalProfile` (age, salary, tax class, health insurance, children) + ETF fee |
| Return scenarios | `ReturnScenarioEditor.tsx` | `ReturnScenarioEditor.css` | `ScenarioAssumptions.returnScenarios[]` |
| bAV | `BavInputs.tsx` | — | `BavAssumptions` (conversion, employer match, fees, payout mode) |
| Private insurance | `InsuranceInputs.tsx` | `InsuranceInputs.css` | `InsuranceAssumptions` (fees, payout mode, contract year, paid-up) |
| Basisrente | `BasisrenteInputs.tsx` | — | `BasisrenteAssumptions` (contribution, payout mode) |
| AVD | `AltersvorsorgedepotInputs.tsx` | — | `AltersvorsorgedepotAssumptions` |
| Riester | `RiesterInputs.tsx` | — | `RiesterAssumptions` |
| GRV | `GRVInputs.tsx` | — | `GrvAssumptions` (EP, manual override, KVdR toggle) |

### Result components (`src/features/results/`)

| Component | File | CSS | Data source |
|-----------|------|-----|-------------|
| Summary metrics | `SummaryMetrics.tsx` | `SummaryMetrics.css` | `ProductResult[]` best-result selection |
| Monte Carlo highlights | `MonteCarloHighlights.tsx` | `MonteCarloPanel.css` | `MonteCarloResult` from `useSimulationResult` |
| Capital chart | `CapitalChart.tsx` | — | `capitalChartData` from `useDerivedViews` |
| Pension chart | `PensionChart.tsx` | — | `pensionBars` from `useDerivedViews` |
| Lifecycle chart | `BreakEvenChart.tsx` | `BreakEvenChart.css` | `ProductResult[].rows` + ETF payout rows |
| Fee-drag chart | `FeeDragChart.tsx` | `FeeDragChart.css` | `ProductResult[].totalFees` / `.capitalAtRetirement` |
| Monte Carlo | `MonteCarloPanel.tsx` | `MonteCarloPanel.css` | `MonteCarloResult` from `useSimulationResult` |
| Fairness panel | `FairnessPanel.tsx` | — | bAV net-cost benchmark from `SimulationResult` |
| Detail comparison table | `DetailComparisonTable.tsx` | `DetailComparisonTable.css` | All `ProductResult[]` × scenarios |

### Chart conventions

`BreakEvenChart.tsx` uses one neutral dotted line for cumulative net paid in because it is the shared comparison benchmark. Product colors are reserved for product-specific lines and markers: solid = remaining contract/depot capital, dashed = cumulative net payouts after tax and KV/PV, dot marker = first age where net payouts reach the paid-in benchmark. Keep its custom legend as a compact top-right overlay inside the chart frame, matching the `FeeDragChart` overlay style; do not re-enable Recharts' generated legend.

`FeeDragChart.tsx` must use the same payout horizon as the lifecycle chart via `LIFECYCLE_HORIZON_AGE`. The blue + green stack should equal the lifecycle chart's maximum cumulative `Netto ausgezahlt`; green `Netto-Rendite` is only the surplus above recovered net user cost. Do not add `afterTaxLumpSum` to this chart, because lump sums are alternative payout views rather than additional monthly payout cashflow.

`MonteCarloPanel.tsx` displays seeded stochastic results for the selected scenario only. Settings live on `ScenarioAssumptions.monteCarlo` and are edited in `ScenarioToolbar`; the engine uses one shared market path per run for all visible products, so differences come from product-specific fees, taxes, subsidies, payout modes, and AVD glidepath allocation.

### Cashflow and assumptions

| Component | File | CSS | Notes |
|-----------|------|-----|-------|
| Cashflow table | `src/features/cashflows/CashflowTable.tsx` | `CashflowTable.css` | Yearly rows for one selected product/scenario; after-tax balance built by `makeRowAfterTaxBalance` in `simulationSelectors.ts` and exposed as the `rowAfterTaxBalance` field of `useDerivedViews`. |
| ETF payout table | inline in results | — | `EtfProductResult.etfPayoutRows` |
| Assumptions panel | `src/features/assumptions/AssumptionsPanel.tsx` | `AssumptionsPanel.css` | Static `CALCULATION_WARNINGS` from `productPresentation.ts` |
| Calculation warnings | `src/features/results/CalculationWarnings.tsx` | `CalculationWarnings.css` | Same `CALCULATION_WARNINGS` |

## Shared UI primitives (`src/ui/`)

| File | Exports |
|------|---------|
| `NumberField.tsx` | `<NumberField>` — labelled numeric input with step/min/max |
| `ResultMetric.tsx` | `<ResultMetric>` — labelled metric card with optional diff badge |
| `BavWaterfall.tsx` | `<BavWaterfall>` — bAV tax/SV waterfall breakdown panel |
| `InfoTip.tsx` | `<InfoTip>` — click-to-open glossary popover |
| `formatting.ts` | `formatEur`, `formatPct`, `formatYears` — display formatters |
| `helpers.ts` | `clampNumber`, `updateNumber`, `bestResult` |

## Reusable input sections (`src/features/inputs/sections/`)

Extracted from `BavInputs` / `InsuranceInputs` / `InputsPanel`. Each takes a
generic `value + onChange` pair instead of reading `assumptions.<product>` so
the same components plug into per-instance combine-mode state without changes.

| File | Used by | What it owns |
|------|---------|--------------|
| `PayoutModeSection.tsx` | `BavInputs`, `InsuranceInputs` | Payout-mode select + Rentenfaktor / Zeitrente-Dauer fields with conditional rendering. |
| `FeeSection.tsx` | `BavInputs`, `InsuranceInputs` | Fee-mode tabs (Einzelposten vs. Effektivkosten all-in), preset buttons, the seven fee fields, fee-summary block with threshold warnings. |
| `BeitragsdynamikField.tsx` | `BavInputs`, `InsuranceInputs`, `InputsPanel` (ETF) | Single Beitragsdynamik field with optional product-specific hint when rate > 0. Caller wraps in `field-grid` if needed. |
| `OfferCapitalCompareField.tsx` | `BavInputs`, `InsuranceInputs` | "Kapital lt. Angebot" comparison row; local `offerCapital` state owned by host. |

## Legal pages (`src/features/legal/`)

| File | Role |
|------|------|
| `LegalLayout.tsx` | Shared chrome for legal pages: header with "Zurück zum Rechner" back-link, article body slot, page footer with cross-links. Uses `navigate('/')` instead of full reload. |
| `ImpressumPage.tsx` | Static §5 TMG content. Update address/email here when the licensor's contact changes. |
| `DatenschutzPage.tsx` | Static GDPR content describing the current "no PII collection" posture, the localStorage / sessionStorage keys we use, and planned extensions when a backend / analytics arrive. |
| `LegalFooter.tsx` | Renders below `PrintReport` on the calculator page. Disclaimer microcopy + links to `/impressum`, `/datenschutz`, plus a non-link "Lizenz: PolyForm Noncommercial 1.0.0" pill. |
| `legal.css` | All layout/typography for the four components above + the home-page footer. |

## Provenance primitives (`src/features/results/`)

| File | Exports |
|------|---------|
| `provenance.tsx` | `ProvLabel` (von dir / geprüft / Modellwert / Standardwert pill) and `FieldWithProv` (wraps a field with the pill + optional "Wert stimmt" / "↺ als Schätzwert" toggle). Consumed by `ProductEditCards` (compare-mode) and combine-mode inventory cards. |

## Disclaimer guardrail

`DisclaimerBanner` (`src/features/workspace/DisclaimerBanner.tsx`) must remain
session-only. It writes to `sessionStorage`, never to `localStorage`. A
one-time migration in the component clears the legacy `localStorage` key on
first load. The PDF report (`PrintReport.tsx`) keeps `pr-disclaimer pr-disclaimer-top`
as its first child; the CSV export (`buildExportCsv` in `src/utils/csvExport.ts`)
emits a `Hinweis` section before the data tables. Regressing any of these is a
publication-blocking compliance issue — see CLAUDE.md / BACKLOG.md watchlist.

## App-layer hooks (`src/app/`)

The view-model is split into three focused hooks plus a shared selector
module. `useSimulationViewModel.ts` is kept as a thin facade for back-compat
but `App.tsx` consumes the three hooks directly.

| File | Role |
|------|------|
| `useCalculatorState.ts` | Single source of state: scenarios, profile, active scenario index. Handles localStorage load/save and URL `?s=` decode/encode. |
| `useSimulationResult.ts` | Runs `simulateRetirementComparison`, runs Monte Carlo for the active scenario, derives `taxModes` (insurance era, KVdR, bAV lump-sum routing, payout year/runtime). Re-runs only when `profile`, `assumptions`, or `selectedScenarioId` change. |
| `useWorkspaceUiState.ts` | Workspace toggles (`showRealValues`, `cashflowProductId`, `tarifgebunden`, `showAssumptions`, `selectedScenarioId`) as plain `useState`s. **No simulation deps** — toggling one of these never re-runs the simulation. |
| `useDerivedViews.ts` | Composes the simulation result + UI state into chart/table data (`capitalChartData`, `pensionBars`, `selectedResults`, `visibleProducts`, `cashflowResult`, `rowAfterTaxBalance`, etc.) and the share-link / CSV side-effects (`handleCopyLink`, `handleExportCsv`). |
| `simulationSelectors.ts` | Pure framework-agnostic selectors (`deriveSelectedResults`, `buildCapitalChartData`, `buildPensionBars`, `deriveTaxModes`, `makeRowAfterTaxBalance`, …) consumed by the three hooks above. Unit-testable without React. |
| `useSimulationViewModel.ts` | Back-compat facade that calls the three hooks above and returns a single object. New code should consume the focused hooks; this file exists so the migration was non-breaking. |
| `productPresentation.ts` | `BAV_FEE_PRESETS`, `PAV_FEE_PRESETS`, `CALCULATION_WARNINGS`, `GRV_COLOR`. Re-exports `getProductMeta`, `PRODUCT_MANIFEST` from `productManifest.ts`. |

## Simplification surfaces (plan, wizard, contract editors)

| Surface | File | Notes |
|---------|------|-------|
| Plan overview | `src/features/mein-plan/PlanOverview.tsx` | Default plan surface. Selected by `MeinPlanPage` whenever a `summary` prop is supplied; callers without one keep the legacy layout. Owns the household total, source rows, the target gap, and a `notification` slot (`role="status"`) for the one-level undo. |
| Plan duration view | `src/features/mein-plan/PlanDurationSummary.tsx` | Separate view with its own H1, reached from the overview; also exports `PlanDurationText` for overview rows. |
| Onboarding / profile edit | `src/features/inventory/InventoryWizard.tsx` | Two steps only (`profile`, `pension`). Props: `scenario`, `mode: 'onboarding' \| 'edit'`, optional `initialStep`, `onComplete(scenario)`, `onDismiss`. The old contract-checklist step is gone — contracts are added from the plan via `/vorsorge/neu`. Profile/pension editing reuses the same component with `mode: 'edit'` and an initial step. |
| Contract picker | `src/features/vorsorge/ContractPicker.tsx` (host `VorsorgeNeuPage.tsx`) | Registry-ordered product list; a chosen product mounts the editor. The host resets the draft whenever the selection changes, because `'etf'` doubles as the placeholder product while nothing is picked. |
| Contract editor | `src/features/vertrag-detail/ContractEditor{,Field,Host}.tsx` | Draft state is component-local (`useContractDraft`); cancel discards. Saving goes through `addPopulatedInstance` / `updateInstance` only. |
| Alternatives | `src/features/alternativen/AlternativenPage.tsx` | What-if before/after flow; the plan's "Änderung ausprobieren" and "Gespeicherte Alternativen (n)" both navigate here. |

`UnknownNumberField` (`src/ui/UnknownNumberField.tsx`) is the numeric input for
every field that can be explicitly unknown: `value: number | null` plus an
`InputStatus`, and `onChange(next, 'entered' | 'unknown')`. Ticking "Weiß ich
nicht" emits `(null, 'unknown')` — the host keeps the previous number and passes
it back, so unchecking restores it. A typed `0` is a real entered zero, never an
unknown. Use it instead of `NumberField` wherever an unknown must not be
mistaken for a zero.

## Input status and readiness

| File | Role |
|------|------|
| `src/domain/inputStatus.ts` | `InputStatus` (`unknown` / `assumed` / `entered` / `document`), `InputStatusMap`, `PensionEntryMethod`, sanitisers. Carried on `InstanceCommon.inputStatus`, `WorkspaceAssumptionsV2.inputStatus` and `ScenarioAssumptions.inputStatus`. Absent → `assumed` (legacy-conservative). |
| `src/app/resultReadiness.ts` | `selectResultReadiness(workspace, simulation, error)` → `available` / `estimated` / `incomplete` / `error` plus blocking reasons with route targets. `householdTotalBlockedLabels` turns a blocked verdict into the labels the CSV/PDF print instead of a number. |
| `src/app/planSummary.ts` | `selectPlanSummary` — the household total, per-source rows, duration descriptors and the target gap in one scoped object, on both money bases. |
| `src/features/results/provenanceHelpers.ts` | Mapping between `InputStatus`, `EvidenceState` and the display `ProvKind` / German export labels. |

A blocked total is never approximated: the UI shows "Noch offen" with the
blocking reasons as buttons, and both export paths emit an empty cell plus a
Hinweis line. `employment` has no domain field today and is reconstructed from
`pensionBaselineType`; provenance for `retirementHealthStatus` and
Versorgungswerk contributions is not carried (they are not reserved keys).

## Adding a UI input for a new product

1. Add the engine product first — see `src/engine/products/README.md`. Once
   it's registered in `PRODUCT_REGISTRY`, `ProductId` widens automatically.
2. Create `src/features/inputs/<Product>Inputs.tsx` with whatever prop shape
   fits the assumptions slice; the signature is local to that component.
3. Add a `ProductUiEntry` for the new id in
   `src/features/inputs/productUiRegistry.tsx`. The entry's `renderInputs`
   closure adapts the shared `ProductInputsContext` to the component's prop
   shape. Do **not** add a branch in `InputsPanel`.
4. Wire any new state field through `useCalculatorState` (which handles
   localStorage + share-URL round-trips). The validator in
   `src/utils/scenarioSchema.ts` already gates by `PRODUCT_IDS`, so once the
   product is in the engine registry no schema edit is needed.
