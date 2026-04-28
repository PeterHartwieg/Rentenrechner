# Rentenrechner Backlog

This file tracks remaining work for accuracy, usability, and future publishing. Completed work is intentionally compact; implementation detail belongs in code, tests, and research notes.

Legal/rules research lives in `LEGAL_REVIEW.md`. Product-specific research lives in `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, and `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

**Active workstream: agent-readability refactor.** Before starting new feature additions, work through `AGENT_READABILITY_REFACTOR_PLAN.md`. The goal is to reduce `App.tsx`, split tests, localize product simulators/validators/types, and update docs so future feature work needs much less context.

Phases complete: 0–7 (lint/build baseline, UI primitives, app state hooks, JSX feature extraction, CSS co-location, test fixtures, product simulator registry, domain type split). Next: Phase 8 (discriminated product result unions).

After that refactor is complete, resume feature work in this order. Each group touches overlapping code paths or creates prerequisites for later groups.

1. **Scenario UX and exports**: `#16`, then the useful slice of P3 "saved scenario library and scenario duplication", then `#15`.
2. **Retirement-income refinements**: GRV salary growth / Rentenwert indexation, Versorgungswerk / Beamtenpension variants, and Basisrente edge cases.
3. **Later analytical/publishing work**: Monte Carlo, sensitivity heatmap, real estate, cash/bond buffer, bilingual UI, public deployment.

---

## Implementation Groups And Order

### Group B: Investment Allocation Mechanics

Items: `#69`, useful slice of P3 multi-ETF portfolio

Why after the product shell:

- Standarddepot needs allocation/glidepath logic rather than a single annual return.
- A limited multi-sleeve portfolio engine can serve both Standarddepot and later ordinary multi-ETF portfolios.

Suggested order:

1. Implement generic two-sleeve accumulation support for risk/low-risk allocation.
2. Add Standarddepot glidepath and SRI/cost-cap warnings.
3. Generalize only as far as needed for ordinary multi-ETF portfolios later.

Shared code areas: accumulation engine, return scenarios, fee/RIY helpers, product assumptions UI, charts.

### Group C: Schicht-3 Private Insurance Lifecycle

Items: `#65`

Why separate:

- Paid-up/surrender logic is product-lifecycle work for Schicht-3 insurance and should not complicate the certified-product transfer model.
- It can reuse fee, accumulation, and comparison plumbing after the larger pension-source work is stable.

Shared code areas: private-insurance assumptions, accumulation engine, yearly cashflows, comparison UI.

### Group D: Scenario UX, Saved Workflows, Reports

Items: `#16`, useful slice of P3 saved scenario library / duplication, `#15`

Why later:

- Presets and reports are most useful after the product set and retirement-gap model settle.
- Scenario duplication pairs naturally with presets because both touch scenario state and storage.
- PDF/report output should come after calculations and table outputs stop shifting heavily.

Suggested order:

1. `#16` presets for current stable product combinations.
2. Scenario duplication / saved scenario library.
3. `#15` PDF report.

Shared code areas: default scenarios, storage/schema, URL sharing, CSV/report formatting, UI controls.

### Group E: Retirement-Income Refinements

Items: P3 GRV / Basisrente refinements

Suggested order:

1. Salary growth and Rentenwert indexation for GRV.
2. Versorgungswerk / Beamtenpension variants.
3. Basisrente edge cases: professional-pension-scheme cap reduction, optional Zeitrente UI, and combined freiwillig-GKV cap interaction.

Shared code areas: `src/engine/grv.ts`, `src/engine/basisrente.ts`, retirement tax/KV-PV helpers, profile assumptions UI.

### Group F: Later Expansion

Items: remaining P3 work

Suggested order:

1. Sensitivity heatmap after deterministic products are stable.
2. Monte Carlo after accumulation/payout abstractions settle.
3. Retirement cash / bond buffer after withdrawal planning is clearer.
4. Real estate / owner-occupied housing as a separate household-balance-sheet module.
5. Bilingual UI and public deployment last.

---

## Open P2 Publishing / Product

### #15 PDF Report

Generate a readable comparison report for offline review.

---

## Open P3 Expansion

- Monte Carlo simulation.
- Salary growth, contribution escalation, and GRV Rentenwert indexation.
- Versorgungswerk / Beamtenpension baseline variants.
- Basisrente edge cases: professional-pension-scheme cap reduction, optional Zeitrente UI, and combined freiwillig-GKV cap interaction.
- Multi-ETF portfolio.
- Sensitivity heatmap.
- Saved scenario library and scenario duplication.
- Real estate / owner-occupied housing module.
- Retirement cash / bond buffer module.
- Bilingual UI.
- Public deployment.

---

## Implemented Archive

Completed items are kept here as a compact index only.

- Core calculation/UI: `#1`-`#7`, `#9`-`#14`, `#17`-`#24`, `#26`-`#40`.
- bAV / retirement tax / KV-PV: `#6`, `#19`, `#32`-`#35`, `#47`, `#48`, `#51`, `#52`, `#54`.
- Storage, URL, CSV, validation, build hygiene: `#13`, `#14`, `#40`-`#43`, `#49`.
- Insurance runtime / negative returns: `#44`, `#45`.
- Retirement tax pipeline: `#46`.
- PKV: `#50`.
- Fee model and diagnostics: `#55`-`#58`.
- Schicht-3 private insurance: `#38`, `#59`, `#60`, `#64`.
- Statutory pension (GRV) baseline: `#72`. Implemented in `src/engine/grv.ts` with manual Renteninformation override and EP-based estimate.
- Basisrente / Ruerup (Schicht 1): `#61`. Implemented in `src/engine/basisrente.ts`; productId `basisrente`.
- Documentation sync: `#53`.
- Altersvorsorgedepot 2027 (`#66`–`#71`): types, 2027 constants in `de2026.ts`, tiered allowances + Günstigerprüfung, Standarddepot glidepath, §22 Nr. 5 payout taxation, payout-age validation, transfer-cost inputs and cap constants. Engine in `src/engine/altersvorsorgedepot.ts`. `#71` Riester-to-AVD transition: `riesterTransferCapital` field on AVD assumptions, `initialCapital` in `projectAccumulation`, dynamic label "Riester-Übertrag" on the AVD product when transfer capital is set.
- Legacy Riester / Altvertrag (`#62`, `#71`): old-law 2026 constants in `de2026.ts`; engine in `src/engine/riester.ts` (§84–§86 EStG allowances, Mindesteigenbeitrag proration, §10a Günstigerprüfung, §22 Nr. 5 net payout, §93 Abs. 2 partial lump sum); productId `riester`; UI section in `src/App.tsx`; schema validation in `src/utils/scenarioSchema.ts`.

- Private insurance lifecycle: `#65` — surrender / paid-up scenario. `InsurancePaidUpScenario` on `ProductResult`; `paidUpAge?` + `surrenderHaircutPct` on `InsuranceAssumptions`; two-phase accumulation in `simulate.ts`; results panel in assumptions drawer. 383 tests (+10).
- Input presets: `#16` — 5 scenario presets in `src/data/presets.ts` (ETF Nettotarif, bAV Standard, bAV AG-Match 50 %, pAV Hochkosten, pAV Altvertrag). Collapsible `<details>` panel at top of input drawer replaces full assumptions on click.

Latest documented baseline: 383 tests after `#65`.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
