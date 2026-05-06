# Tax API statutory primitives

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Expose the first usable Tax Engine API operations through the shared front-end API envelope: income tax, solidarity surcharge, and capital gains tax.

This should be a complete public facade slice: request DTOs, validation, rule-year handling, response metadata, API-owned response DTOs, tests, and documentation examples for the operations in this slice. Salary/payroll is intentionally split into the next ticket because it has a larger BMF PAP/social-security surface.

## Acceptance criteria

- [ ] API exposes income-tax calculation with rule-year metadata and exact numeric output.
- [ ] API exposes solidarity surcharge calculation with filing-status input.
- [ ] API exposes capital-gains tax calculation with partial exemption and saver allowance inputs.
- [ ] Public request/response DTOs are owned by the API layer and do not re-export internal engine/domain types, even if v1 fields are structurally identical.
- [ ] Invalid inputs return structured validation errors rather than thrown errors.
- [ ] Output is JSON-serializable and unrounded beyond statutory rounding already performed by the engine.
- [ ] Tests assert parity with existing tax and capital-gains unit-test expectations.

## Blocked by

- .scratch/pure-frontend-api/issues/01-api-envelope-manifest-and-rule-resolution.md
- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
