# API barrel, documentation, and executable examples

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Add the public API barrel/export surface and concise documentation examples for the pure front-end API. Examples should cover manifest discovery, a simple tax operation, salary/payroll, retirement tax, and a comparison-mode simulation with a monthly Netto-Belastung anchor.

The docs should use RentenWiki.de public naming and clearly state that this is a pure browser/TypeScript API, not an HTTP API or backend service.

Decision: examples live in an executable `api.examples.test.ts` style table. Documentation references those examples rather than maintaining a second hand-written set. The test table is the source of truth, so examples cannot drift silently.

Scope note: the first example set covers the core/summary comparison path only. Detail-level and Monte Carlo examples should be added in a follow-up once those API slices land, so public docs do not imply those heavier response shapes are undocumented forever.

## Acceptance criteria

- [ ] A single public API barrel exports the intended facade functions and public DTO types.
- [ ] Internal-only helpers are not exported from the public API barrel.
- [ ] Documentation examples cover manifest, tax primitive, salary/payroll, retirement tax, and comparison simulation.
- [ ] Documentation explicitly states that initial comparison examples cover the summary path; detail-level and Monte Carlo examples are follow-up coverage after their slices land.
- [ ] Examples show rule-year metadata and the success/error envelope.
- [ ] Examples state that outputs are unrounded and that display formatting belongs to callers.
- [ ] Examples state the no-backend/no-fetch/no-storage boundary.
- [ ] Documentation uses RentenWiki.de public naming and avoids introducing new public "Rentenrechner" copy.
- [ ] Executable examples are implemented as an `api.examples.test.ts` style test table, and docs link/reference that tested example set.

## Blocked by

- .scratch/pure-frontend-api/issues/03-tax-api-core-primitives.md
- .scratch/pure-frontend-api/issues/04-tax-api-salary-payroll.md
- .scratch/pure-frontend-api/issues/06-tax-api-retirement-phase-and-tax-mode-diagnostics.md
- .scratch/pure-frontend-api/issues/07-comparison-api-summary-tracer-bullet.md
