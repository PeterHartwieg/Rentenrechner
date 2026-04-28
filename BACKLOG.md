# Rentenrechner Backlog

This file tracks what still matters for accuracy, usability, and future publishing. Completed audit items are intentionally short; implementation detail belongs in code and tests.

Legal/rules research lives in `LEGAL_REVIEW.md`.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

Wave 3 (P1, mostly independent — accuracy-first, no label-downgrade shortcuts):

1. `#54` Replace bAV/insurance capital-drawdown payout with Leibrente/Zeitrente — ✓ done.
2. `#49` Deep-validate share URL and localStorage state — ✓ done.
3. `#51` Separate statutory bAV subsidy from contractual employer match — ✓ done.
4. `#52` Model child-age eligibility for Pflegeversicherung — ✓ done.
5. `#50` Model PKV premiums (sequence after the others; integrates with the #46 retirement pipeline).
6. `#53` Synchronize project documentation — last, after Wave 3 lands.

---

## Open P0 Verification / Release Blockers

### #41 Restore Clean Build And Lint

Runtime tests currently pass, but the implementation is not in a clean shippable state:

- `npm run build` fails on an unused `ScenarioAssumptions` import in `src/engine/simulate.test.ts`.
- `npm run build` fails because `src/storage.test.ts` intentionally creates a partial `fees` object, but TypeScript still checks it as a full `BavAssumptions`.
- `npm run lint` fails on an irregular whitespace character in `src/App.tsx`.
- `npm run lint` fails on `no-useless-assignment` in `src/utils/csvExport.ts`.

Acceptance: `npm test`, `npm run build`, and `npm run lint` are all green.

---

## Open P1 Accuracy / Correctness

### #42 Correct bAV Minimum-Conversion Warning

The UI calculates the `§1a BetrAVG` minimum as `bezugsgroesseMonthly / 160`, which displays roughly `24.72 EUR/year`. The statutory minimum is `1/160` of the annual Bezugsgröße: with `3,955 EUR/month` in 2026, that is `296.63 EUR/year` or `24.72 EUR/month`.

Fix the sidebar warning and assumptions drawer so the annual and monthly labels are not off by a factor of 12. Add a boundary test for the warning helper once extracted.

### #43 Correct GRV-Reduction Estimate Around The RV BBG

The optional bAV GRV-reduction estimate currently uses the full salary-conversion amount for every salary. That overstates the loss when income is already above the RV/AV contribution ceiling, and it also ignores cases where only part of the conversion is SV-free.

Estimate lost pensionable earnings as:

```text
min(grossBefore, RV_BBG) - min(grossAfterSvFreeConversion, RV_BBG)
```

Then convert that lost base into Entgeltpunkte. Add tests for below-BBG, crossing-BBG, and fully-above-BBG salaries.

### #44 Derive Private-Insurance Runtime From Calendar Years

`deriveInsuranceTaxMode()` receives `retirementAge - age` as the contract runtime. That ignores `contractStartYear`; a contract started before or after the current rule year can be classified into the wrong `halbeinkuenfte` / `abgeltungsteuer` branch.

Use `payoutYear = rules.year + (retirementAge - age)` and `contractRuntimeYears = payoutYear - contractStartYear`. Also replace unconditional pre-2005 tax-free handling with explicit old-contract eligibility fields.

### #45 Allow Negative Or Fee-Drag Payout Returns

`simulate.ts` clamps payout return to `max(0, annualReturn - annualAssetFee)`. This overstates retirement income when product fees exceed returns or when the user enters a negative return scenario.

Let payout returns go negative where mathematically valid. Update `etfPayoutSchedule()` so its annual recurrence also supports negative returns instead of falling back to a `12x` withdrawal factor.

### #46 Add A Real Retirement-Taxable-Income Pipeline

bAV and private-insurance retirement tax helpers currently feed gross retirement income directly into `calculateIncomeTax2026()`. That treats gross payout as taxable income and does not model retirement deductions, income categories, pension allowances, health/care deductions, or other taxable income composition.

Add a dedicated retirement taxable-income helper before marking retirement-phase net values as decision-support grade.

### #49 Deep-Validate Share URL And localStorage State

The parser merges objects by shallow runtime type and accepts any non-empty saved array. A malformed or stale `returnScenarios` array, invalid age relation, non-finite number, extreme fee, or retirement end age before retirement can produce `NaN` calculations or misleading charts.

Add schema/range validation for persisted and URL state:

- finite numeric fields only
- age / retirement / end-age invariants
- fee and rate ranges
- exact return-scenario ids and array shape
- safe fallback to defaults for invalid nested data

### #50 Model PKV Premiums Before Treating PKV As Comparable

The PKV toggle currently removes GKV/PV payroll contributions but does not add private health/care premiums or employer subsidy logic. This can materially overstate net salary and distort the fair private-vs-bAV net-cost benchmark.

Add PKV/pPV premium inputs and employer-subsidy handling, or keep PKV mode visibly non-comparable until implemented.

### #51 Separate Statutory bAV Subsidy From Contractual Employer Match

The UI field `AG-Zuschuss Vertrag` starts from the statutory `15%`, but the engine caps the statutory part by actual employer SV savings. A user entering a contractual `15%` or `20%` match may reasonably expect that full percentage to be paid, while the current model may pay less when the statutory cap binds.

Expose separate controls and labels for:

- statutory minimum subsidy, computed and capped
- explicit employer match percentage
- explicit fixed monthly employer contribution
- effective employer contribution actually modeled

### #52 Model Child-Age Eligibility For Pflegeversicherung

The `children` count changes PV rates, but the model has no child ages or eligibility windows. The childless surcharge and child discounts do not depend only on the number of children in all cases.

Add child-age/eligibility inputs or downgrade the child-adjusted PV output to a clearly simplified assumption.

### #54 Model bAV And Private-Insurance As Leibrente / Zeitrente Instead Of Capital Drawdown

`simulate.ts` computes `payoutYears = retirementEndAge - retirementAge` and uses `monthlyPayoutFromCapital(capital, payoutReturn, payoutYears)` for **all three products** (ETF, bAV, private insurance). That is correct for ETF (the user controls the drawdown horizon) but materially wrong for bAV-Renten and pAV-Renten:

- A typical bAV pays a **Leibrente** (lifelong annuity, paid until death) priced via a contractual *Rentenfaktor* (e.g. 30 EUR per 10,000 EUR Kapital per month). Capital is consumed actuarially; the policyholder does not bear longevity risk.
- Some bAV products instead offer a **Zeitrente** (fixed-term annuity, e.g. 10/15/20 years) — closer to the current depletion model but still contractually fixed, not driven by `retirementEndAge`.
- Private annuity insurance follows the same pattern: a Rentenfaktor in the contract, often with a guarantee period.

Effects of the current simplification:
- `Kapitalverzehr bis` controls bAV/insurance payouts as if they were drawdown plans, even though the Rentenfaktor has nothing to do with the user's chosen end-age.
- bAV gross monthly payout fluctuates with `retirementEndAge`, when in reality it would be locked at retirement based on the contract.
- Comparison vs. ETF is biased by whichever payout horizon the user picks.

Required changes:
- `BavAssumptions`: add `payoutMode: 'leibrente' | 'zeitrente' | 'kapitalverzehr'`, `bavRentenfaktor: number` (EUR per 10k per month), and an optional `zeitrenteYears: number` for the fixed-term mode.
- `InsuranceAssumptions`: same shape, separate values (private contracts have their own Rentenfaktor).
- `simulate.ts` / `projections.ts`: when `payoutMode === 'leibrente'`, compute `grossMonthlyPayout = capital / 10_000 × rentenfaktor`; the calculator does not model actuarial payments past the user's end-age cap (assume payments continue indefinitely; show the per-month figure). When `'zeitrente'`, use `zeitrenteYears` instead of `payoutYears`. Only `'kapitalverzehr'` continues to use the current annuity formula.
- `Kapitalverzehr bis` UI label and tooltip: clarify that it only affects products in `kapitalverzehr` mode.
- Default scenarios: `bav.payoutMode = 'leibrente'`, `bavRentenfaktor` defaulting to the current market range (research a sensible 2026 default — typical bracket is 25–35 EUR/10k for unisex, age-67 starts).
- Tests: golden values shift materially; document.

Note: bAV products vary; not all guarantee Leibrente. Some have Wahlrechte (Rente vs. Kapital vs. Zeitrente). The data shape above lets the user pick the mode they're actually offered.

LEGAL_REVIEW.md: cite §1 BetrAVG (Leistungsformen), §1b BetrAVG (Anwartschaft), and reference the typical Versicherungsbedingungen language for Rentenfaktor + Garantierter Mindestrentenfaktor.

---

### #55 Split Insurance Wrapper Fees From Fund Fees

`FeeModel.annualAssetFee` currently combines all ongoing capital-based costs into one field called `Kapitalgebuehr`. The bAV fee research in `BAV_RESEARCH.md` shows that real offers usually split at least:

- wrapper / policy-value fee, e.g. 0.60-0.70% p.a. of policy value
- selected fund / ETF OGC or TER, e.g. 0.18-0.25% p.a. for low-cost funds, higher for active funds
- sometimes cost-surplus-adjusted values that differ from the maximum shown in PIB / IVI documents

The current single field makes it too easy to compare a bAV wrapper fee against an ETF TER incorrectly, or to forget fund costs entirely. It also makes source mapping in the assumptions drawer vague.

Required changes:

- Extend `FeeModel` with separate fields such as `wrapperAssetFee` and `fundAssetFee`, or keep `annualAssetFee` as a derived total and store the components separately.
- Update `projectAccumulation()` so the total annual fee drag is the sum of wrapper and fund fees, while the yearly fee table can show both components.
- Update defaults: current bAV `annualAssetFee: 0.005` should become something like wrapper 0.005 plus explicit low-cost fund 0.002, unless intentionally modeling an all-in value.
- Update UI labels: distinguish "Versicherungsmantel / Policenwert" from "Fonds / ETF-Kosten".
- Update CSV export and assumptions drawer to show both components and the all-in total.
- Add tests proving that wrapper + fund fee equals the previous all-in fee when configured equivalently.

Acceptance: user can enter the Allianz-style `0.60% wrapper + 0.18% fund` and AXA-style `0.70% wrapper + 0.25% fund` examples directly without mental addition.

### #56 Model Pension-Phase Fees For bAV And pAV

Accumulation fees are modeled, but pension-phase administration fees are not. `simulate.ts` computes a gross monthly Leibrente from `capital / 10_000 * rentenfaktor` and then passes it into tax/KV/PV helpers. Real offer examples in `BAV_RESEARCH.md` include pension-phase fees such as `1.75% je gezahlter Rente`.

This matters because:

- Leibrente products may quote a Rentenfaktor before or after certain administration costs; product documents differ.
- If the fee is applied to each paid pension, the net retirement income is overstated.
- `totalFees` currently covers only accumulation-phase fees, so the fee chart understates lifetime product cost.

Required changes:

- Add `pensionPayoutFeePct` to `FeeModel` or to annuity-specific assumptions.
- Decide convention: Rentenfaktor input should be gross before payout fee, unless the user marks it as already net of payout fees.
- For bAV and pAV monthly payout paths, subtract `grossMonthlyPayout * pensionPayoutFeePct` before income tax / KV/PV, or show it as a separate deduction line.
- For `afterTaxLumpSum`, do not apply pension payout fee unless the product document states a capital-payout fee.
- Add the fee to CSV / yearly retirement summary once retirement cashflows are expanded.

Acceptance: entering a `1.75%` pension payout fee reduces a `1,000 EUR` gross monthly annuity by `17.50 EUR` before the tax/KV/PV calculation, or clearly shows the same deduction after gross payout depending on chosen convention.

### #57 Add Effektivkosten / RIY Calculation And Display

The tool shows absolute `totalFees`, but users and bAV product sheets compare contracts via Effektivkosten / Reduction in Yield (RIY). `BAV_RESEARCH.md` includes examples ranging roughly from `0.8-1.0 pp` for better bAV examples to `1.3-1.7 pp` common offers and `2.0%+` warning territory.

Current gap:

- `projectAccumulation()` computes fees month-by-month, but the UI does not translate them into annual return drag.
- Absolute fees are hard to compare across different contribution levels and durations.
- The current chart "Gebuehren vs Kapital" can understate high annual drag when a product also has lower expected gross return due to guarantees.

Required changes:

- Add a helper to compute RIY by solving for the annual net return that produces the same ending capital from the same contribution stream with zero explicit fees.
- Show RIY per product/scenario in the summary table, assumptions drawer, CSV, and fee chart tooltip.
- Keep existing absolute `totalFees`; RIY complements, not replaces it.
- Add tests using a simple fee-free baseline and known fee cases.
- Document that RIY is scenario- and holding-period-dependent and not always comparable across different guarantee / risk classes.

Acceptance: for a configured bAV example with 5% gross return and all-in fee drag near 1.5 pp, the UI shows approximately 3.5% net return / 1.5 pp Effektivkosten and the CSV exports both absolute fees and RIY.

### #58 Add Fee Quality Warnings And Research-Based Presets

The assumptions drawer exposes fee inputs but does not warn when values match known expensive bAV patterns. `BAV_RESEARCH.md` now contains concrete examples:

- acquisition costs around 2.50% of gross contribution sum, spread over 5-6 years
- contribution fees around 4.50% and 9.75%
- wrapper asset fees around 0.60-0.70% p.a. before fund costs
- pension payout fee example around 1.75% of paid pension
- effective-cost warning heuristic: ETF-based contracts above about 2.0% RIY are usually too expensive; 0.6-1.0% RIY is a stronger range for low-cost ETF-based policies

Required changes:

- Add assumptions presets:
  - low-cost bAV / net tariff
  - common provision bAV
  - high-cost bAV
  - generous employer subsidy but high-cost product
- Add warnings when:
  - contribution fee exceeds 5%
  - acquisition cost exceeds 2.5% or spread is strongly front-loaded
  - all-in annual asset fee exceeds 1.0% for ETF-style products
  - computed RIY exceeds 1.5% and 2.0% thresholds
  - fixed monthly fee is high relative to contribution, e.g. >2% of monthly product contribution
- Link warning text to `BAV_RESEARCH.md` and show the concrete examples as calibration, not advice.

Acceptance: changing bAV fees to `9.75% contribution fee + 0.70% wrapper + 0.25% fund + 2.5% acquisition` triggers visible cost warnings and a high RIY display.

---

## Open P2 Publishing / Product

### #15 PDF Report

Generate a readable comparison report for offline review.

### #16 Input Presets

Add presets:
- low-cost ETF only
- standard bAV minimum employer subsidy
- generous employer bAV match
- high-cost private insurance
- old-contract insurance

### #53 Synchronize Project Documentation

`DESIGN.md`, `LEGAL_REVIEW.md`, and `CLAUDE.md` still contain statements that conflict with the current implementation and backlog state, especially around bAV lump-sum output, CSV/share URL work, and private-insurance tax handling.

Update the docs so future reviews do not start from stale assumptions.

---

## Open P3 Expansion

- Riester.
- Rürup.
- statutory pension module.
- Monte Carlo simulation.
- salary growth and contribution escalation.
- multi-ETF portfolio.
- break-even age view.
- sensitivity heatmap.
- saved scenario library and scenario duplication.
- guaranteed annuity factors and surrender-value modeling.
- bilingual UI.
- public deployment.

---

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
- `#13` CSV export: summary comparison, yearly cashflows (all products/scenarios), ETF payout schedule. Single file with three labeled sections. UTF-8 BOM for Excel compatibility.
- `#14` Shareable scenario URL: base64url-encoded `?s=` query parameter. `src/utils/urlShare.ts` — `readUrlState` / `buildShareUrl`. On load: URL param takes priority over localStorage. "Link kopieren" button updates URL via `history.replaceState` and copies to clipboard with 1.5 s "Kopiert!" feedback.
- `#6` bAV retirement phase: marginal-tax payout (`netBavPayout`), KVdR/freiwillig toggle, KV/PV breakdown. Lump-sum: `afterTaxBavLumpSum` — §229 SGB V 1/120 spreading (KV/PV) + §34 Abs. 2 Nr. 4 EStG Fünftelregelung (income tax). `#19` resolved together.
- `#47` Retirement KV/PV caps and aggregate income context: `calculateRetirementKvPv` in `retirementTax.ts` applies monthly BBG cap (5,812.50 EUR) across bAV Versorgungsbezüge, GRV pension, and freiwillig-other income; KV Freibetrag once-per-month on aggregate; PV Freigrenze all-or-nothing; §249a half-rate on GRV for KVdR; freiwillig private insurance now subject to KV/PV; 1/120 lump-sum context-aware.
- `#19` 1/120 KV/PV spreading rule — implemented as part of #6 lump-sum.
- `#48` bAV lump-sum income-tax routing by Durchführungsweg: `BavDurchfuehrungsweg` type + `deriveBavLumpSumTaxMode` in `projections.ts`; `afterTaxBavLumpSum` refactored with `taxMode` parameter; UI selector in assumptions drawer; storage migration (mergeDeep defaults). §3 Nr. 63 → voll_versorgungsbezug (§22 Nr. 5 EStG, no Fünftelregelung); §40b a.F. eligible → pre2005_steuerfrei; Direktzusage/U-Kasse → fuenftelregelung (§34 EStG). Default afterTaxLumpSum drops ~46–58k EUR for default profile (basis scenario: from 197,753 to 141,809 EUR).
- `#38` Law-based private-insurance tax: contract year → `pre2005` / `halbeinkuenfte` / `abgeltungsteuer`; `deriveInsuranceTaxMode` / `netInsurancePayout` / `afterTaxInsuranceLumpSum` in `projections.ts`; Halbeinkünfteverfahren uses personal income-tax marginal rate on half the gain.
- `#52` Child-age PV eligibility: `PersonalProfile.children: number` replaced by `childBirthYears: number[]`. `careEmployeeRateForChildren` now takes `(childBirthYears, currentYear, rules)`. §55 Abs. 3a SGB XI: Kinderlosenzuschlag (+0.6 %) applies only when array is empty; Beitragsabschlag (−0.25 % per child from 2nd) applies only to children under 25 in the contribution year. All four retirement-phase payout helpers use the existing `retirementYear` parameter for the age check. UI: dynamic "Kinder (Geburtsjahr)" list with add/remove. Old `children: number` in saved state silently migrates to `childBirthYears: []` via mergeDeep. 238 tests.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
