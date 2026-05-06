# Comparison API Monte Carlo option

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Add optional Monte Carlo execution to the Comparison Mode API. The API should run the existing Monte Carlo engine only when requested and valid, echo stochastic inputs in the response, and preserve deterministic behavior for the same seed and request.

Monte Carlo should remain bounded by existing validation limits and should return null or an omitted section when disabled or when `visibleProducts` is empty. It composes with detail levels as follows: `full` includes yearly bands, `standard` includes summaries only, and `summary` omits Monte Carlo unless explicitly requested.

## Acceptance criteria

- [ ] API accepts an option to include or omit Monte Carlo output.
- [ ] API uses the normalized/synced assumptions from the comparison pipeline when running Monte Carlo.
- [ ] API returns scenario id, scenario label, annual return, volatility, run count, seed, and product summaries from the existing Monte Carlo engine.
- [ ] API includes Monte Carlo yearly bands only at `full` detail.
- [ ] API includes Monte Carlo summaries only at `standard` detail.
- [ ] API omits Monte Carlo at `summary` detail unless explicitly requested.
- [ ] API omits or nulls Monte Carlo output when Monte Carlo is disabled, not requested, invalid, or visible products are empty.
- [ ] Same request and seed produce identical Monte Carlo output.
- [ ] Tests cover deterministic output, disabled behavior, empty visible products, custom selected scenario, and validation bounds.

## Blocked by

- .scratch/pure-frontend-api/issues/07-comparison-api-summary-tracer-bullet.md
- .scratch/pure-frontend-api/issues/08-comparison-api-detail-levels-and-heavy-results.md
