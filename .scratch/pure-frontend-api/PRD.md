# PRD - Pure Front-End API Facade

Status: needs-triage
Created: 2026-05-06

## Problem Statement

RentenWiki.de already has a strong pure calculation core, but the codebase does not yet have a stable API boundary for consumers inside the front-end. The React app calls a mix of engine functions, app-layer normalization, selectors, storage helpers, and product registries directly. That works for the current UI, but it makes future reuse harder: tests, exports, documentation, a future backend wrapper, or a potential browser-embedded SDK would all need to know which internal functions to compose and in which order.

The biggest risk is subtle drift. In comparison mode, the user-facing numbers are not produced by the simulation function alone. The app first normalizes the monthly Netto-Belastung anchor, syncs product contributions, resolves the active scenario, may run Monte Carlo, and derives tax-mode context for downstream views. A caller that invokes only the raw simulation function can get a result that is technically valid but not equivalent to the UI.

The tax engine has a related issue. Individual primitives exist for income tax, salary tax, social-security contributions, retirement tax, KV/PV, capital gains tax, and product-specific funding effects. They are well-tested, but there is no single front-door contract that describes supported inputs, rule-year handling, validation, diagnostics, and response metadata.

We need a comprehensive pure front-end API layer that turns the existing calculation modules into a stable, documented, testable contract without introducing a backend, network calls, telemetry, cookies, authentication, or PII collection.

## Solution

Introduce a versioned TypeScript API facade that runs entirely in the browser/front-end bundle. The facade is a contract layer, not a backend and not an engine rewrite. It composes the existing pure engine, app normalization, validation, registry metadata, and result selectors behind stable request/response shapes.

The API has three first-class surfaces:

1. **Manifest API**
   Exposes supported API version, active rule year, supported rule years, product manifest, default profile, default assumptions, supported comparison options, and capability flags.

2. **Tax Engine API**
   Exposes comprehensive tax and statutory-calculation operations: income tax, solidarity surcharge, capital gains tax, salary/payroll result, employee social contributions, bAV funding, Schicht-1/Basisrente funding, AVD funding, Riester funding, retirement tax, retirement KV/PV, and monthly retirement payout routing where appropriate.

3. **Comparison Mode API**
   Exposes one canonical front-door for the existing singleton comparison mode. It accepts profile and scenario inputs, fills defaults, validates, applies the same Netto-Belastung contribution sync as the UI, runs the comparison simulation, optionally runs Monte Carlo, and returns both machine-readable result data and structured diagnostics.

The API must be pure and deterministic:

- No React imports.
- No DOM access.
- No localStorage/sessionStorage access.
- No fetch or network I/O.
- No cookies or authentication.
- No display-layer rounding.
- Same input plus same rule year produces the same output.

The React app should eventually call this API facade for comparison-mode simulation so the UI and any non-UI consumers use one canonical pipeline. A future HTTP API, if ever needed, should be a thin backend adapter over the same facade.

## User Stories

1. As a maintainer, I want a stable front-end API facade over the tax engine, so that callers do not need to know the internal module map.
2. As a maintainer, I want a stable front-end API facade over comparison mode, so that the UI, tests, exports, and future adapters all use the same simulation pipeline.
3. As a frontend developer, I want to call one comparison function with profile and assumptions, so that I do not need to remember the contribution-sync sequence.
4. As a frontend developer, I want the comparison API to apply the same monthly Netto-Belastung normalization as the app, so that API results match visible UI results.
5. As a frontend developer, I want the comparison API to return selected scenario summaries, so that views do not need to re-filter raw product arrays.
6. As a frontend developer, I want the comparison API to optionally return full yearly rows, so that lightweight views can avoid carrying heavy cashflow data.
7. As a frontend developer, I want the comparison API to optionally run Monte Carlo, so that deterministic comparison and stochastic risk output can be requested through one contract.
8. As a frontend developer, I want Monte Carlo responses to echo seed, run count, scenario, expected return, and volatility, so that stochastic outputs are auditable.
9. As a test author, I want the API output to be deterministic and pure, so that integration tests can call it without jsdom or browser storage.
10. As a test author, I want parity tests between the API and the existing UI pipeline, so that the API does not become a parallel calculation path.
11. As a future backend implementer, I want all API functions to accept plain JSON-like request objects, so that an HTTP adapter can pass parsed request bodies into the same functions.
12. As a future backend implementer, I want responses to be serializable without functions, Dates, Maps, or class instances, so that the same contract can cross an HTTP boundary later.
13. As a future backend implementer, I want every response to echo API version and rule year, so that clients can cache and audit results safely.
14. As a future SDK/package consumer, I want product metadata from a manifest function, so that I can build UI selectors without importing engine registries directly.
15. As a future SDK/package consumer, I want defaults from a manifest function, so that I can start from RentenWiki.de's canonical baseline without copying fixtures.
16. As a future SDK/package consumer, I want structured validation errors with useful field paths where the API owns the DTO and slot-root paths where existing product validators remain authoritative, so that I can show useful messages without duplicating product validation logic.
17. As a future SDK/package consumer, I want errors to be machine-readable codes, so that UI copy can be localized separately from validation logic.
18. As a privacy-conscious maintainer, I want the front-end API to avoid network calls entirely, so that adding the API does not change the no-backend privacy posture.
19. As a privacy-conscious maintainer, I want the API to avoid browser storage access, so that callers decide whether and where to persist state.
20. As a legal/compliance reviewer, I want API responses to carry not-advice metadata/disclaimer references, so that downstream exports and surfaces do not accidentally omit the product posture.
21. As a legal/compliance reviewer, I want the API not to introduce batch, white-label, or broker automation features by default, so that commercial-license posture is not weakened accidentally.
22. As a tax-engine consumer, I want to calculate the 2026 income-tax tariff for a taxable income, so that I can use the statutory primitive without going through a full retirement comparison.
23. As a tax-engine consumer, I want to calculate solidarity surcharge from income tax and filing status, so that I can inspect the tax component separately.
24. As a tax-engine consumer, I want to calculate capital-gains tax with partial exemption and saver allowance inputs, so that ETF and insurance tax projections can be explained.
25. As a tax-engine consumer, I want to calculate a salary result from a personal profile, so that I can inspect annual net salary, taxable income, social contributions, and Vorsorgepauschale.
26. As a tax-engine consumer, I want to calculate bAV funding from profile and bAV assumptions, so that tax/SV savings, employer subsidy, cap effects, and GRV reduction are available independently.
27. As a tax-engine consumer, I want to calculate Basisrente funding from salary-phase context and assumptions, so that Schicht-1 cap effects are visible without a full simulation.
28. As a tax-engine consumer, I want to calculate AVD funding from salary-phase context, assumptions, and profile, so that allowance and tax-benefit effects are available independently.
29. As a tax-engine consumer, I want to calculate Riester funding from salary-phase context, assumptions, and profile, so that allowances, own contribution, and Günstigerprüfung are visible independently.
30. As a tax-engine consumer, I want to calculate retirement tax from explicit income components, so that GRV, bAV, private insurance, certified pensions, and other taxable income can be inspected as one aggregate.
31. As a tax-engine consumer, I want to calculate retirement KV/PV from explicit monthly source components, so that BBG caps, Freibetrag, and freiwillig-GKV routing can be inspected.
32. As a tax-engine consumer, I want tax responses to return detailed breakdowns, so that a UI can explain how a net result was reached.
33. As a tax-engine consumer, I want tax APIs to reject unsupported rule years, so that I do not unknowingly calculate with stale law.
34. As a tax-engine consumer, I want tax APIs to return exact numeric values without display rounding, so that downstream calculations preserve precision.
35. As a comparison-mode user, I want visible products to be respected, including an explicit empty list, so that "no comparison selected" remains a valid state.
36. As a comparison-mode user, I want all visible products to use the same Netto-Belastung anchor where statutory caps allow, so that the fair-comparison invariant is preserved.
37. As a comparison-mode user, I want the API to return statutory pension alongside product results, so that private-product outcomes can be understood against the GRV baseline.
38. As a comparison-mode user, I want the API to return funding summaries for bAV, Basisrente, AVD, and Riester, so that contribution and subsidy mechanics are visible.
39. As a comparison-mode user, I want the API to return per-product scenario results sorted by product registry order, so that client views remain stable.
40. As a comparison-mode user, I want the API to support conservative, baseline, optimistic, and custom scenarios, so that sensitivity analysis is available through the same call.
41. As a comparison-mode user, I want the API to derive active scenario fallback consistently, so that removing a selected custom row does not crash clients.
42. As a comparison-mode user, I want the API to provide best-capital and best-pension summaries, so that simple consumers do not need to reimplement ranking.
43. As a comparison-mode user, I want the API to expose tax-mode diagnostics for bAV and private insurance, so that contract-vintage and payout routing are explainable.
44. As a comparison-mode user, I want the API to expose whether each product supports after-tax lump-sum comparison, so that clients do not treat locked capital as accessible wealth.
45. As a comparison-mode user, I want full yearly rows only when requested, so that normal UI interactions remain light.
46. As a documentation author, I want API contracts described in domain terms like compare mode, visibleProducts, Netto-Belastung, and rule year, so that docs match the rest of the project vocabulary.
47. As a maintainer, I want the API to use product and rules registries as sources of truth, so that adding a product or rule year does not require duplicating identity lists.
48. As a maintainer, I want API contracts to be narrower than internal domain types, so that internal storage/schema migrations do not become breaking API changes.
49. As a maintainer, I want API adapters from public DTOs into internal domain objects, so that validation, defaults, and migration are owned in one place.
50. As a maintainer, I want the React app to migrate incrementally to the API facade, so that the API can land without a risky all-at-once refactor.
51. As a maintainer, I want the API to preserve existing golden-test outputs, so that this feature does not change calculation behavior.
52. As a maintainer, I want no public batch-simulation endpoint in v1, so that the feature does not accidentally become a commercial automation surface.
53. As a maintainer, I want all API modules to be deep modules with small public entrypoints, so that the rest of the codebase can rely on them without understanding the engine internals.
54. As a maintainer, I want API docs/examples to use RentenWiki.de public naming, so that user-visible artifacts do not introduce new Rentenrechner branding.
55. As a future portfolio-mode maintainer, I want the comparison API design not to block a later combine-mode API, so that the same response conventions can be extended to workspaces.

## Implementation Decisions

- **This is a pure front-end API facade, not a backend.** No HTTP routes, serverless functions, auth, license validation, file upload, analytics, telemetry, cookies, or fetch are introduced.
- **API versioning starts at v1.** Every request and response carries an API version. Unsupported versions return structured errors.
- **Rule year is explicit.** Requests may omit rule year to use the active rule set, but responses must echo the concrete rule year used. Explicit unsupported rule years return a structured error rather than silently falling back.
- **Public DTOs are separate from internal domain objects.** The API accepts and returns stable request/response contracts. Internal domain types, storage envelopes, and workspace schema details can change behind adapters.
- **The API preserves exact numbers.** No display rounding is performed. Display concerns remain with UI formatters.
- **All public functions are synchronous unless Monte Carlo cost later requires an async wrapper.** v1 should stay synchronous because current engine paths are CPU-only and deterministic.
- **All public functions return serializable data.** Responses should avoid functions, Maps, Sets, class instances, and browser objects.
- **All errors use a structured result envelope.** The envelope distinguishes success from failure and includes field path, code, severity, and human-readable fallback message.
- **Validation diagnostics are hybrid by design.** API-owned DTO fields and shared compare-mode fields get field-level paths. Product-specific assumption validation remains delegated to the existing product validators; failures there report the product slot root path rather than duplicating every product validator.
- **Warnings are not errors.** Statutory cap hits, estimate-driven assumptions, unsupported optional output sections, and disclaimer reminders should be returned as warnings/diagnostics when calculation can still proceed.
- **The manifest API is the discovery surface.** It exposes product metadata, default profile, default assumptions, supported rule years, active rule year, comparison capability flags, Monte Carlo limits, and response-detail options.
- **Manifest active rule year comes from active rules.** `activeRuleYear` must be read from the active rule object, not hardcoded as 2026.
- **The tax API groups primitives by user task.** Instead of forcing callers to import individual low-level helpers, it offers stable operations for income tax, capital gains tax, salary/payroll, salary-phase funding, retirement tax, retirement KV/PV, and monthly retirement payout routing.
- **API DTOs are owned by the API layer.** Public response types must not re-export internal engine/domain result types, even when v1 fields are structurally identical.
- **The salary API returns the full salary result.** It includes gross, net, taxable income, income tax, solidarity surcharge, social-contribution breakdown, Vorsorgepauschale, and PKV subsidy fields where applicable.
- **The bAV funding API returns cap and subsidy diagnostics.** It exposes gross conversion, net cost, tax/SV savings, employer contribution, salary-before/after views, and estimated GRV reduction.
- **Standalone funding operations call direct helpers.** Funding API functions call the product funding/solver helpers directly. `buildContext` remains comparison/combine orchestration.
- **The Basisrente, AVD, and Riester funding APIs return both direct funding and tax-benefit diagnostics.** This makes subsidy/cap mechanics explainable without requiring a full product projection.
- **The retirement tax API accepts source components, not product assumptions.** It should model the statutory tax pipeline directly and return taxable-source breakdowns, Pauschbeträge, zvE, tax, soli, Abgeltungsteuer where applicable, and net retirement income.
- **The retirement KV/PV API accepts source channels, not product assumptions.** It should expose aggregate BBG-aware KV/PV calculations across bAV Versorgungsbezüge, other Versorgungsbezüge, GRV, and freiwillig-GKV other income.
- **Comparison API owns contribution sync.** The public comparison call normalizes the monthly Netto-Belastung anchor and applies product contribution sync before simulation. This is required for UI/API parity.
- **Comparison API accepts partial input with defaults.** Callers can provide only the fields they want to override; the API fills missing values from canonical defaults before validation.
- **Comparison API validates after defaults and normalization.** This matches the current storage/load posture: defaults fill additive gaps, then validation enforces ranges and invariants.
- **Comparison API preserves explicit empty visibleProducts.** Empty means "no comparison selected", not "use defaults".
- **Comparison API returns both raw and derived views in controlled detail levels.** Minimal responses include selected scenario summaries; full responses may include all product results, yearly rows, ETF payout rows, funding results, statutory pension, and Monte Carlo.
- **Comparison API supports output detail options.** Examples of options: include all scenarios, include yearly rows, include ETF payout schedule, include Monte Carlo, include tax diagnostics, include export-ready metadata.
- **Comparison API does not download or write exports.** It may return export-ready data or CSV strings only if explicitly requested, but file download remains a UI concern.
- **Monte Carlo is optional and bounded.** The API respects existing run-count validation limits and returns null/omits Monte Carlo when disabled or when visible products are empty.
- **Legacy load fallback stays outside the comparison facade.** The comparison API accepts profile plus assumptions. Saved-state quirks such as old equal-cash fallback belong to storage/compatibility helpers, not the simulation API.
- **Compatibility helpers are stretch/post-core.** If exposed, parsing/building saved-state or share-URL payloads must be string-in/string-out and must not touch localStorage, sessionStorage, history, or clipboard. They are not required for the first usable API facade.
- **The React app migration is post-v1.** First ship API tests around existing behavior. A later follow-up may migrate only `useSimulationResult`; broad hook/view-model refactors are out of scope for v1.
- **The facade must not duplicate product identity.** Product IDs, labels, colors, and order come from the product registry/manifest source of truth.
- **The facade must not duplicate statutory constants.** Rule values come from the active/year-specific rules modules.
- **The facade must not duplicate legal routing.** Retirement tax, KV/PV, private-insurance tax mode, bAV lump-sum tax mode, and product payout routing continue to live in the existing engine modules.
- **No calculation behavior changes are included.** Any drift in existing golden numbers is a bug unless a separate legal/modeling change is explicitly approved.
- **No combine-mode API in v1 unless it is implemented as a thin experimental mirror.** The main v1 scope is Tax Engine plus Compare mode. The response conventions should leave room for a later workspace/combine API.

### Proposed Public API Surfaces

The implementation should expose the following conceptual surfaces. Exact TypeScript names can be chosen during implementation, but the capability set should remain intact.

| Surface | Purpose |
|---|---|
| Manifest | Discover API version, products, defaults, rule years, limits, and capability flags. |
| Validation | Validate profile, tax inputs, comparison requests, and normalized assumptions with structured errors. |
| Tax Engine | Run statutory/tax calculations independently from product comparison. |
| Comparison | Run the canonical compare-mode pipeline, including defaults, validation, contribution sync, simulation, and optional Monte Carlo. |
| Result Summaries | Convert full simulation output into stable, client-friendly summaries without UI formatting. |
| Compatibility | Stretch/post-core pure helpers for parsing/building saved-state or share payloads without storage or browser side effects. |

### Tax Engine Contract Requirements

The Tax Engine API should include operations for:

- Income-tax tariff calculation.
- Solidarity surcharge calculation.
- Capital-gains tax calculation, including partial exemption and saver allowance.
- Employee social-contribution calculation.
- Salary/payroll result calculation.
- PKV employer subsidy calculation where relevant.
- bAV funding calculation and inverse gross-from-net solving where relevant.
- Basisrente funding calculation and inverse gross-from-net solving where relevant.
- AVD allowance/funding calculation and inverse own-contribution-from-net solving where relevant.
- Riester allowance/funding calculation and inverse own-contribution-from-net solving where relevant.
- Retirement tax over aggregate income components.
- Retirement KV/PV over aggregate monthly source channels.
- Monthly retirement payout calculation for supported tax/KV/PV channels where useful as a public primitive.
- Product tax-mode diagnostics for bAV lump-sum routing and private-insurance tax mode.

Each tax operation should return:

- API metadata.
- Rule-year metadata.
- Input normalization notes, if any.
- Calculation result.
- Detailed breakdown, when the underlying engine provides one.
- Structured warnings.

### Comparison Mode Contract Requirements

The Comparison API should accept:

- API version.
- Optional rule year.
- Profile overrides or full profile.
- Assumption overrides or full assumptions.
- Selected scenario id.
- Monthly Netto-Belastung anchor.
- Visible products.
- Return scenarios, including optional custom scenario.
- Output-detail options.
- Monte Carlo options.

The Comparison API should return:

- API metadata.
- Rule-year metadata.
- Normalized profile.
- Normalized assumptions or a compact normalized-input summary.
- Effective selected scenario.
- Product manifest snapshot used for sorting/labels.
- Statutory pension result.
- Funding summaries for bAV, Basisrente, AVD, and Riester.
- Product results for requested scenario(s).
- Selected scenario result summaries.
- Best-capital and best-pension summaries.
- Optional full yearly rows.
- Optional ETF payout rows.
- Optional Monte Carlo result.
- Tax-mode diagnostics.
- Structured warnings/errors.
- Not-advice/disclaimer metadata.

### Response Detail Levels

The Comparison API should support at least three detail levels:

- **Summary:** selected scenario only, no yearly rows, no ETF payout schedule, no Monte Carlo unless explicitly requested.
- **Standard:** selected scenario summaries plus all scenario-level product results without heavy row data. If Monte Carlo is requested, include Monte Carlo summaries only.
- **Full:** complete product results, yearly rows, payout rows, funding results, statutory pension, diagnostics, and optional Monte Carlo including yearly bands.

The default should be Standard for internal UI parity unless performance suggests Summary.

### Deep Modules To Build

- **Contract module.** Owns public request/response DTOs, API metadata, error codes, warning codes, and detail-level definitions.
- **Rule resolver module.** Maps requested rule year to a supported rule object and produces unsupported-year errors.
- **Validation module.** Adds structured diagnostics for API-owned DTO fields and shared compare-mode fields, while keeping existing product validators as the final authority for product-specific assumptions.
- **Tax facade module.** Owns the public tax-engine operations and adapters into existing engine primitives.
- **Comparison facade module.** Owns default merging, contribution sync, validation, simulation, optional Monte Carlo, and response assembly.
- **Result summary module.** Owns derived comparison summaries such as selected results, best capital, best pension, and compact product rows.
- **Compatibility module.** Stretch/post-core module for pure parse/build helpers for state/share payloads.
- **Documentation examples.** Owns executable request/response examples for the main tax and comparison calls.

## Testing Decisions

- **Test external behavior, not implementation details.** API tests should assert request/response behavior and numerical parity, not whether a particular helper was called internally.
- **Golden outputs must not change.** Existing simulation, payroll, retirement-tax, bAV-funding, and product golden tests should remain green. API work should add coverage around them, not replace them.
- **Add API parity tests for comparison mode.** A default comparison request through the API should match the existing compare-mode pipeline after contribution sync.
- **Add API parity tests for custom Netto-Belastung anchors.** Requests with different monthly net anchors should produce the same synced product net costs as the current app path.
- **Add API parity tests for explicit empty visibleProducts.** Empty visible products should return no product comparison and no Monte Carlo.
- **Add API parity tests for custom return scenario selection.** Selected scenario fallback behavior should match current selectors.
- **Add API tests for Monte Carlo determinism.** Same seed/input should produce the same percentile summaries.
- **Add API tests for tax primitives.** Income tax, salary, retirement tax, capital gains tax, and KV/PV should match existing unit/golden expectations.
- **Add structured validation tests.** Invalid profile, shared assumptions, rule year, scenario id, product id, and numeric ranges should produce field-level errors where owned by the API; product-specific validator failures should produce product-slot-root errors.
- **Add serialization-safety tests.** Public responses should JSON stringify/parse without losing required fields.
- **Add no-browser-dependency tests.** API modules should be importable and callable in a pure Vitest environment without jsdom, localStorage, sessionStorage, history, clipboard, or DOM APIs.
- **Add no-rounding tests.** API outputs should preserve exact engine precision; formatting remains outside the API.
- **Add manifest tests.** Product ids, labels, order, colors, and supported products should match the product manifest source of truth.
- **Add rule-year tests.** Omitted rule year uses active rules; explicit supported rule year works; unsupported future/past year returns a structured error.
- **Add purity-boundary enforcement.** `src/api/**` must be protected by restricted imports/globals and API tests should run in a Node environment so React/browser dependency leaks fail fast.
- **Add docs-example tests.** Examples should live as an executable `api.examples.test.ts` style table and documentation should reference that tested example set.

Prior art in the codebase:

- Existing simulation integration snapshots pin end-to-end compare-mode output.
- Existing external golden tests pin statutory tax, payroll, retirement tax, bAV funding, Riester, GRV, and ETF calculations.
- Existing selector tests demonstrate how to test derived views as pure functions.
- Existing combine-simulation tests demonstrate a pure factory pattern outside React hooks.
- Existing storage and schema tests demonstrate migration/validation edge cases and explicit empty-array preservation.

## Out of Scope

- HTTP endpoints.
- Backend selection or setup.
- Serverless functions.
- Authentication.
- License-key validation.
- Accounts.
- Cookies.
- Telemetry or analytics.
- OCR/document upload.
- Persistent storage changes.
- localStorage/sessionStorage access inside the API.
- Clipboard/history/share-link side effects inside the API.
- Batch simulation or bulk export as a public v1 API feature.
- White-label or broker automation features.
- Changing tax, social-security, product, or payout calculation behavior.
- Display rounding or localized UI formatting.
- Replacing the combine-mode/workspace API in v1.
- Migrating React hooks/view-models in v1.
- Saved-state/share compatibility helpers in the core v1 release.
- Public npm package publishing in v1.
- Long-term support for arbitrary old rule years beyond the implemented rules modules.

## Further Notes

- This PRD intentionally treats "API" as a code contract, not a network service. A future HTTP API can wrap the same facade after a genuine backend-triggering feature exists.
- The front-end API should strengthen the backend boundary rather than erode it. If a proposed implementation needs fetch, storage, auth, or telemetry, it has left this PRD's scope.
- The most important correctness rule is UI/API parity for comparison mode. The API must include contribution synchronization, validation, active-scenario resolution, and optional Monte Carlo composition rather than exposing only the raw simulation primitive.
- The second most important correctness rule is not changing numbers. This is an adapter/facade feature. Calculation changes belong in separate legal/modeling issues.
- The API should make future documentation easier: a new contributor should be able to understand "how to run a comparison" from the facade contract rather than reconstructing the path from app hooks.
- A later combine-mode API should reuse the same metadata, error, warning, rule-year, and detail-level conventions, but it does not need to ship in this PRD.
