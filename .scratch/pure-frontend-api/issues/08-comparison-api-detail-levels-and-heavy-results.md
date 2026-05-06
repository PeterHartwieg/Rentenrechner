# Comparison API detail levels and heavy results

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Extend the Comparison Mode API with response detail levels: Summary, Standard, and Full. The API should let callers choose whether to receive selected-scenario summaries only, all scenario product results without heavy row data, or complete product results including yearly rows and ETF payout schedules.

This slice should keep the default response practical for UI use while allowing documentation, debugging, and future adapters to request full calculation payloads.

Monte Carlo composition is defined here even though execution lands in the Monte Carlo ticket: `full` may include Monte Carlo yearly bands, `standard` includes Monte Carlo summaries only, and `summary` omits Monte Carlo unless explicitly requested.

## Acceptance criteria

- [ ] API supports at least `summary`, `standard`, and `full` detail levels.
- [ ] Summary returns selected scenario summaries and omits yearly rows and ETF payout rows.
- [ ] Standard returns all scenario-level product summaries without heavy yearly rows.
- [ ] Full returns complete product results including yearly rows and ETF payout rows where available.
- [ ] Detail-level contract specifies Monte Carlo composition: full includes yearly bands, standard includes summaries only, summary omits Monte Carlo unless explicitly requested.
- [ ] Detail levels are documented in the manifest.
- [ ] Responses remain JSON-serializable at every detail level.
- [ ] No display rounding is introduced by summary construction.
- [ ] Tests cover field inclusion/exclusion for all detail levels and ensure summary numbers match full numbers.

## Blocked by

- .scratch/pure-frontend-api/issues/07-comparison-api-summary-tracer-bullet.md
