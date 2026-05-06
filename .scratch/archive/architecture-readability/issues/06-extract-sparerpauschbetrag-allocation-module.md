# Extract Sparerpauschbetrag allocation Module

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract cross-instance Sparerpauschbetrag allocation and ETF re-run behavior from the portfolio adapter into a focused Module. The Module should own allowance demand, apportionment, and the resulting ETF instance recalculation.

This slice should preserve current ETF net result behavior while making allowance logic independently testable.

## Acceptance criteria

- [x] Sparerpauschbetrag allocation no longer lives inline in the portfolio adapter.
- [x] Allowance helper ownership is explicit: allowance demand calculation, cross-instance allowance apportionment, and ETF re-run orchestration belong to this slice.
- [x] Multi-ETF allowance demand and apportionment behavior is preserved.
- [x] Allowance-exhaustion behavior is preserved.
- [x] ETF re-run trigger behavior is preserved, including only re-running ETF instances when allowance demand exceeds available allowance.
- [x] ETF instance re-run behavior remains unchanged from the user's perspective.
- [x] Focused tests cover one ETF, multiple ETFs, unused allowance, and exhausted allowance cases.
- [x] Existing portfolio adapter and ETF tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/03-extract-portfolio-projection-module.md
