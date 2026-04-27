# Rentenrechner Backlog

This file tracks what still matters for accuracy, usability, and future publishing. Completed audit items are intentionally short; implementation detail belongs in code and tests.

Legal/rules research lives in `LEGAL_REVIEW.md`.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

1. `#38` Law-based private-insurance tax modes.
2. `#6` Remaining bAV retirement refinements (KVdR toggle, lump-sum payout mode).

---

## Open P1 Accuracy

### #6 bAV Retirement Phase Detail (remaining)

Marginal-tax calculation with other retirement income is implemented. Still open:

- KVdR vs voluntary GKV toggle.
- Lump-sum vs pension payout mode.
- Visible GKV/PV contribution base.

### #38 Law-Based Private Insurance Tax Modes

Current private insurance still uses a simplified `normal` / `steuerfrei` model.

Target:
- Add contract start date.
- Add payout age and runtime.
- Distinguish pre-2005 tax-free contracts.
- Model post-2004 rules under EStG §20.
- Model age-62 / 12-year half-income treatment where eligible.
- Keep simple mode as a convenience layer.

Done when:
- Tax treatment is derived from contract fields instead of a blind toggle.
- Half-income method uses personal income-tax logic, not ETF-style Abgeltungsteuer.
- The simple mode clearly states what it assumes.

Likely files: `src/domain/types.ts`, `src/data/defaultScenario.ts`, `src/engine/simulate.ts`, `src/engine/projections.ts`, `src/App.tsx`, `LEGAL_REVIEW.md`.

---

## Open P2 Publishing / Product

### #13 CSV Export

Export:
- summary comparison
- yearly cashflows
- ETF payout rows where available

### #14 Shareable Scenario URL

Serialize assumptions into a compressed query parameter.

### #15 PDF Report

Generate a readable comparison report for offline review.

### #16 Input Presets

Add presets:
- low-cost ETF only
- standard bAV minimum employer subsidy
- generous employer bAV match
- high-cost private insurance
- old-contract insurance

---

## Open P3 Expansion

- Riester.
- Rürup.
- statutory pension module.
- Monte Carlo simulation.
- salary growth and contribution escalation.
- multi-ETF portfolio.
- bilingual UI.
- public deployment.

---

## Remaining Test Gaps

- `calculateSolidarityTax`: Milderungszone transition near `incomeTax = 20,350`.
- `calculateCapitalGainsTax`: all partial-exemption values from InvStG §20.
- `calculateBavFunding`: SV-savings cap near the 4% BBG threshold.
- `calculateBavFunding`: tax-free overflow above 8% BBG.
- Default-profile end-to-end snapshot for each product x scenario:
  - `capitalAtRetirement`
  - `afterTaxLumpSum`
  - `netMonthlyPayout`

---

## Done

- `#1` Initial BMF PAP 2026 Vorsorgepauschale helper and salary tests.
- `#2` Yearly cashflow audit table.
- `#3` Visible calculation warnings panel.
- `#4` bAV contribution-limit handling for total contribution.
- `#5` GRV-Minderung estimate: toggle subtracts estimated statutory-pension loss (EP/year × years × Rentenwert) from bAV net payout.
- `#7` ETF Vorabpauschale and annual Sparerpauschbetrag model.
- `#9` bAV tax/SV waterfall panel.
- `#10` Fee drag stacked bar chart: capital n. St. (product color) + Gebühren gesamt (red) per scenario.
- `#11` localStorage persistence with reset.
- `#12` Regelwerte & Quellen 2026 drawer: all rule values with source links (EStG, SGB, InvStG, BBG).
- `#17` GKV Zusatzbeitrag default updated to 2.9%.
- `#18` bAV retirement PV/KV cliff initially fixed, later corrected by `#32`.
- `#19` bAV lump-sum after-tax hidden until exact 1/120 handling exists.
- `#20` ETF saver allowance no longer applied to lump-sum exit tax.
- `#21` Explicit private-insurance `steuerfrei` branch.
- `#22` Care-insurance child-rate helper.
- `#23` 2026 top-tax boundary corrected to 277,826 EUR.
- `#24` KV Versorgungsbezüge Freibetrag renamed and documented.
- `#26` Editable retirement end age.
- `#27` ETF partial-exemption selector.
- `#28` Private-insurance tax-mode explanation.
- `#29` Removed dead private-contribution defaults.
- `#30` Age and retirement-age input clamping.
- `#31` 2026 InvStG Basiszins updated to 3.20%.
- `#32` bAV retirement KV/PV base corrected: KV Freibetrag, PV Freigrenze.
- `#33` §39b EStG 2026 Vorsorgepauschale reworked.
- `#34` bAV employer subsidy and contribution-limit fixed-point loop.
- `#35` Profile inputs wired: children and GKV/PKV; church tax marked unsupported.
- `#36` ETF Vorabpauschale acquisition-year timing improved.
- `#37` ETF withdrawal tax-basis tracking through payout phase.
- `#39` bAV entitlement, minimum, tariff-agreement warnings.
- `#40` Hardened localStorage parser and state schema tests.
- `#6 (partial)` Marginal-tax bAV payout: `netBavPayout` uses total(bAV + other) − total(other); `monthlyOtherRetirementIncome` input added. KVdR/lump-sum still open.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
