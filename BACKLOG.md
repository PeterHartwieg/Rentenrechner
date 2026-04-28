# Rentenrechner Backlog

This file tracks remaining work for accuracy, usability, and future publishing. Completed work is intentionally compact; implementation detail belongs in code, tests, and research notes.

Legal/rules research lives in `LEGAL_REVIEW.md`. Product-specific research lives in `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, and `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

Work in this order. Each group touches overlapping code paths or creates prerequisites for later groups.

1. **Foundation: retirement math and correctness**: `#44`, `#45`, `#46` — done.
2. **Baseline retirement income**: `#72` — done. Next: salary growth + GRV indexation extension.
3. **Schicht-1 product layer**: `#61` — done.
4. **Certified old/new private provision layer**: `#66`, `#62`, then `#67`-`#71`.
5. **Investment allocation mechanics**: `#69` plus the useful slice of P3 "multi-ETF portfolio" needed for Standarddepot/glidepath modeling.
6. **Private-insurance lifecycle**: `#65`.
7. **Scenario UX and exports**: `#16`, then the useful slice of P3 "saved scenario library and scenario duplication", then `#15`.
8. **Later analytical/publishing work**: Monte Carlo, sensitivity heatmap, real estate, cash/bond buffer, bilingual UI, public deployment.

---

## Implementation Groups And Order

### Group A: Foundation / Shared Calculation Plumbing

Items: `#44`, `#45`, `#46`

Why together:

- All three touch the central simulation and payout/tax foundations.
- `#46` is a prerequisite for statutory pension, Basisrente, Riester, and Altersvorsorgedepot payout modeling.
- `#44` and `#45` are small correctness fixes that reduce noise before larger product work changes snapshots and golden values.

Suggested order:

1. `#44` private-insurance calendar-year runtime.
2. `#45` negative / fee-drag payout returns.
3. `#46` retirement taxable-income pipeline.

Shared code areas: `src/engine/projections.ts`, `src/engine/retirementTax.ts`, `src/engine/simulate.ts`, product result types, tests, CSV/audit outputs.

### Group B: Baseline Income / Retirement Gap

Items: `#72`, small slice of P3 salary growth / contribution escalation

Why together:

- Statutory pension needs future salary/contribution-year assumptions; adding the smallest salary-growth input here avoids revisiting the GRV module immediately.
- The retirement-gap UI should treat statutory pension as a baseline income source, not as a product competing with ETF/bAV/insurance.

Suggested order:

1. Manual Renteninformation override first.
2. Simple GRV projection second.
3. Minimal salary-growth assumption only if needed by the GRV projection.
4. Retirement-gap display.

Shared code areas: new pension source types, `src/domain/types.ts`, `src/engine/retirementTax.ts`, `src/engine/simulate.ts`, `src/App.tsx`, CSV/audit outputs.

### Group C: Schicht-1 Layer

Items: `#61`

Why after Group B:

- Basisrente uses the same Sec. 22 cohort taxation concepts as statutory pension.
- Its contribution deduction cap depends on statutory pension / professional-pension contributions.
- The UI needs the baseline-income mental model before adding another locked lifelong pension layer.

Shared code areas: contribution tax-benefit calculation, retirement taxable-income pipeline, product assumptions UI, product comparison table.

### Group D: Certified Private Provision, Old Riester To 2027 Transition

Items: `#66`, `#62`, `#67`, `#68`, `#70`, `#71`

Why together:

- Riester and Altersvorsorgedepot share the certified-contract frame: allowances, Sec. 10a Guenstigerpruefung, Sec. 22 Nr. 5 payout taxation, lock-up, paid-up state, and transfer rules.
- `#66` must happen before hard-coding 2027 values.
- `#62` is useful before the Altersvorsorgedepot because transfer/transition comparisons need an old Riester baseline.

Suggested order:

1. `#66` verify final law / update research constants.
2. `#62` legacy Riester model.
3. `#67` Altersvorsorgedepot product shell/type.
4. `#68` 2027 subsidies and Guenstigerpruefung.
5. `#70` payout constraints and Sec. 22 Nr. 5 taxation.
6. `#71` transfers, transition, paid-up state.

Shared code areas: rules modules, allowance helpers, certified-product types, retirement taxable-income pipeline, storage/schema migration, assumptions UI.

### Group E: Investment Allocation Mechanics

Items: `#69`, useful slice of P3 multi-ETF portfolio

Why after the product shell:

- Standarddepot needs allocation/glidepath logic rather than a single annual return.
- A limited multi-sleeve portfolio engine can serve both Standarddepot and later ordinary multi-ETF portfolios.

Suggested order:

1. Implement generic two-sleeve accumulation support for risk/low-risk allocation.
2. Add Standarddepot glidepath and SRI/cost-cap warnings.
3. Generalize only as far as needed for ordinary multi-ETF portfolios later.

Shared code areas: accumulation engine, return scenarios, fee/RIY helpers, product assumptions UI, charts.

### Group F: Schicht-3 Private Insurance Lifecycle

Items: `#65`

Why separate:

- Paid-up/surrender logic is product-lifecycle work for Schicht-3 insurance and should not complicate the certified-product transfer model.
- It can reuse fee, accumulation, and comparison plumbing after the larger pension-source work is stable.

Shared code areas: private-insurance assumptions, accumulation engine, yearly cashflows, comparison UI.

### Group G: Scenario UX, Saved Workflows, Reports

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

### Group H: Later Expansion

Items: remaining P3 work

Suggested order:

1. Sensitivity heatmap after deterministic products are stable.
2. Monte Carlo after accumulation/payout abstractions settle.
3. Retirement cash / bond buffer after withdrawal planning is clearer.
4. Real estate / owner-occupied housing as a separate household-balance-sheet module.
5. Bilingual UI and public deployment last.

---

## Open P1 Product Scope

### #72 Add Statutory / Mandatory Pension Baseline — DONE

Implemented in `src/engine/grv.ts` (`projectStatutoryPension`), wired into `SimulationResult.statutoryPension`. Two modes: EP-based estimate (currentEntgeltpunkte from Renteninformation) and manual override. Tax via `calculateRetirementTax` (§22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil). KV/PV via `calculateRetirementKvPv` (§249a SGB V half-rate, KVdR). bAV GRV-Minderung subtracted when `includeGrvReduction = true`. UI: GRV section in input sidebar + "GRV Nettorente" metric in summary + GRV bar in pension chart. 8 new tests (283 total).

Remaining gaps (deferred): Versorgungswerk / Beamtenpension variants; salary-growth assumption; Rentenwert indexation; freiwillig-versichert KV path; explicit retirement-gap target input.

### #61 Add Basisrente / Ruerup Product Model — DONE

Implemented in `src/engine/basisrente.ts` (`calculateBasisrenteFunding`, `netBasisrentePayout`), wired into `SimulationResult.products` as productId `'basisrente'` and `SimulationResult.basisrenteFunding`. Schicht-1 cap: §10 Abs. 3 EStG 30,826 EUR (2026); GRV employee + employer counted against cap. Tax: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil (same cohort table as GRV). KV/PV: §240 SGB V freiwillig path (full rate, no Freibetrag). `afterTaxLumpSum = null` (no capital payout). Illiquidity warnings in UI. 11 new tests (294 total).

Remaining gaps (deferred): KVdR-specific §226 SGB V path for employed Rürup holders; freiwillig-GKV combined income cap interaction with GRV; Zeitrente payout mode UI toggle (engine supports it, UI defaults to Leibrente); professional-pension-scheme contributions reducing Schicht-1 cap.

### #62 Add Legacy Riester / Certified Altersvorsorgevertrag Model

Riester is not represented by Schicht-3 private insurance. First scope this to legacy / pre-2027 contracts so users can model keep, pause, transfer, or switch decisions after the 2027 reform.

Required changes:

- Add a `riester` product/subtype.
- Model 2026 old-law values:
  - 175 EUR Grundzulage,
  - 185 EUR child allowance for pre-2008 children,
  - 300 EUR child allowance for post-2007 children,
  - one-time 200 EUR career-starter bonus when eligible before age 25,
  - 4% minimum own contribution based on prior-year relevant income,
  - 2,100 EUR cap including allowances,
  - 60 EUR Sockelbetrag.
- Add allowance proration when the minimum own contribution is not met.
- Add Sec. 10a special-expense deduction / Guenstigerpruefung.
- Payout:
  - tax benefits fully under Sec. 22 Nr. 5 EStG,
  - allow partial capital payout up to 30% at start,
  - model remaining lifelong income separately from free ETF drawdown.
- Link to 2027 transition work:
  - existing Riester contracts continue,
  - no new old-model Riester contracts from 2027 under the researched reform state,
  - voluntary transition / transfer to a new certified product is not ordinary surrender.

Acceptance: users can compare an existing Riester contract against pausing it or later transferring into the new Altersvorsorgedepot regime.

### #65 Add Surrender / Paid-Up Scenario For Private Insurance

Private Rentenversicherung contracts are often terminated, reduced, or made paid-up before retirement. The current model assumes contributions continue unchanged to retirement.

Required changes:

- Add an optional scenario where contributions stop at a user-selected age.
- Continue applying ongoing asset / wrapper fees after paid-up status if applicable.
- Allow a surrender-value haircut or `Stornoabschlag` input.
- Show projected surrender value, paid-up retirement value, sunk fees, and comparison with continuing the contract / ETF alternative.
- Keep Basisrente separate: ordinary free surrender should not be available for Basisrente.

Acceptance: a user can model "stop paying at age 45" for Schicht-3 private insurance and see both paid-up retirement value and immediate surrender value assumptions.

---

## Open P1 Altersvorsorgedepot 2027

### #66 Track Final Legal Status Before Coding 2027 Constants

`ALTERSVORSORGEDEPOT_2027_RESEARCH.md` is based on the Bundestag-adopted / Bundesrat Drucksache 206/26 state as of 2026-04-28. Re-check the final BGBl. version before implementing hard-coded 2027 constants.

Required checks:

- subsidy tiers,
- 6,840 EUR annual contribution limit,
- 1,800 EUR Sec. 10a own-contribution deduction band,
- 120 EUR minimum contribution,
- child allowance formula,
- Standarddepot cost cap,
- payout constraints,
- transfer-cost rules.

Acceptance: no 2027 Altersvorsorgedepot calculation runs from unverified draft constants once the law has been promulgated.

### #67 Add Altersvorsorgedepot Product Type

The new product is a certified, locked, tax-subsidized old-age contract. It should not be modeled as normal ETF, Schicht-3 insurance, or old Riester.

Required changes:

- Add product id `altersvorsorgedepot`.
- Add subtypes:
  - `depot_no_guarantee`,
  - `standarddepot`,
  - `guarantee_80`,
  - `guarantee_100`.
- Reuse ETF accumulation math only inside the certified wrapper after disabling normal taxable ETF events.
- Label the lock-up explicitly, e.g. `Altersvorsorgedepot (gefoerdert, 2027)`.
- Link assumptions to `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`.

Acceptance: ETF depot vs. Altersvorsorgedepot show different tax, subsidy, and payout treatment even with identical expected-return assets.

### #68 Model 2027 Subsidies And Guenstigerpruefung

The old Riester formula is not correct for the 2027 product.

Required changes:

- Add 2027 allowance formula:
  - 50% of own contributions up to 360 EUR/year,
  - 25% of own contributions from 360.01 EUR to 1,800 EUR/year,
  - max 540 EUR/year direct basic allowance,
  - 200 EUR one-time career-starter bonus when directly eligible and under 25,
  - child allowance = 100% of own contribution, max 300 EUR/year per eligible child,
  - 120 EUR/year minimum own contribution.
- Add indirect spouse handling with max 175 EUR basic allowance.
- Add eligibility inputs for direct, indirect, self-employed, professional-pension-scheme, and child-allowance cases.
- Add Sec. 10a Guenstigerpruefung:
  - deductible base = `min(ownContribution, 1800) + allowanceEntitlement`,
  - tax saving above the allowance is the extra tax refund,
  - contributions above 1,800 EUR can enter the contract up to 6,840 EUR/year but do not increase allowance or Sec. 10a deduction.

Acceptance: 1,800 EUR/year own contribution produces 540 EUR direct basic allowance before child / career-starter additions, while 6,840 EUR/year does not produce extra allowance.

### #69 Add Investment Scope, Standarddepot Glidepath, And Cost Cap

The product is not an unrestricted brokerage account. Certified investment options and Standarddepot mechanics affect return, risk, and cost assumptions.

Required changes:

- Add assumptions for risk asset return/fee, low-risk asset return/fee, allocation, provider default allocation, and fund SRI bucket.
- Validate / warn that certified fund assumptions stay within researched SRI classes.
- Add Standarddepot glidepath:
  - five years before payout: high-risk bucket max 50%,
  - two years before payout and at payout start: high-risk bucket max 30%,
  - user override where contract permits.
- Add warning / validation for the Standarddepot 1.0 percentage point Effektivkosten cap.

Acceptance: Standarddepot projection uses a de-risking path instead of one constant ETF return.

### #70 Model Payout Constraints And Sec. 22 Nr. 5 Taxation

The payout phase is not normal ETF drawdown and not private-insurance Ertragsanteil taxation.

Required changes:

- Validate payout start:
  - normally not before age 65,
  - early start only if earlier statutory/basic pension starts,
  - not first after age 70.
- Add payout modes:
  - full lifelong annuity,
  - 80% lifelong annuity plus variable lifelong payment sleeve,
  - certified payout plan ending no earlier than age 85,
  - up to 30% partial capital plus one of the monthly modes.
- For payout plan mode, use certified recalculation logic instead of generic ETF depletion.
- Tax funded benefits through Sec. 22 Nr. 5 as deferred-tax subsidized-private-pension income.
- Do not apply normal ETF Vorabpauschale, ETF partial exemption, or Schicht-3 capital-gain logic.
- Route KV/PV by retiree insurance mode; do not automatically apply bAV Versorgungsbezug treatment unless later guidance says so.

Acceptance: 30% partial capital plus payout plan to age 85 is taxed under Sec. 22 Nr. 5, while a normal ETF with identical assets remains taxed as ETF capital-gains income.

### #71 Model Transfers, Existing Riester Transition, And Paid-Up State

The reform keeps old Riester contracts alive and creates voluntary transition / transfer mechanics.

Required changes:

- Keep old Riester and new Altersvorsorgedepot as separate regimes.
- Add an "existing old Riester continues" scenario.
- Add optional "elect new law / transfer to new contract" scenario once final transitional rules are confirmed.
- Add transfer assumptions:
  - old provider cost max 150 EUR within first 5 years,
  - old provider transfer free after 5 years / same provider / certain cost-change cases,
  - new provider one-time admin fee max 150 EUR,
  - transferred subsidized capital cannot be used as base for new acquisition/distribution costs.
- Add paid-up / `ruhen lassen` state for certified products.
- Prevent modeling a free cash withdrawal as if it were an ordinary depot sale.

Acceptance: certified-product transfers apply transfer fees and preserve subsidized status instead of being treated as taxable ETF sales or free Schicht-3 surrender.

---

## Open P2 Publishing / Product

### #15 PDF Report

Generate a readable comparison report for offline review.

### #16 Input Presets

Add scenario presets:

- low-cost ETF only,
- standard bAV minimum employer subsidy,
- generous employer bAV match,
- high-cost private insurance,
- old-contract insurance,
- future: statutory pension + ETF + bAV + Altersvorsorgedepot.

---

## Open P3 Expansion

- Monte Carlo simulation.
- Salary growth and contribution escalation.
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
- Statutory pension (GRV) baseline: `#72`.
- Basisrente / Rürup (Schicht 1): `#61`.
- Documentation sync: `#53`.

Latest documented baseline: 294 tests after `#61`.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
