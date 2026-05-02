# UI Context Map

For each screen section: the component file, co-located CSS, and what state it reads.

## Layout overview

```
App.tsx  (composition shell)
├── Input drawer (left panel)
│   ├── ScenarioPresetPanel
│   ├── ProfileInputs
│   ├── ReturnScenarioEditor
│   ├── BavInputs
│   ├── InsuranceInputs
│   ├── BasisrenteInputs
│   ├── AltersvorsorgedepotInputs
│   ├── RiesterInputs
│   └── GRVInputs
└── Results panel (right panel)
    ├── SummaryMetrics
    ├── CapitalChart
    ├── PensionChart
    ├── FeeDragChart
    ├── FairnessPanel
    ├── DetailComparisonTable
    ├── CashflowTable
    ├── AssumptionsPanel
    └── CalculationWarnings
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
| Capital chart | `CapitalChart.tsx` | — | `ProductResult[].yearlyRows` |
| Pension chart | `PensionChart.tsx` | — | `pensionBars` from `useSimulationViewModel` |
| Lifecycle chart | `BreakEvenChart.tsx` | `BreakEvenChart.css` | `ProductResult[].rows` + ETF payout rows |
| Fee-drag chart | `FeeDragChart.tsx` | `FeeDragChart.css` | `ProductResult[].totalFees` / `.capitalAtRetirement` |
| Fairness panel | `FairnessPanel.tsx` | — | bAV net-cost benchmark from `SimulationResult` |
| Detail comparison table | `DetailComparisonTable.tsx` | `DetailComparisonTable.css` | All `ProductResult[]` × scenarios |

### Chart conventions

`BreakEvenChart.tsx` uses one neutral dotted line for cumulative net paid in because it is the shared comparison benchmark. Product colors are reserved for product-specific lines and markers: solid = remaining contract/depot capital, dashed = cumulative net payouts after tax and KV/PV, dot marker = first age where net payouts reach the paid-in benchmark. Keep its custom legend as a compact top-right overlay inside the chart frame, matching the `FeeDragChart` overlay style; do not re-enable Recharts' generated legend.

`FeeDragChart.tsx` must use the same payout horizon as the lifecycle chart via `LIFECYCLE_HORIZON_AGE`. The blue + green stack should equal the lifecycle chart's maximum cumulative `Netto ausgezahlt`; green `Netto-Rendite` is only the surplus above recovered net user cost. Do not add `afterTaxLumpSum` to this chart, because lump sums are alternative payout views rather than additional monthly payout cashflow.

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
| `formatting.ts` | `formatEur`, `formatPct`, `formatYears` — display formatters |
| `helpers.ts` | `clampNumber`, `updateNumber`, `bestResult` |

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
