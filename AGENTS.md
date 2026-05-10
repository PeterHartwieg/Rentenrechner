# Rentenrechner — Developer Guide (Codex / OpenAI agents)

German retirement calculator comparing ETF, bAV, private insurance, Basisrente, Altersvorsorgedepot, and Riester.
Stack: React + TypeScript + Vite. Frontend-only today; small backend planned for upload/OCR features (see "Backend boundary").

> **First-read map: [`CONTEXT.md`](CONTEXT.md)** — domain glossary (compare/combine mode, baseline/what-if, instance, transfer event, evidence state, combine context) and module ownership map for engine, app, content, and features. Read it before this file when you need to find code.

## About this project

**Public, free tool.** Anyone can use the hosted version at no cost. Donations (Stripe / GitHub Sponsors) cover hosting.

**Source-available, non-commercial license.** Code is published under **PolyForm Noncommercial 1.0.0**. Personal, research, and internal-evaluation use is free. **Insurance brokers, investment advisors, employers, and any other commercial use require a separate paid license** — contact `peter@hartwieg.com`.

**Public brand: `RentenWiki.de`** (long form) / `RentenWiki` (short form, only in tight UI copy). Use this in every user-visible surface: page titles, marketing copy, OG tags, share-URL slugs, PDF/CSV export headers. Filenames stay ASCII (e.g. `rentenwiki-export.csv`).

The internal working name "Rentenrechner" still appears in design docs, ADRs, backlog notes, and code symbols (npm package, identifiers, file paths) — leave those as-is. Don't introduce new "Rentenrechner" references in public-facing copy.

## Critical guardrails

These shape every change. Read before touching UI, exports, or anything user-facing.

1. **Not advice.** This tool produces illustrations, never advice. The disclaimer banner ("keine Steuer-, Rechts-, oder Anlageberatung") must remain visible — users may collapse it per session, never permanently dismiss it. Every PDF/CSV export embeds the disclaimer at the top. The commercial license obligates brokers/advisors to indemnify us for client-facing use.
2. **License posture is product-shaping.** When adding features, ask whether they advantage commercial users in a way that erodes the donation model (bulk-export, white-label, batch scenarios). Such features either gate behind a future commercial-license check, or are explicitly free. Default to free until we have a reason to gate.
3. **No PII collection without a backend story.** Frontend is purely localStorage today. Anything that would phone home (analytics, error tracking, OCR upload) must be GDPR-compliant by design (region, retention, consent) and is a separate backlog item, not a casual addition.

## Backend boundary

The calculator is **frontend-only** — all state in localStorage + share-URLs. No accounts, no telemetry, no cookies.

The **QA feedback Worker** (`qa.rentenwiki.de`) is the first sanctioned backend exception (ADR-0001). It is opt-in and QA mode only: testers without GitHub accounts can submit screenshots via the `?qa=1` overlay; the Worker processes submissions ephemerally and stores screenshots in R2 scoped to the lifetime of the linked GitHub issue. The calculator continues to work fully offline for users who do not use the QA feature.

A second sanctioned backend trigger is OCR / document upload (Riester, bAV, GRV-Renteninformation parsing), which is still planned and not yet implemented.

Outside these two sanctioned triggers, do not add fetch/auth/cookies to the frontend.

## Commands

```bash
npm run verify          # lint + tests + build (run after every change)
npx vitest run          # unit tests only
npx tsc --noEmit        # type-check only
npm run dev             # dev server
npm run build           # production build
npm run repo:stats      # file/symbol inventory
```

## Quick navigation

For the full module map (combine mode, projection, transfer, funding, allowance, recommender, inventory) see [`CONTEXT.md`](CONTEXT.md). High-frequency landings only here:

| Task | Start here |
|------|-----------|
| Change a product's calculation | `docs/context/products.md`, then `src/engine/products/<product>.ts` |
| Change tax / social-security rules | `docs/context/rules-and-tax.md` |
| Change UI layout or inputs (compare mode) | `docs/context/ui.md`, `src/features/inputs/productUiRegistry.tsx` |
| Add a new product | `src/engine/products/README.md`, plus `src/features/inventory/inventoryProductRegistry.ts` (inventory side) |
| Update annual statutory values | `src/rules/de2026.ts` |
| Add a publication / commercial-license feature | `BACKLOG.md` → "Publication polish" |
| Edit Impressum / Datenschutz / footer | `src/features/legal/{ImpressumPage,DatenschutzPage,LegalFooter}.tsx` |
| Add a new app route | `src/app/useRoute.ts` (`Route` union + `KNOWN_ROUTES`), then render in `src/App.tsx` |
| Deep-link a topic page into the calculator (mode + product preselection) | `src/seo/publicRouteRegistry.ts` (`preselection` on the route entry); `LandingPage` reads `?topic=<slug>` via `resolveTopicPreselection`. Issue #13. |
| Reuse a payout-mode / fee / Beitragsdynamik / offer-capital section | `src/features/inputs/sections/` |
| Reuse an inventory field component (`InvField`, option tables) | `src/features/inventory/{fields.tsx,fieldHelpers.ts}` |
| Change combine-mode instance projection (singleton view, neutralised defaults) | `src/engine/portfolioProjection.ts` |
| Change cross-instance funding caps (bAV / Basisrente / Riester / AVD) | `src/engine/portfolioFunding.ts` |
| Change §20 Abs. 9 EStG Sparerpauschbetrag allocation across ETF instances | `src/engine/portfolioAllowance.ts` |
| Change transfer-event collection or `buildInstanceCapitalPolicy` | `src/engine/portfolioTransfer.ts` (use `transferEventKey` from `src/storage.ts` for dedupe) |
| Change statutory-pension / KV/PV routing for combine + recommender | `src/engine/combineContext.ts` (`buildCombineContext`) |
| Change recommendation rules | `src/app/recommendations.ts` |
| Change recommendation copy | `src/content/recommendationCopy.ts` |
| Add or change a recommender product candidate | `src/app/recommenderCandidates/<product>.ts` (registered via `recommenderCandidates/index.ts`) |
| Change evidence ↔ provenance display or export labels | `src/features/results/provenanceHelpers.ts` |
| Change workspace ID generation or pure workspace mutations | `src/app/workspaceIdentity.ts` |
| Change storage migration / load path / scenario library | `src/storage.ts` (sections clearly marked) |
| Plan future schema changes | `docs/portfolio-schema-design.md` |

## Key files

### Rules and constants

| File | Role |
|------|------|
| `src/rules/de2026.ts` | All year-specific 2026 statutory values. Update once a year. Never hardcode statutory numbers in the engine. |
| `src/rules/legalConstants.ts` | Cross-year statutory constants (1/120 SGB V, Fünftelregelung divisor, §20 Abs. 1 Nr. 6 EStG thresholds, halbeinkünfte factor). Change only on law amendment. |
| `src/rules/index.ts` | Single swap-point: add `de2027.ts`, change one line, run tests. |

### Engine — core math

| File | Role |
|------|------|
| `src/engine/tax.ts` | `calculateIncomeTax2026`, soli, capital-gains tax. |
| `src/engine/salary.ts` | `calculateSalaryResult` (BMF PAP Vorsorgepauschale), `calculateBavFunding` (two-pass). |
| `src/engine/retirementTax.ts` | `calculateRetirementTax` — single pipeline for all retirement-phase taxable income. |
| `src/engine/accumulation.ts` | `projectAccumulation` accumulation loop, yearly rows, fee drag, ETF Vorabpauschale accrual. |
| `src/engine/payoutMath.ts` | Shared payout math: `monthlyRate`, `monthlyPayoutFromCapital`, `computeGrossMonthlyPayout`. |
| `src/engine/productPayout.ts` | Shared product payout plumbing: pension payout fee deduction, Leibrente break-even age. |
| `src/engine/{etfPayout,insurancePayout,bavPayout,certifiedPensionPayout}.ts` | Per-channel after-tax payout helpers (ETF exit tax; private-insurance tax mode + lump sum; bAV tax mode + lump sum; shared §22 Nr. 5 helpers for AVD/Riester). The four monthly-payout helpers wrap `calculateMonthlyRetirementPayout`; lump sums stay per-channel. |
| `src/engine/retirementPayout.ts` | `calculateMonthlyRetirementPayout` — single cascade for marginal retirement tax + KV/PV across bAV, pAV, certified pension (AVD/Riester), and Basisrente monthly payouts. Returns `{ netMonthly, marginalTaxAnnual, kvPvMonthly }`; thin public wrappers preserve `number` return types. |
| `src/engine/salaryPhaseFunding.ts` | `calculateSalaryPhaseTaxDelta`, `calculateAllowanceExcessBenefit` — shared §10 Sonderausgaben tax-delta primitives used by Basisrente, AVD, and Riester funding. bAV funding lives in `salary.ts` (different code path). |
| `src/engine/fees.ts` | RIY / Effektivkosten bisection solver. |
| `src/engine/marketReturns.ts` | Shared stochastic return-path helpers; product simulators compose Monte Carlo paths via this. |
| `src/engine/{grv,basisrente,altersvorsorgedepot,riester,monteCarlo}.ts` | Pension-system, Schicht-1, Schicht-2, and stochastic engines. |

### Engine — orchestration

| File | Role |
|------|------|
| `src/engine/simulationContext.ts` | `buildContext` — pre-scenario funding (bAV, Basisrente, AVD, Riester) computed once. Product simulators must consume this, not call funding helpers directly. |
| `src/engine/buildResult.ts` | Shared accumulation + payout/tax pipeline; assembles `ProductResult`. |
| `src/engine/simulate.ts` | Top-level compare-mode `simulateRetirementComparison`. |
| `src/engine/productRegistry.ts` | Single source of truth for product ids, labels, colors, simulators, validators, sort order. `ProductId` is derived from registry entries — never hardcode the union. |
| `src/engine/products/<product>.ts` | One folder per product (simulator + validator + tests). See `products/README.md` for the routing table. |

### Engine — combine-mode submodules (architecture-readability split)

The portfolio adapter is now thin orchestration. Each concern below has its
own home with co-located tests; the adapter just iterates instances and
delegates.

| File | Role |
|------|------|
| `src/engine/portfolioAdapter.ts` | Thin combine-mode orchestrator: iterates per-product instance arrays, drives per-instance simulation, tags results with `instanceId`. |
| `src/engine/portfolioCombine.ts` | Top-level `combinePortfolio`: per-instance retirement-tax + KV/PV aggregation across the `perInstance` map. |
| `src/engine/combineContext.ts` | `buildCombineContext` — single home for statutory-pension tax channel, statutory-pension KV channel, and retirement health status. Recommender + combine simulation share this. |
| `src/engine/portfolioProjection.ts` | Instance → singleton-shaped `ScenarioAssumptions` projection: neutralised defaults, slot detection, paid-up overrides, `projectInstanceToScenarioAssumptions`, and `singletonViewOfWorkspace` (used by storage / share-URL ingest). |
| `src/engine/portfolioTransfer.ts` | Transfer event collection (outbound/inbound), calendar-year ↔ contract-year conversion, surrender-tax computation, `buildInstanceCapitalPolicy`. Pairs with `transferEventKey` exported from `src/storage.ts` for backfill dedupe. |
| `src/engine/portfolioFunding.ts` | Cross-instance funding apportionment under statutory caps: bAV §3 Nr. 63 / §1 SvEV, Basisrente §10 Abs. 3, Riester €2 100, AVD per-contract. Owns paid-up funding helpers. |
| `src/engine/portfolioAllowance.ts` | §20 Abs. 9 EStG Sparerpauschbetrag allocation across multiple ETF instances (demand calculation, per-year apportionment, ETF re-run orchestration). |

### App, UI, storage

- `src/app/` — `useCalculatorState.ts` (compare-mode localStorage + URL init); `portfolioState.ts` + `useWorkspace.ts` (combine-mode workspace state); `workspaceIdentity.ts` (pure workspace IDs + add/remove mutations, React-free, breaks the app↔inventory cycle); `useSimulationResult.ts` (runs `simulateRetirementComparison` + Monte Carlo + tax-mode derivation), `useWorkspaceUiState.ts` (workspace UI toggles, **no** simulation deps so toggles never trigger reruns), `useDerivedViews.ts` (chart/table data + CSV/share-link composition), and `simulationSelectors.ts` (pure framework-agnostic selectors). `useSimulationViewModel.ts` is a back-compat facade over the three hooks. `useCombineSimulation.ts` drives combine-mode simulation. `productPresentation.ts` (presets + warnings + colors). `useRoute.ts` (minimal pathname-based router for `/`, `/impressum`, `/datenschutz`). `recommender.ts` orchestrator + `recommenderCandidates/` per-product candidate registry. `recommendations.ts` is the pure rules engine (atom shape).
- `src/features/` — `inputs/`, `results/`, `cashflows/`, `assumptions/`, `workspace/`, `legal/`, `inventory/`, `dashboard/`, `qa-feedback/` (each with co-located CSS).
  - `inputs/productUiRegistry.tsx` — UI-side `Record<ProductId, ProductUiEntry>` that collapses the per-product input dispatch in `InputsPanel`. Adding or removing a product input is a registry edit, not a branch-chain change. Engine `productRegistry.ts` stays React-free; this is its UI sibling.
  - `inputs/sections/` — reusable section components consumed by `BavInputs` / `InsuranceInputs` / `InputsPanel` (`PayoutModeSection`, `FeeSection`, `BeitragsdynamikField`, `OfferCapitalCompareField`).
  - `inventory/inventoryProductRegistry.ts` — UI-side `Record<MultiInstanceProductId, InventoryProductEntry>`: per-product default-draft construction, draft→instance conversion, label fallback. Mirrors engine `productRegistry.ts` but lives here because it depends on `defaultAssumptions`. React-free; ID generation injected via `makeId`.
  - `inventory/{fields.tsx,fieldHelpers.ts}` — shared inventory field components (`InvField`) and non-component helpers (`toNumber`, payout option tables) consumed by both wizard cards and the combine sidebar.
  - `legal/` — `ImpressumPage`, `DatenschutzPage`, `LegalLayout` (back-link + page footer), `LegalFooter` (rendered on the calculator's home page below `PrintReport`).
  - `results/provenance.tsx` — `ProvLabel` + `FieldWithProv` primitives.
  - `results/provenanceHelpers.ts` — single mapping layer between domain `EvidenceState` and display `ProvKind`, plus German export labels (`Bestätigt` / `lt. Beleg` / `Schätzwert` / `Unbekannt`). All evidence-bearing surfaces route through `evidenceStateToProvKind`.
- `src/content/` — content/config without React deps: `terms.ts` (glossary), `productFocus.ts` (per-product "lead with user task" copy), `triggers.ts` (guided-setup paths + comparison-picker product groupings), `recommendationCopy.ts` (German atom templates for `recommendations.ts`).
- `src/ui/` — shared primitives (`NumberField`, `ResultMetric`, formatters, `InfoTip`).
- `src/domain/` — type barrel; import from `src/domain/index.ts` unless you need one product's types.
- `src/storage.ts` — only load/save module. Sections are clearly marked: storage keys, `mergeDeep` + pre-merge migrations, `migrateAndValidateState` (shared with `scenarioLibrary.ts`), v2 workspace load path (production runs `validateWorkspace`), `transferEventKey` (consumed by `portfolioTransfer.ts` for backfill dedupe), compare-mode and workspace save/load. Scenario-library entries that fail validation are dropped silently on load. Malformed v2 workspaces fall back to defaults locally; malformed share-URL ingest produces a null result so the caller can surface "invalid link".
- `src/utils/{scenarioSchema,urlShare,csvExport,format}.ts`.
- `public/_redirects` (Netlify) and `vercel.json` at repo root supply the SPA fallback for non-Worker hosts; Cloudflare Workers serves prerendered routes directly via the asset binding (`wrangler.jsonc` `not_found_handling`).

## UI rounding boundary (display layer only)

The engine returns full-precision floats. Statutory rounding (e.g. `floorEuro(zvE)`) is applied surgically inside the engine **only where the law requires it** — not as a global policy. Rounding for human consumption happens at the display boundary so that intermediate composition (RIY, Günstigerprüfung, payout schedules, oracle-validation goldens) stays exact.

| Surface | Rule |
|------|------|
| `<NumberField>` (`src/ui/NumberField.tsx`) | Always use this for numeric inputs bound to engine output. Decimals default from `step`; pass `decimals={n}` to override. Never bind a raw float to a hand-rolled `<input>`. |
| Currency in JSX | `formatCurrency(value, decimals=0)` from `src/utils/format.ts`. Use 2 decimals only when cents matter (oracles, fee deltas). |
| Percent in JSX | `formatPercent(value, decimals=1)`. Pass the ratio (`0.024`), not the multiplied value. |
| `<ResultMetric>` | Caller must pre-format. |
| Chart axis ticks | Recharts `tickFormatter` (typically `formatCurrency` rounded to 1k). |

If you find a UI leak (raw float reaching the user), fix it at the formatter — never round inside the engine.

## UI chart conventions

- **Lifecycle chart** (`BreakEvenChart.tsx`): single neutral dotted line for cumulative net paid-in (shared benchmark). Product color only for product-specific lines: solid = remaining capital, dashed = cumulative net payouts, filled marker = first age payouts cover paid-in. Open-ring marker = Leibrente product overtaking a Kapitalverzehr product (`findLeibrenteCrossovers`); off-frame crossovers surface as a text callout below the chart.
- **Fee-drag chart** (`FeeDragChart.tsx`): blue + green stack must equal the lifecycle chart's max cumulative `Netto ausgezahlt` over the same horizon. Green = surplus above recovered net cost; do not add `afterTaxLumpSum`.
- **Monte Carlo panel** (`MonteCarloPanel.tsx`): uses the selected return scenario as expected risky-market return and `ScenarioAssumptions.monteCarlo.annualVolatility` as annual volatility. All visible products share the same market path per run; product fees, taxes, payout modes, and AVD glidepath then diverge normally.

## Non-obvious architecture

Cross-cutting decisions you'll keep hitting:

- **Retirement tax goes through `calculateRetirementTax`.** Cohort-based Versorgungsfreibetrag and Besteuerungsanteil, Werbungskosten/Sonderausgaben Pauschbeträge, halbeinkünfte/Abgeltungsteuer/pre-2005/Ertragsanteil branching, Ehegattensplitting (§32a Abs. 5 EStG). New retirement-phase tax behavior extends this pipeline; it does not bypass it. `retirementYear` is required so cohort tables lock to the correct year.
- **Monthly retirement payouts go through `calculateMonthlyRetirementPayout`.** The four monthly net-payout channels (bAV, pAV, certified pension, Basisrente) share one cascade for marginal retirement tax + KV/PV. The primitive stacks `otherMonthlyIncome + grvBaselineMonthly` for §240 SGB V freiwillig-GKV BBG headroom across all channels — pre-Wave-3 the certified pension dropped `otherMonthlyIncome` while Basisrente summed it, an inconsistency now fixed and pinned by regression tests. Lump-sum helpers (`afterTaxBavLumpSum`, `insuranceLumpSumBreakdown`, `afterTaxCertifiedPensionLumpSum`, etc.) stay separate paths; do **not** fold them into the monthly primitive.
- **KV/PV proportional apportionment over BBG.** When aggregate retirement income exceeds the monthly KV/PV BBG, contributions are scaled proportionally across sources (`calculateRetirementKvPv`). No statute mandates priority for single-member cases — this is a documented modeling choice.
- **Vorsorgepauschale deducts only RV + GKV + PV, not AV.** `SalaryResult.vorsorgepauschale` exposes the breakdown. PKV branch uses actual `pkvMonthlyPremium` + `pPVMonthlyPremium` as Teilbeträge; net PKV cost (premium − §257 subsidy) deducts from `annualNet`.
- **bAV two-pass funding.** `calculateBavFunding` estimates employer subsidy, computes total bAV against §3 Nr. 63 / §1 SvEV limits, then reruns salary with corrected effective limits. Iterative fixed-point (≤20 iterations).
- **`SimulationContext` / `buildContext`.** Pre-scenario funding (bAV, Basisrente, AVD, Riester) runs once before the scenario loop. Product simulators receive `ctx` and must not call funding helpers directly. Monte Carlo adds `ctx.marketReturnPath` per run; product simulators compose it via `marketReturns.ts` instead of sampling independently. In combine mode, `portfolioFunding.ts` apportions cross-instance funding under statutory caps before delegating into `buildContext`; statutory-pension and KV/PV routing are factored out into `combineContext.ts` so the recommender and combine simulation cannot drift.
- **`PRODUCT_REGISTRY` is the source of truth for product identity.** `ProductId` is derived from each product's `metadata.id` literal. Adding a product is local to `engine/products/` + per-product domain types + one registry entry. Use `getProductMeta(id)` in UI instead of local color/order maps. The UI sibling `productUiRegistry.tsx` (`Record<ProductId, ProductUiEntry>`) drives `InputsPanel` dispatch; engine code never imports React.
- **`visibleProducts` empty means "no comparison".** `simulateRetirementComparison` filters by `assumptions.visibleProducts` and returns `products: []` when the array is empty; the UI surfaces an empty-state. `mergeDeep` in `storage.ts` **preserves** explicit empty arrays so a user clearing the comparison survives reload and share-link round-trip; `applyPreMergeMigrations` separately normalizes `returnScenarios` to the canonical baseline before mergeDeep so the simulation always has at least one scenario.
- **Fair-comparison invariant.** ETF and insurance always invest `bavFunding.monthlyNetCost` — the same net cash the user pays for bAV. There is no "custom amount" toggle.
- **Fee model is split.** `FeeModel` has `wrapperAssetFee` (Versicherungsmantel) + `fundAssetFee` (TER); `projectAccumulation` uses the sum. `pensionPayoutFeePct` is deducted from gross monthly Leibrente/Zeitrente before tax/KV/PV (bAV + pAV only). `accumulationRiy` on `ProductResult` is a **decimal** (0.012 = 1.2 % p.a.), not pp.
- **Accumulation policy is the extension point.** `AccumulationPolicy` carries opt-in behaviors: `yearlyReturn` (per-year override; Standarddepot glidepath, Monte Carlo plugs here), `vorabpauschale` (InvStG §18), `initialCapital` (Riester→AVD, paid-up phase 2), `contributionGrowth` (Beitragsdynamik). New extensions go here, not as new top-level options.
- **Beitragsdynamik uses geometric-sum Beitragssumme.** When `contributionGrowth.annualRate > 0`, `acquisitionCostPct` is computed off `c × 12 × ((1+r)^Y − 1) / r` (Versicherungs convention). For bAV, the §3 Nr. 63 / §1 SvEV cap and statutory subsidy are computed from year-1 inputs and held constant — documented approximation.
- **Payout modes** (`leibrente` / `zeitrente` / `kapitalverzehr`). bAV and pAV support all three. ETF is hardcoded to `kapitalverzehr`. Basisrente: capital payout legally prohibited (`afterTaxLumpSum = null`); only `leibrente`/`zeitrente`. Net pipeline (tax + KV/PV) is unchanged across modes — only the gross figure differs.
- **External oracle goldens.** `simulate.integration.test.ts` and dedicated oracle tests pin payroll, retirement-tax, and bAV-funding outputs to externally-verified values. Engine rounding compounds — keep rounding at the display boundary so these stay exact.

Product-specific gotchas (will surprise you when first opening these simulators):

- **bAV lump-sum tax routing depends on Durchführungsweg.** `deriveBavLumpSumTaxMode` is the single source of truth. §3 Nr. 63 → full marginal rate (no Fünftelregelung); §40b a.F. eligible → tax-free; Direktzusage / Unterstützungskasse → Fünftelregelung. KV/PV via §229 SGB V 1/120 spreading applies to all modes.
- **Private insurance tax mode is auto-derived** by `deriveInsuranceTaxMode(contractStartYear, runtimeYears, retirementAge)` → `pre2005 | halbeinkuenfte | abgeltungsteuer`. For `payoutMode === 'leibrente'`, `netInsurancePayout` overrides this with §22 Nr. 1 Satz 3 a EStG Ertragsanteil for **all** contract eras (even pre-2005).
- **KVdR vs. freiwillig changes the KV side of payouts.** `netBavPayout(..., kvdrMember)`: KVdR applies §226(2) Freibetrag; freiwillig (§240 SGB V) applies KV on full amount. PV is the same in both.

## Current state

Live at **rentenwiki.de** since 2026-05-05 (Cloudflare Workers, deploy commit `348fe8c`). Branding (`RentenWiki.de`), legal/export guardrails, and the combine-mode (= portfolio-mode) foundation are all shipped. Headline behaviour now in main:

- **Combine mode** — workspace with per-product instance arrays (`schemaVersion: 2`), baseline + what-if scenarios, transfer events (`surrender_reinvest` / `partial_transfer` / `paid_up`), cross-instance funding caps, shared §20 Abs. 9 EStG Sparerpauschbetrag, and household-level results via `combinePortfolio`. Architecture map in [`CONTEXT.md`](CONTEXT.md). Compare mode remains as the singleton path for the legacy share-URL / scenario-library surface.
- **Recommender** — "Wo geht mein nächster Euro hin?" with cap-headroom-driven candidates and Monte Carlo P10 risk score (`src/app/recommender.ts`, per-product candidates under `src/app/recommenderCandidates/`).
- **Decision UI** — three-card per-contract menu (weiterführen / kündigen / übertragen) wired through `applyContractDecision` in `src/app/contractDecisions.ts`. Beitragsfrei is engine-supported across all 5 paid-up-capable simulators (`portfolioAdapter.ts` `paidUpFeeModel`). The `Optimiere deine Vorsorge` portfolio-audit modal (`OptimiereVorsorgeModal`) wraps the per-contract decisions in a step machine.
- **License files** at root: `LICENSE.md` (PolyForm Noncommercial 1.0.0 verbatim) and `COMMERCIAL_LICENSE.md` (scope, indemnification, German jurisdiction).
- **Disclaimer infrastructure**: `DisclaimerBanner` is session-only via `sessionStorage` (never `localStorage` — regressing this is a publication-blocking compliance issue). Disclaimer is the literal first child of `#print-report` in `PrintReport.tsx` and the first section of `buildExportCsv` output. README carries the same notice.
- **Legal pages** at `/impressum` and `/datenschutz` via the small custom router in `src/app/useRoute.ts` (no react-router dependency). Wired through `LegalLayout`/`LegalFooter` in `src/features/legal/`. SPA fallback for non-Worker hosts is configured in `public/_redirects` (Netlify) and `vercel.json` (root); Cloudflare Workers uses the asset binding + `not_found_handling`.
- **Phase 0 design docs** in `docs/`: `golden-coverage-audit.md` (read-only audit of every external oracle and integration snapshot — Group G's safety net) and `portfolio-schema-design.md` (binding design for the singleton-to-instance migration: schemaVersion 1 → 2, instance-id format, storage-key bump, `PortfolioAdapter` shape).
- **Reusable input sections** in `src/features/inputs/sections/`: `PayoutModeSection`, `FeeSection`, `BeitragsdynamikField`, `OfferCapitalCompareField`. Provenance primitives in `src/features/results/provenance.tsx`. `BavInputs` and `InsuranceInputs` share one fee-input implementation (presets, threshold warnings, Effektivkosten all-in toggle).
- **Hardened scenario-library load**: `migrateAndValidateState` in `storage.ts` is the shared migrate+validate pipeline; `scenarioLibrary.ts` runs every entry through it on load and drops malformed entries silently. Forward-compat guard via `SAVED_SCENARIO_VERSION`.
- **Trigger config** in `src/content/triggers.ts`: `PRIMARY_PRODUCT_IDS`, `SECONDARY_PRODUCT_IDS` group the comparison picker. The earlier `PATH_OPTIONS` / `VISIBLE_PRODUCTS_BY_PATH` / `WIZARD_REGISTRY` mechanism is gone — guided-setup flow is now `LandingPage` → `InventoryWizard`. Topic-page deep-linking lives in the SEO route registry (issue #13): each `PublicRoute` may declare an optional `preselection: { mode, visibleProducts? }`, and `LandingPage` reads `?topic=<slug>` via `resolveTopicPreselection` to auto-fire the right mode + product seed for first-time visitors. Returning users (saved state) are never overridden.
- **Reusable scaffolding** still in place: input sections in `src/features/inputs/sections/`; provenance primitives in `src/features/results/provenance.tsx`; trigger config in `src/content/triggers.ts`. Design docs `docs/golden-coverage-audit.md` (oracle safety net) and `docs/portfolio-schema-design.md` (historical reference for the v1 → v2 migration) remain authoritative for the invariants they pin.

Open work after launch now lives in GitHub Issues. Historical PRDs and scratch notes remain under `.scratch/<slug>/` (notably `qa-feedback-mode`, `group-g-qa`, `pure-frontend-api`) and themes remain in `BACKLOG.md` (publication polish, decision views and UX expansion, deferred backend, analytical/publishing, scenario coverage gaps), but new actionable work should be filed in GitHub.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `PeterHartwieg/Rentenrechner`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default mattpocock/skills label vocabulary maps directly to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
