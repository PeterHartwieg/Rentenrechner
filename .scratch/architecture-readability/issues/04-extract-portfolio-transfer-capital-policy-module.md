# Extract portfolio transfer and capital-policy Module

Status: needs-triage

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract transfer event collection, surrender-tax handling, and instance capital-policy construction from the portfolio adapter into a focused Module. The portfolio adapter should call this Module rather than owning transfer and capital-policy details inline.

This slice should preserve paid-up, surrender, partial transfer, and residual-capital behavior.

## Acceptance criteria

- [ ] Transfer event collection and validation are isolated from portfolio orchestration.
- [ ] Capital-policy construction is isolated from portfolio orchestration.
- [ ] Transfer/capital helper ownership is explicit: transfer collection, event-year to contract-year conversion, instance lookup by ID, surrender-tax handling, and instance capital-policy construction belong to this slice.
- [ ] Shared transfer-event key behavior is reused from the neutral helper introduced during issue 08.
- [ ] Surrender-tax behavior is preserved.
- [ ] Partial transfers leave the source instance in the portfolio with residual capital behavior unchanged.
- [ ] Focused tests cover paid-up, surrendered, full-transfer, partial-transfer, and residual-capital cases.
- [ ] Existing portfolio adapter and contract-decision tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/03-extract-portfolio-projection-module.md
- .scratch/architecture-readability/issues/08-split-storage-migration-validation-persistence.md
