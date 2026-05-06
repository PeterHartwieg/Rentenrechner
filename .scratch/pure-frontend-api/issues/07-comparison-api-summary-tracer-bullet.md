# Comparison API summary tracer bullet

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Create the first complete Comparison Mode API function. It should accept a profile and singleton compare-mode assumptions, fill defaults, validate, normalize the monthly Netto-Belastung anchor, apply contribution sync, run the existing compare-mode simulation, resolve the selected scenario, and return compact selected-scenario summaries.

This slice is the most important UI/API parity tracer bullet. It should prove that API callers get the same core numbers as the current app path without importing app hooks or raw engine orchestration directly.

Decision: this API operates on already-loaded profile/assumptions, not raw saved-state payloads. It does not reproduce the legacy `compareSubMode === 'equal_cash' && equalInputAmountEUR === undefined` load fallback. That compatibility behavior belongs to storage/parse helpers, not the simulation pipeline.

## Acceptance criteria

- [ ] API accepts full or partial profile/assumption input and fills canonical defaults.
- [ ] API preserves explicit empty `visibleProducts` as "no comparison selected".
- [ ] API normalizes explicit `equalInputAmountEUR`/monthly Netto-Belastung and applies contribution sync before simulation.
- [ ] API does not implement saved-state legacy anchor fallback; callers that need legacy state compatibility must parse/migrate before calling this function.
- [ ] API runs the existing compare-mode simulation with the resolved rules.
- [ ] API resolves the effective selected scenario using the same fallback behavior as current selectors.
- [ ] API returns statutory pension, product summaries for the selected scenario, funding summaries, product manifest snapshot, best-capital summary, best-pension summary, tax-mode diagnostics, warnings, and metadata.
- [ ] Product results are returned as an array of entries shaped for an optional future `instanceId` discriminator, for example `{ productId, instanceId?, scenarioId, ...summary }`, rather than a flat `Record<ProductId, ...>` map that cannot represent multiple instances of the same product.
- [ ] Summary output omits yearly row payloads by default.
- [ ] Tests assert parity with the current `useSimulationResult`/selector pipeline for defaults, custom net anchor, custom scenario, and empty visible products.

## Blocked by

- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
