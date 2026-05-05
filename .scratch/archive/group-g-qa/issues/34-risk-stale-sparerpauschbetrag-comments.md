---
title: "RISK: Stale Sparerpauschbetrag architecture comments will mislead future agents"
Status: done
Severity: risk
Area: Group G / engine / documentation
---

## Description

`portfolioCombine.ts` still says cross-instance Sparerpauschbetrag is not shared and is deferred to issue 15 ([portfolioCombine.ts:47](src/engine/portfolioCombine.ts)). That no longer matches the adapter, which now applies cross-instance saver allowance before combining.

The top comment in `portfolioAdapter.test.ts` also lists a Sparerpauschbetrag `it.skip` ([portfolioAdapter.test.ts:11](src/engine/portfolioAdapter.test.ts)), while the only actual skip in the file is the P2 what-if rebase stub ([portfolioAdapter.test.ts:626](src/engine/portfolioAdapter.test.ts)).

## Impact

Not runtime-breaking. But stale architecture comments in this codebase are unusually costly because agents (Claude, contributors) rely on them heavily as the canonical map of where invariants live. The next agent touching ETF taxation will read these and either re-implement existing logic, defer work that's already done, or distrust the working code.

## Fix direction

- Update the comment in `portfolioCombine.ts:47` to describe the **current** behavior: cross-instance Sparerpauschbetrag is applied at the adapter layer before combine. Point to the relevant adapter function.
- Remove the skip-list reference at `portfolioAdapter.test.ts:11` for Sparerpauschbetrag, leave only the P2 rebase entry.
- One-pass grep for any other `// TODO #17` / Sparerpauschbetrag deferral comments that survived the fix.

## Notes

Follow-on of #17 (which fixed the runtime side). This is purely a documentation/correctness debt cleanup.
