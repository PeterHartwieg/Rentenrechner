# UI Context Map

For each screen section: the component file, co-located CSS, and what state it reads.

## App-level routing

`App.tsx` is split into a tiny `App` component that consults `useRoute()` and a
`Calculator` component that renders the existing dashboard at `/`. Two static
legal routes are served in-app:

```
App.tsx  (route detector)
├── /            → Calculator   (the rest of this document)
├── /impressum   → ImpressumPage    (src/features/legal/)
└── /datenschutz → DatenschutzPage  (src/features/legal/)
```

Routing is implemented by [`useRoute.ts`](../../src/app/useRoute.ts) — a ~30-line
pathname-based hook (no react-router dependency). SPA fallback for static hosts
lives in `public/_redirects` (Cloudflare Pages / Netlify) and `vercel.json` at
repo root. Add a route by extending the `Route` union and `KNOWN_ROUTES` array,
then dispatching in `App.tsx`.

## Calculator layout overview

```
Calculator
├── DisclaimerBanner            (session-only, never persisted)
├── WorkspaceTabs               (Eingaben / Vergleich / Details & Export)
├── JourneyStepper              (when guided-setup journey is active)
├── workspace
│   ├── vergleichView           (default)
│   │   ├── ScenarioToolbar
│   │   ├── ComparisonPicker
│   │   ├── DecisionSummary
│   │   ├── MonteCarloHighlights
│   │   ├── SummaryMetrics
│   │   ├── ProductEditCards
│   │   ├── ResultWaterfalls
│   │   ├── CapitalChart
│   │   ├── PensionChart
│   │   └── BreakEvenChart
│   ├── detailsView
│   │   ├── FeeDragChart
│   │   ├── MonteCarloPanel
│   │   ├── SensitivityPanel
│   │   ├── FairnessPanel
│   │   ├── CalculationWarnings
│   │   ├── AssumptionReviewPanel
│   │   ├── DetailComparisonTable
│   │   ├── CashflowTable
│   │   └── AssumptionsPanel
│   └── angebotView
│       └── InputsPanel         (ProfileInputs, GRVInputs, BavInputs, InsuranceInputs, BasisrenteInputs, AltersvorsorgedepotInputs, RiesterInputs, plus glossary + scenario library)
├── PrintReport                 (display:none on screen; first child = disclaimer block)
├── LegalFooter                 (Impressum / Datenschutzerklärung / Lizenz)
└── GuidedSetup overlay         (when first-run / re-opened)
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
| Monte Carlo highlights | `MonteCarloHighlights.tsx` | `MonteCarloPanel.css` | `MonteCarloResult` from `useSimulationViewModel` |
| Capital chart | `CapitalChart.tsx` | — | `ProductResult[].yearlyRows` |
| Pension chart | `PensionChart.tsx` | — | `pensionBars` from `useSimulationViewModel` |
| Lifecycle chart | `BreakEvenChart.tsx` | `BreakEvenChart.css` | `ProductResult[].rows` + ETF payout rows |
| Fee-drag chart | `FeeDragChart.tsx` | `FeeDragChart.css` | `ProductResult[].totalFees` / `.capitalAtRetirement` |
| Monte Carlo | `MonteCarloPanel.tsx` | `MonteCarloPanel.css` | `MonteCarloResult` from `useSimulationViewModel` |
| Fairness panel | `FairnessPanel.tsx` | — | bAV net-cost benchmark from `SimulationResult` |
| Detail comparison table | `DetailComparisonTable.tsx` | `DetailComparisonTable.css` | All `ProductResult[]` × scenarios |

### Chart conventions

`BreakEvenChart.tsx` uses one neutral dotted line for cumulative net paid in because it is the shared comparison benchmark. Product colors are reserved for product-specific lines and markers: solid = remaining contract/depot capital, dashed = cumulative net payouts after tax and KV/PV, dot marker = first age where net payouts reach the paid-in benchmark. Keep its custom legend as a compact top-right overlay inside the chart frame, matching the `FeeDragChart` overlay style; do not re-enable Recharts' generated legend.

`FeeDragChart.tsx` must use the same payout horizon as the lifecycle chart via `LIFECYCLE_HORIZON_AGE`. The blue + green stack should equal the lifecycle chart's maximum cumulative `Netto ausgezahlt`; green `Netto-Rendite` is only the surplus above recovered net user cost. Do not add `afterTaxLumpSum` to this chart, because lump sums are alternative payout views rather than additional monthly payout cashflow.

`MonteCarloPanel.tsx` displays seeded stochastic results for the selected scenario only. Settings live on `ScenarioAssumptions.monteCarlo` and are edited in `ScenarioToolbar`; the engine uses one shared market path per run for all visible products, so differences come from product-specific fees, taxes, subsidies, payout modes, and AVD glidepath allocation.

### Cashflow and assumptions

| Component | File | CSS | Notes |
|-----------|------|-----|-------|
| Cashflow table | `src/features/cashflows/CashflowTable.tsx` | `CashflowTable.css` | Yearly rows for one selected product/scenario; after-tax balance toggled by `rowAfterTaxBalance` closure in `App.tsx` |
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
the same components plug into per-instance state in Group G without changes.

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
| `provenance.tsx` | `ProvLabel` (von dir / geprüft / Modellwert / Standardwert pill) and `FieldWithProv` (wraps a field with the pill + optional "Wert stimmt" / "↺ als Schätzwert" toggle). Consumed by `ProductEditCards` today and by Group G inventory cards next. |

## Disclaimer guardrail

`DisclaimerBanner` (`src/features/workspace/DisclaimerBanner.tsx`) must remain
session-only. It writes to `sessionStorage`, never to `localStorage`. A
one-time migration in the component clears the legacy `localStorage` key on
first load. The PDF report (`PrintReport.tsx`) keeps `pr-disclaimer pr-disclaimer-top`
as its first child; the CSV export (`buildExportCsv` in `src/utils/csvExport.ts`)
emits a `Hinweis` section before the data tables. Regressing any of these is a
publication-blocking compliance issue — see CLAUDE.md / BACKLOG.md watchlist.

## App-layer hooks (`src/app/`)

| File | Role |
|------|------|
| `useCalculatorState.ts` | Single source of state: scenarios, profile, active scenario index. Handles localStorage load/save and URL `?s=` decode/encode. |
| `useSimulationViewModel.ts` | Runs `simulateRetirementComparison`, derives sorted results, chart data, pension bars, best-result. |
| `productPresentation.ts` | `BAV_FEE_PRESETS`, `PAV_FEE_PRESETS`, `CALCULATION_WARNINGS`, `GRV_COLOR`. Re-exports `getProductMeta`, `PRODUCT_MANIFEST` from `productManifest.ts`. |

## Adding a UI input for a new product

1. Create `src/features/inputs/<Product>Inputs.tsx` with props `(assumptions, onChange)`.
2. Import and place it in `App.tsx` inside the input drawer.
3. Wire `onChange` to the scenario state updater in `useCalculatorState`.
