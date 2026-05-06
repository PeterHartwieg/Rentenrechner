# Tax API salary and payroll

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Expose salary/payroll operations through the Tax Engine API. This slice covers employee social contributions, the BMF PAP salary result, Vorsorgepauschale, public/private health-insurance handling, and PKV employer subsidy. It is separate from the statutory primitives ticket because this path has more inputs, more diagnostics, and stronger parity requirements against external payroll goldens.

## Acceptance criteria

- [ ] API exposes salary/payroll calculation from a personal profile.
- [ ] Salary response includes annual gross, annual net, taxable income, income tax, solidarity surcharge, social-contribution breakdown, Vorsorgepauschale, and PKV fields where applicable.
- [ ] API exposes employee social-contribution calculation directly or as a clearly documented sub-result of salary/payroll.
- [ ] API exposes PKV employer subsidy calculation directly or as a clearly documented sub-result of salary/payroll.
- [ ] Public request/response DTOs are owned by the API layer and do not re-export internal `SalaryResult` or other internal result types, even if v1 fields are structurally identical.
- [ ] Invalid profile and health-insurance inputs return structured validation errors.
- [ ] Output is JSON-serializable and unrounded beyond statutory rounding already performed by the engine.
- [ ] Tests assert parity with existing salary/payroll golden and unit-test expectations, including GKV, child PV discount, and PKV cases.

## Blocked by

- .scratch/pure-frontend-api/issues/01-api-envelope-manifest-and-rule-resolution.md
- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
