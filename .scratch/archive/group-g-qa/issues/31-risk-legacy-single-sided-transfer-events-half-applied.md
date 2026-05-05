---
title: "RISK: Legacy single-sided transfer events are half-applied (data-migration risk)"
Status: done
Severity: risk
Area: Group G / portfolioAdapter / migration
---

## Description

The transfer collector routes by where the event is stored: source array means outbound only, target array means inbound only ([portfolioAdapter.ts:951](src/engine/portfolioAdapter.ts), [portfolioAdapter.ts:978](src/engine/portfolioAdapter.ts)). The comment acknowledges single-sided data produces "one outbound and zero inbound" or vice versa ([portfolioAdapter.ts:960](src/engine/portfolioAdapter.ts)).

Test prose claims equivalence to "stored only on the source" ([portfolioAdapter.test.ts:2118](src/engine/portfolioAdapter.test.ts)), while the actual fixture stores the same event on both source and target ([portfolioAdapter.test.ts:2154](src/engine/portfolioAdapter.test.ts)). The test does not exercise the single-sided legacy path it claims to.

## Impact

A source-only legacy event withdraws capital without injecting it into the target; a target-only legacy event injects capital without removing it from the source. This is a **data-migration risk, not a new-data risk** — new workspaces always store events on both sides.

Scenario surfaced by: Karin surrender/reinvest or Riester-to-AVD transfer workspaces saved during a previous implementation round.

## Fix direction

1. Tighten the test fixture to actually be single-sided (only source array, then only target array) and assert the resulting financial behavior — currently the test passes for the wrong reason.
2. Decide migration policy for legacy single-sided events:
   - Backfill the missing side at load time (via `migrateAndValidateState`), or
   - Detect and surface a workspace warning, or
   - Document as "legacy data, results may be off" if no users could have produced this state.
3. Update prose to match whatever the test actually exercises.

## Notes

Follow-on of #16. #16 was the architectural fix; this is the remaining migration-correctness gap.
