# Tax API salary-phase funding operations

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Expose salary-phase funding operations for the retirement products whose contribution economics depend on tax, social-security, caps, allowances, or inverse net-cost solving: bAV, Basisrente, Altersvorsorgedepot, and Riester.

Each operation should be usable independently from the full comparison simulation and should return enough diagnostics to explain cap usage, tax/SV savings, allowances, own contribution, gross contribution, and net monthly user cost.

Decision: standalone funding API operations call the individual pure helper functions directly. They do not go through `buildContext` or `BuildContextOverrides`; those stay orchestration tools for comparison/combine simulation.

Dependency note: this issue can run in parallel with the salary/payroll API if the funding DTOs own their own compact salary-context/diagnostic fields. It should only block on the salary/payroll ticket if issue 04 deliberately introduces shared public salary sub-DTOs that this ticket reuses.

## Acceptance criteria

- [ ] API exposes bAV funding, including tax/SV savings, employer subsidy, net cost, cap effects, salary-before/after views, and estimated GRV reduction.
- [ ] API exposes bAV gross-from-net solving for a target monthly Netto-Belastung.
- [ ] API exposes Basisrente funding and gross-from-net solving using salary-phase context.
- [ ] API exposes AVD allowance/funding and own-contribution-from-net solving, including cap diagnostics.
- [ ] API exposes Riester allowance/funding and own-contribution-from-net solving, including allowance and Guenstigerpruefung diagnostics.
- [ ] Funding operations call direct funding/solver helpers rather than `buildContext`.
- [ ] Public request/response DTOs are owned by the API layer and do not re-export internal funding result types, even if v1 fields are structurally identical.
- [ ] Operations use existing engine helpers and do not duplicate statutory constants or product funding logic.
- [ ] Invalid product assumptions and impossible targets return structured errors or warnings.
- [ ] Tests cover parity with existing funding/unit tests and representative cap-boundary behavior.

## Blocked by

- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
- Coordinate with .scratch/pure-frontend-api/issues/04-tax-api-salary-payroll.md only if shared public salary sub-DTOs are introduced there.
