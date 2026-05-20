# RentenWiki — Architecture Map

First-read map for agents and contributors. Compact by design: it links out
rather than duplicating.

- For developer commands and product guardrails: `CLAUDE.md` / `AGENTS.md`.
- For deeper domain-area maps: `docs/context/{products,rules-and-tax,ui}.md`.
- For binding migration / schema designs: `docs/portfolio-schema-design.md`,
  `docs/golden-coverage-audit.md`.
- ADRs (when they exist) live under `docs/adr/`.

## Project at a glance

German retirement calculator (publicly: **RentenWiki.de**, internal codename
`Rentenrechner`). Compares ETF, bAV, private insurance, Basisrente,
Altersvorsorgedepot (AVD), and Riester against the GRV statutory baseline,
using BMF-/DRV-/GKV-published 2026 statutory values.

- **Stack:** React + TypeScript + Vite. Calculator is frontend-only — no auth,
  no telemetry. State is localStorage + share-URLs. The QA feedback Worker
  (`qa.rentenwiki.de`) is the first sanctioned backend exception (ADR-0001,
  opt-in, QA mode only).
- **License posture:** PolyForm Noncommercial 1.0.0 source-available, with a
  paid commercial license for brokers/advisors/employers.
- **Output:** illustrations, never advice. The session-only disclaimer banner
  is a publication-blocking compliance contract.

See `CLAUDE.md` → "About this project", "Critical guardrails", and
"Backend boundary" for the long form.

## Domain glossary

These terms have specific meanings in this codebase. Use them as-is when
naming code, tests, issues, and ADRs.

| Term | Meaning |
|------|---------|
| **Compare mode** | Singleton path: one `ScenarioAssumptions` × one set of products. Simulated by `simulateRetirementComparison` (`src/engine/simulate.ts`). Saved under `STORAGE_KEY_V1`. |
| **Combine mode** | Workspace path: per-product **instance arrays** (multiple bAV / ETF / insurance / etc. contracts) combined into one household-level result. Simulated by `simulatePortfolio` (`portfolioAdapter.ts` → `portfolioCombine.ts`). Saved under `STORAGE_KEY_V2`. |
| **Workspace** | The combine-mode container: profile, partner, baseline scenario, what-if scenarios, per-product instance arrays, transfer events. Type: `Workspace` in `src/domain/workspace.ts`. SchemaVersion 2. |
| **Baseline scenario** | The user's current-state scenario inside a workspace. Always exactly one per workspace. Identified by `assumptions.activeScenarioId === 'baseline'`. |
| **What-if scenario** | A mutation of the baseline (different contributions, transfer events, paid-up flips). Uses scenario IDs prefixed `whatif-…` from `newScenarioId()` in `workspaceIdentity.ts`. |
| **Product instance** | One concrete contract (e.g. one bAV at employer X, one specific Riester contract). Has its own `instanceId` (`${productId}-${random8}`). Lives in `workspace.assumptions.{bav,etf,insurance,basisrente,altersvorsorgedepot,riester}` arrays. Per-instance simulation is driven by projecting the instance into a singleton-shaped `ScenarioAssumptions` (see Projection below). |
| **Singleton view** | Compare-mode-shaped projection of a workspace. `singletonViewOfWorkspace()` in `portfolioProjection.ts` returns one ScenarioAssumptions for share-URL ingest, legacy compare paths, and Monte Carlo. |
| **Transfer event** | A scheduled cash/capital transition between instances or out of an instance: `certified` (tax-free Direktübertragung) or `surrender_reinvest` (surrender with haircut, proceeds reinvested). Type: `TransferEvent` in `src/domain/instances.ts`. Note: `partial_transfer` is not yet in the schema (planned future work); `paid_up` is an instance **status** flag (see `InstanceCommon.status`), not a transfer event type. Collected by `collectTransferEvents` in `portfolioTransfer.ts`. Storage backfill uses the same `transferEventKey` shape from `storage.ts`. |
| **Capital policy** | Per-instance contract for how transfer events are realised at simulation time (initial capital injections, paid-up runtime overrides, surrender tax). Built by `buildInstanceCapitalPolicy` in `portfolioTransfer.ts`. |
| **Paid-up (beitragsfrei)** | Phase-2 contract state: contributions stop, capital continues to grow under (usually elevated) paid-up fees. Per-product paid-up funding helpers live in `portfolioFunding.ts`. |
| **Evidence state** | Per-instance per-field confidence flag: `'user_confirmed' \| 'model_estimate' \| 'statement'`. Domain type in `src/domain/instances.ts`. Display mapping via `evidenceStateToProvKind` in `src/features/results/provenanceHelpers.ts`. |
| **Provenance kind** | Display-layer confidence label (`'user' \| 'confirmed' \| 'model' \| 'default'`) used by `ProvLabel` / `FieldWithProv` in `src/features/results/provenance.tsx`. |
| **Recommendation atom** | Smallest unit of recommender output: `{ id, priority, context }`. Pure rules in `src/app/recommendations.ts`; German copy templates in `src/content/recommendationCopy.ts`. |
| **Combine context** | Statutory pension + tax + KV/PV routing decisions shared by combine simulation and the recommender. Built by `buildCombineContext` in `src/engine/combineContext.ts`. |
| **Schicht 1 / 2 / 3** | The German three-pillar retirement layering: Schicht 1 = Basisrente / GRV, Schicht 2 = Riester / AVD / bAV, Schicht 3 = ETF / private insurance. |

## Module ownership map

Where to look for what. Each row points to the module that **owns** the
behaviour; tests live next to the module unless noted.

### Engine — math primitives (unchanged by the architecture-readability refactor)

| Concern | Module |
|---------|--------|
| Income / capital-gains tax | `src/engine/tax.ts` |
| Salary, BMF PAP Vorsorgepauschale, bAV two-pass funding | `src/engine/salary.ts` |
| Retirement-phase tax (cohort tables, Versorgungsfreibetrag, Ehegattensplitting) | `src/engine/retirementTax.ts` |
| Monthly retirement net-payout cascade (bAV/pAV/AVD/Riester/Basisrente) | `src/engine/retirementPayout.ts` |
| Accumulation, fee drag, ETF Vorabpauschale | `src/engine/accumulation.ts` |
| Salary-phase §10 Sonderausgaben tax-delta primitives | `src/engine/salaryPhaseFunding.ts` |
| Monte Carlo return paths | `src/engine/marketReturns.ts`, `src/engine/monteCarlo.ts` |
| Per-product simulators / validators | `src/engine/products/<product>.ts` |
| Single source of truth for product identity | `src/engine/productRegistry.ts` |

### Engine — orchestration

| Concern | Module |
|---------|--------|
| Compare-mode top-level | `src/engine/simulate.ts` (`simulateRetirementComparison`) |
| Pre-scenario funding context (bAV, Basisrente, AVD, Riester) | `src/engine/simulationContext.ts` (`buildContext`) |
| Combine-mode top-level | `src/engine/portfolioCombine.ts` (`combinePortfolio`) |
| Combine-mode adapter (per-instance projection + simulation orchestration) | `src/engine/portfolioAdapter.ts` (thin) |

### Combine-mode submodules — the architecture-readability split

The portfolio adapter was split into focused modules. The adapter itself is
now thin orchestration; each concern below has its own home with co-located
tests.

| Concern | Module |
|---------|--------|
| Instance → singleton-shaped `ScenarioAssumptions` projection, neutralised defaults, `singletonViewOfWorkspace` | `src/engine/portfolioProjection.ts` |
| Transfer event collection, calendar-year ↔ contract-year, `buildInstanceCapitalPolicy`, surrender-tax | `src/engine/portfolioTransfer.ts` |
| Cross-instance funding apportionment (bAV §3 Nr. 63, Basisrente §10 Abs. 3, Riester €2 100, AVD per-contract) | `src/engine/portfolioFunding.ts` |
| §20 Abs. 9 EStG Sparerpauschbetrag allocation across multiple ETF instances | `src/engine/portfolioAllowance.ts` |
| Statutory pension + KV/PV + retirement health routing for combine and recommender | `src/engine/combineContext.ts` |

### App layer

| Concern | Module |
|---------|--------|
| Workspace IDs + pure workspace mutations (no React, breaks the app↔inventory cycle) | `src/app/workspaceIdentity.ts` |
| Workspace state hook (combine mode) | `src/app/portfolioState.ts`, `src/app/useWorkspace.ts` |
| Compare-mode state hook | `src/app/useCalculatorState.ts` |
| Mode-aware state hook for `/eingaben` (Deine Angaben) | `src/app/useAngabenState.ts` |
| Simulation hook (compare + Monte Carlo + tax-mode derivation) | `src/app/useSimulationResult.ts` |
| Workspace UI toggles (no simulation deps) | `src/app/useWorkspaceUiState.ts` |
| Derived chart/table/CSV/share-link views | `src/app/useDerivedViews.ts`, `src/app/simulationSelectors.ts` |
| Combine simulation hook | `src/app/useCombineSimulation.ts` |
| Recommender orchestrator (candidate selection, ranking, what-if materialisation) | `src/app/recommender.ts` |
| Per-product candidate generation (registry pattern) | `src/app/recommenderCandidates/` |
| Recommendation rules (pure, atoms in/out) | `src/app/recommendations.ts` |
| Routing (tagged-union `Route` + `ROUTES` constructors + `pathToRoute` / `routeToPath` translators; dynamic segment for `/vertrag/:instanceId`) | `src/app/useRoute.ts` |

### Content (no React)

| Concern | Module |
|---------|--------|
| German copy templates for recommendation atoms | `src/content/recommendationCopy.ts` |
| Glossary, product-focus copy, guided-setup paths | `src/content/{terms,productFocus,triggers}.ts` |

### Features (UI)

| Concern | Module |
|---------|--------|
| Inventory wizard, sidebar, instance cards | `src/features/inventory/{InventoryWizard,CombineDashboardSidebar,InstanceCard}.tsx` |
| Inventory product registry (defaults, drafts, draft→instance, labels) | `src/features/inventory/inventoryProductRegistry.ts` |
| Shared inventory field components (`InvField`, …) | `src/features/inventory/fields.tsx` |
| Inventory field non-component helpers (`toNumber`, option tables) | `src/features/inventory/fieldHelpers.ts` |
| Compare-mode inputs + per-product UI dispatch | `src/features/inputs/productUiRegistry.tsx`, `src/features/inputs/sections/` |
| Provenance primitives (`ProvLabel`, `FieldWithProv`) | `src/features/results/provenance.tsx` |
| Evidence ↔ provenance + export-label mapping | `src/features/results/provenanceHelpers.ts` |
| Legal pages (Impressum, Datenschutz, footer) | `src/features/legal/` |
| Combine-mode "Mein Plan" Sober D surface (lead + headline + § 1 Zusammensetzung + § 2 Sensitivität + right-rail "Deine Angaben" receipt) | `src/features/mein-plan/MeinPlanPage.tsx` |
| Sensitivity-row perturbation selectors (Rendite konservativ / Renteneintritt 70 / Inflation 3 % / ETF-Beitrag +100 €) — pure, framework-agnostic, re-run `runCombineSimulation` over a cloned workspace | `src/features/mein-plan/sensitivitySelectors.ts` |
| Policy-default constants for the sensitivity rows (target scenario id, age cap, inflation rate, ETF-bump amount) | `src/features/mein-plan/sensitivityConfig.ts` |
| Per-contract Vertrag-Detail Sober D surface (header + KPI strip + § 1 "Was wäre, wenn …" scenarios + § 2 "Wie wir das berechnen" provenance + right-rail Vertragsdaten metadata aside; mounted via the dynamic `/vertrag/:instanceId` route, drill-in from Mein Plan § 1 instance rows) | `src/features/vertrag-detail/VertragDetailPage.tsx`, plus co-located `VertragKpiStrip.tsx`, `VertragScenarioTable.tsx`, `VertragProvenanceList.tsx`, `VertragMetadataAside.tsx` |
| Per-contract decision atoms (weiterführen / beitragsfrei / beitrag-erhöhen / beitrag-senken / kündigen / übertragen) consumed by the Vertrag-Detail scenario table and `applyContractDecision` mutation pipeline | `src/app/contractDecisions.ts` |
| Kapital & Auszahlungen Sober D surface (kicker + H1 + page-level filter chips + full-width lifecycle chart + § 1 Wendepunkte table; mounted on the static `/kapital` route, drill-in from Mein Plan headline aside; dual-source — renders for both compare and combine modes) | `src/features/kapital/KapitalPage.tsx`, plus co-located `KapitalFilterChips.tsx`, `KapitalWendepunkteTable.tsx`, `kapitalFilters.ts`, `wendepunkte.ts` |
| Viewport-aware chart-density tokens (axis-label visibility, axis width, margins, callout font sizes) consumed by `BreakEvenChart` (and intended for `FeeDragChart` / `MonteCarloPanel` migration) | `src/ui/charts/useChartDensity.ts` |

### Storage

`src/storage.ts` is the **only** load/save module. It is split into clear
sections:

- v1 / v2 storage keys + version constants
- `mergeDeep` + `applyPreMergeMigrations`
- `migrateAndValidateState` (shared by compare-mode load and the scenario library)
- v2 workspace load path (production runs `validateWorkspace` after migration)
- `transferEventKey` (exported so `portfolioTransfer.ts` can dedupe consistently)
- compare-mode save / load
- workspace save / load

Migration posture: malformed v2 workspaces fall back to defaults locally;
malformed share-URL ingest produces a null result so the caller can surface
an "invalid link" state. Scenario-library entries that fail validation are
dropped silently on load.

## Cross-cutting invariants

These are the rules that survive multiple refactors. Violating any of them
should be flagged in review.

- **Engine is React-free.** `src/engine/**` must not import React, DOM APIs,
  or files under `src/features/**`. UI counterparts to engine registries (e.g.
  `productUiRegistry.tsx`, `inventoryProductRegistry.ts`) live in `src/features/**`.
- **Statutory rounding only where the law requires it.** UI rounding happens at
  the display boundary (`<NumberField>`, `formatCurrency`, `formatPercent`).
  See `CLAUDE.md` → "UI rounding boundary".
- **Disclaimer is session-only.** `DisclaimerBanner` uses `sessionStorage`,
  never `localStorage`. Regressing this is publication-blocking.
- **Public copy uses RentenWiki.de.** `Rentenrechner` is fine in code symbols,
  npm package, internal docs, ADRs, and design notes — never in user-facing
  page titles, marketing copy, OG tags, or share-URL slugs.
- **Fair-comparison invariant** applies to compare-mode only (see
  `CLAUDE.md` → "Non-obvious architecture").
- **Combine context is shared.** Recommender and combine simulation both call
  `buildCombineContext`. If you find tax / KV/PV routing being rebuilt
  somewhere else, fold it into `combineContext.ts`.
- **PRODUCT_REGISTRY is the source of truth for engine product identity;
  INVENTORY_PRODUCT_REGISTRY is the source of truth for inventory metadata.**
  Both should be edited locally when adding a product.
- **Oracle goldens.** `simulate.integration.test.ts` and dedicated oracle
  tests pin externally-verified payroll, retirement-tax, and bAV-funding
  outputs. Do not update snapshots without an explicit justified reason.

## Where to start for common tasks

| Task | Start here |
|------|-----------|
| Change a product's calculation | `docs/context/products.md`, then `src/engine/products/<product>.ts` |
| Change tax / social-security rules | `docs/context/rules-and-tax.md` |
| Change UI layout or inputs (compare mode) | `docs/context/ui.md`, `src/features/inputs/productUiRegistry.tsx` |
| Add a product / change inventory metadata | `src/features/inventory/inventoryProductRegistry.ts` (UI side), `src/engine/productRegistry.ts` (engine side) |
| Change combine-mode projection / instance shape | `src/engine/portfolioProjection.ts` |
| Change cross-instance funding caps | `src/engine/portfolioFunding.ts` |
| Change Sparerpauschbetrag allocation across ETFs | `src/engine/portfolioAllowance.ts` |
| Change transfer-event behaviour | `src/engine/portfolioTransfer.ts` (and `transferEventKey` in `storage.ts` for dedupe) |
| Change statutory-pension / KV/PV routing for combine + recommender | `src/engine/combineContext.ts` |
| Change recommendation rules | `src/app/recommendations.ts` |
| Change recommendation copy | `src/content/recommendationCopy.ts` |
| Add a recommender product candidate | `src/app/recommenderCandidates/<product>.ts` + register in `recommenderCandidates/index.ts` |
| Change evidence ↔ confidence display | `src/features/results/provenanceHelpers.ts` |
| Change storage migration / load path | `src/storage.ts` (sections clearly marked) |
| Plan future schema changes | `docs/portfolio-schema-design.md` |
| Audit oracle / integration coverage | `docs/golden-coverage-audit.md` |
| Update annual statutory values | `src/rules/de2026.ts` |
| Edit Impressum / Datenschutz / footer | `src/features/legal/` |

## Out of scope (do not introduce here)

- Backend / fetch / cookies / telemetry / analytics — see "Backend boundary"
  in `CLAUDE.md`.
- Commercial-license enforcement gates (default to free until product reasons
  exist).
- Renaming the npm package, code symbols, or historical "Rentenrechner"
  references in design docs / ADRs / backlog.
- Changes to calculation results, statutory rules, payout math, or rounding
  policy — those are product changes and need their own issue.
