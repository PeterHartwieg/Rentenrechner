# Tax API retirement phase and tax-mode diagnostics

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Expose retirement-phase tax, retirement KV/PV, monthly payout routing, and tax-mode diagnostics through the Tax Engine API. This slice makes the retirement tax pipeline usable without running a full comparison.

The public contract should accept explicit income/source components, not UI product forms, and return detailed statutory breakdowns. Product-specific diagnostic helpers should explain private-insurance tax mode and bAV lump-sum routing without duplicating legal logic.

## Acceptance criteria

- [ ] API exposes retirement tax over explicit income components and returns the existing detailed tax breakdown.
- [ ] API exposes retirement KV/PV over explicit monthly source channels and returns BBG-aware per-source deductions.
- [ ] API exposes monthly retirement payout routing for supported tax/KV/PV channels where the existing engine primitive supports it.
- [ ] API exposes private-insurance tax mode diagnostics from contract start year, runtime, retirement age, payout mode, and legacy eligibility.
- [ ] API exposes bAV lump-sum tax mode diagnostics from Durchfuehrungsweg and pre-2005 eligibility.
- [ ] Public request/response DTOs are owned by the API layer and do not re-export internal retirement-tax, KV/PV, or payout result types, even if v1 fields are structurally identical.
- [ ] API responses include rule-year metadata, exact numeric output, warnings, and structured validation errors.
- [ ] Operations reuse existing retirement tax, retirement payout, insurance payout, and bAV payout modules.
- [ ] Tests cover parity with existing retirement-tax, retirement-KV/PV, private-insurance, and bAV routing tests.

## Blocked by

- .scratch/pure-frontend-api/issues/01-api-envelope-manifest-and-rule-resolution.md
- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
