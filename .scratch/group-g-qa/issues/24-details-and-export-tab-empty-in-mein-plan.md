---
title: "\"Details\" and \"Export\" tabs are almost empty in Mein Plan mode"
Status: done
Area: Group G / combine mode / details + export
---

## Description

In Mein Plan (combine) mode the Details and Export tabs render very little content compared to Vergleich mode. The detailed per-product breakdowns, cashflow tables, and exportable artifacts that exist in compare mode are missing or stubbed when the user is viewing their actual portfolio.

## Expected

Details and Export in combine mode should be at least at parity with compare mode:

- **Details**: per-instance breakdowns for every product instance in the workspace — accumulation rows, payout schedule, fee drag, tax/KV-PV cascade — sourced from `simulatePortfolio` output (one block per instance, not one per product type).
- **Export**: PDF/print and CSV reflect the **portfolio** the user actually entered, including all instances, the disclaimer banner at the top, and combine-mode dashboard figures.

## Notes

This is the follow-on of #11 (BLOCKER: combine mode renders/exports singleton data). #11 stopped exports from showing wrong data; this issue is about filling the now-empty surfaces with the right combine-mode content.

Likely work:
- Adapt `PrintReport` and `buildExportCsv` to accept a `PortfolioResult` and emit per-instance sections.
- Render the cashflows / details panels against `portfolioResult` instead of singleton simulation in combine mode.
- Keep the disclaimer-first invariant (must remain literal first child of `#print-report` and first section of CSV output — see CLAUDE.md "Critical guardrails" #1).

See `src/App.tsx` (combine-mode branch around the details/export tabs), `src/app/useDerivedViews.ts` (CSV composition), and `src/utils/csvExport.ts`.

## Resolution (QA round 3 — branch qa-r3-issue-24)

Verified against commit `c815009`. All three surfaces are fully implemented and at parity with
compare mode:

### Details tab
`App.tsx` (lines 444–547) branches on `isCombineMode` and renders `CombineDetailView` with:
- `perInstance` from `useCombineSimulation`
- `combinedForScenario` (back-allocated tax/KV-PV from the aggregate pipeline)
- Export + print handlers wired

Regression tests in `src/features/results/CombineDetailView.test.tsx` cover:
- One row per active/paid_up instance, including multiple instances of the same product type
- Surrendered instances skipped
- `byInstance.monthlyNet` rendered (not per-instance fallback) when `combinedForScenario` provided
- Empty state, provenance markers, tooltip tax/KV-PV cascade

Covered by commits: `090d0a0` (#28) and `7448055` (#28 P1 follow-up).

### CSV export
`useDerivedViews.ts` `handleExportCsv` routes to `buildCombinePortfolioCsv` when
`options.combineMode && options.combine`. After QA round-3 round-2 (this branch),
`buildCombinePortfolioCsv` emits five sections at parity with compare-mode CSV depth:
- Section 0: Disclaimer (identical DISCLAIMER_LINES as compare-mode export) — literal first block, publication-blocking invariant maintained
- Section 1: Combined retirement income per scenario
- Section 2: Per-instance detail keyed by `instanceId`
- Section 3: **Jahres-Cashflows je Instanz** — per-instance, per-year rows (Alter, Nettoaufwand, Beitrag, AG-Anteil, Gebühren, Kum. Gebühren, Kapital, Reales Kapital). After-tax capital columns are intentionally omitted (combine bundle does not carry per-instance `bavTaxMode`/`insuranceTaxMode`); follow-up.
- Section 4: **Rentenphase (ETF-Entnahme) je ETF-Instanz** — per-ETF, per-year payout schedule rows. Conditionally omitted when no ETF instance has payout rows.

Regression tests in `src/utils/csvExport.test.ts` and `src/app/useDerivedViews.test.ts` pin
disclaimer-first invariant (also in two-instance workspace), combined income section,
per-instance section, instance labels, Section 3 column set + per-instance rows, Section 4
conditional emission + payout rows.

### PDF/print
`PrintReport` receives `combineMode`, `portfolio`, `combineProfile`, `combineGrv`,
`combineReturnScenarios`, `combineWorkspace` from `App.tsx`. When `combineMode && portfolio`,
`CombinePrintReport` is rendered with:
- Disclaimer as **literal first child** of `#print-report` — publication-blocking invariant maintained
- Per-instance table with workspace-sourced user labels (not generic engine labels)
- Combined income table ordered by workspace scenario list

Regression tests in `src/features/results/PrintReport.test.tsx` cover all of the above plus
workspace-vs-singleton profile/GRV/scenario ordering divergence (#27).

### Verdict
Round-1 (this branch initial commit): Details tab + PDF/print already covered by #27 + #28
commits; regression tests already in place. CSV emitted only 3 sections vs compare-mode's 5,
flagged as a depth gap by the round-1 reviewer.

Round-2 (this branch): added Section 3 (per-instance Jahres-Cashflows) and Section 4
(per-ETF-instance payout schedule) to `buildCombinePortfolioCsv` + 7 new regression tests.
Apologetic TODO comment removed.

`npm run verify` green: 1243 tests pass, lint clean, build succeeds.
