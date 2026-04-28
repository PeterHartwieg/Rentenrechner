# Rentenrechner Backlog

This file tracks what still matters for accuracy, usability, and future publishing. Completed audit items are intentionally short; implementation detail belongs in code and tests.

Legal/rules research lives in `LEGAL_REVIEW.md`.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

Wave 3 complete:

- `#54` ✓ Leibrente / Zeitrente payout modes
- `#49` ✓ URL + localStorage schema validation
- `#51` ✓ Statutory vs. contractual bAV employer split
- `#52` ✓ Child-age PV eligibility (§55 Abs. 3a SGB XI)

Wave 4 complete:

- `#55` ✓ Split insurance wrapper fees from fund fees (`wrapperAssetFee` + `fundAssetFee` in `FeeModel`; split UI inputs; storage migration)
- `#56` ✓ Pension-phase payout fee (`pensionPayoutFeePct`; applied before income tax/KV/PV for bAV/pAV annuities)
- `#57` ✓ Effektivkosten / RIY (`computeRIY` in `src/engine/fees.ts`; `accumulationRiy` on `ProductResult`; displayed per product)
- `#58` ✓ Fee quality warnings and presets (4 presets each for bAV/pAV; threshold warnings for contribution fee, acquisition cost, total asset fee, RIY)

Wave 5 complete:

- `#50` ✓ PKV premium modeling — `pkvMonthlyPremium` + `pPVMonthlyPremium` on `PersonalProfile`; `calculatePkv257Subsidy` in `salary.ts` (§257 SGB V employer subsidy, §3 Nr. 62 EStG tax-free); Vorsorgepauschale KV/PV Teilbetrag now uses actual PKV premium for PKV members (§39b EStG); net PKV cost deducted from `annualNet`; `pkv257SubsidyMonthly` + `pkvNetMonthlyCost` on `SalaryResult`; UI inputs visible when PKV selected with live §257 display; schema validation; 8 new tests.

Also resolved silently in prior waves: `#41` (build/lint), `#42` (bAV minimum label), `#43` (GRV-Minderung BBG-aware).

Remaining P1 open items:

1. `#53` Synchronize project documentation (`DESIGN.md`, `LEGAL_REVIEW.md`, `CLAUDE.md`) — do last.

---

## Open P1 Accuracy / Correctness

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

### #59 Correct Schicht-3 Private Leibrente Taxation To Ertragsanteil

The current private-insurance monthly payout path routes every pAV payout through the same gain-ratio logic used for capital payouts:

- `deriveInsuranceTaxMode()` classifies the contract as `pre2005`, `halbeinkuenfte`, or `abgeltungsteuer`.
- `netInsurancePayout()` computes the taxable portion from `gainRatio = (capital - contributions) / capital`.
- That is reasonable for capital payout / capital drawdown approximations, but it is not the statutory method for an ordinary Schicht-3 lifelong private Leibrente.

For an ungefoerderte private Leibrente, Sec. 22 EStG generally taxes only the Ertragsanteil of each pension payment. The taxable share depends on age at annuity start, e.g. 21% at age 62, 18% at age 65-66, 17% at age 67, and 15% at age 69-70. This is documented in `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`.

Required changes:

- Add an `ertragsanteilByAge(age: number)` helper from the Sec. 22 EStG table.
- In the private-insurance branch, when `insurance.payoutMode === 'leibrente'`, compute taxable annual income as `grossMonthlyPayout * 12 * ertragsanteil`.
- Route that taxable amount through the retirement-tax pipeline at the personal rate.
- Keep existing `halbeinkuenfte` / `abgeltungsteuer` logic for capital payout and `kapitalverzehr` / non-lifelong payout approximations.
- Clarify in UI copy that the half-gain rule applies to capital payouts, not to ordinary lifelong private annuities.
- Add tests for age 62, age 67, and a high-gain contract where Leibrente Ertragsanteil produces a materially different result from the current gain-ratio method.

Acceptance: a Schicht-3 private `leibrente` starting at age 67 taxes only 17% of the annual gross pension before deductions, while the same contract in capital-payout mode still uses the Sec. 20 gain taxation logic.

### #60 Make The Current Private Product Explicitly Schicht 3

The product label `Private Versicherung` is too broad after the private Rentenversicherung research. Users may read it as Basisrente / Ruerup or Riester, but the current implementation mostly models an ungefoerderte Schicht-3 private pension wrapper.

Current behavior that is Schicht-3-specific:

- contributions are paid from net income with no Sec. 10 deduction,
- no Riester allowance / Sec. 10a Guenstigerpruefung,
- capital payout uses Sec. 20 private-insurance gain taxation,
- no bAV Versorgungsbezug KV/PV handling for KVdR members.

Required changes:

- Rename labels from `Private Versicherung` to `Private Rentenversicherung (Schicht 3)` or similar in UI, CSV, and exports.
- Add a short assumptions-drawer note that Basisrente and Riester are not included in this product.
- Link the note to `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`.
- Update test snapshots / text assertions as needed.
- Consider renaming internal product id only if migration cost is low; otherwise keep `versicherung` as storage-compatible id and fix display labels.

Acceptance: a user cannot reasonably mistake the current private product for Ruerup or Riester, and saved scenarios continue to load.

### #61 Add Basisrente / Ruerup Product Model

Basisrente is not a variant of the current Schicht-3 private-insurance branch. It has separate contribution deduction rules, payout restrictions, and retirement taxation.

Required changes:

- Add a product model or product subtype for `basisrente`.
- Contribution phase:
  - apply 2026 Schicht-1 cap of 30,826 EUR single / 61,652 EUR jointly assessed,
  - subtract employee and employer statutory pension contributions and any professional pension-scheme contributions from remaining cap,
  - apply 100% deductible share for 2026,
  - compute tax saving through the income-tax pipeline rather than treating contributions as net outlay.
- Payout phase:
  - force or default to `leibrente`; do not allow ordinary full lump-sum payout,
  - tax using the Sec. 22 cohort taxable share, not Ertragsanteil and not Sec. 20 gain taxation,
  - use the existing retirement-year cohort table where possible.
- KV/PV:
  - do not apply bAV Versorgungsbezug Freibetrag / Freigrenze logic for KVdR,
  - include voluntary-GKV treatment through the broader Sec. 240 mode.
- UI:
  - show strong illiquidity warnings: no normal surrender, sale, lending, or free capital payout,
  - expose Basisrente-specific assumptions separately from Schicht-3 assumptions.

Acceptance: entering a 2026 Basisrente contribution above the user's remaining Schicht-1 cap only grants tax benefit up to the remaining cap, and payout is taxed by pension-start cohort rather than private-insurance gain logic.

### #62 Add Riester / Certified Altersvorsorgevertrag Model

Riester is also not represented by the current private-insurance product. It needs allowance logic, special-expense comparison, guarantee / partial-capital constraints, and fully deferred taxation.

Required changes:

- Add a product model or subtype for `riester`.
- Model 2026 old-law values:
  - 175 EUR Grundzulage,
  - 185 EUR child allowance for pre-2008 children,
  - 300 EUR child allowance for post-2007 children,
  - one-time 200 EUR career-starter bonus when eligible before age 25,
  - 4% minimum own contribution based on prior-year relevant income,
  - 2,100 EUR cap including allowances,
  - 60 EUR Sockelbetrag.
- Add allowance proration when the minimum own contribution is not met.
- Add Sec. 10a special-expense deduction / Guenstigerpruefung: only the tax effect above allowances should count as extra tax benefit.
- Payout:
  - tax benefits fully under Sec. 22 Nr. 5 EStG,
  - allow partial capital payout up to 30% at start,
  - model the remaining lifelong income separately from a free ETF-style drawdown.
- Add explicit warning that old Riester products have contribution-plus-allowance guarantee constraints that can lower expected equity exposure.

Acceptance: a parent with eligible post-2007 children can see allowances reduce the required own contribution, while a high-income user can see whether the Sec. 10a tax effect exceeds the allowances.

### #63 Add 2027 Private-Altersvorsorge Reform Watch / Altersvorsorgedepot Placeholder

The 2026 research found a live legal transition: the Bundestag passed private-altersvorsorge reform on 2026-03-27, with 2027 Altersvorsorgedepot / new subsidized product rules expected, but final operational details should be re-checked before implementation.

Required changes:

- Add a visible backlog / docs note that the app intentionally models 2026 old-law Riester only until final 2027 rules are implemented.
- Once final law and provider rules are stable, add a new `altersvorsorgedepot` product rather than forcing it into insurance.
- Track likely future inputs:
  - guarantee level, possibly 0%, 80%, or 100% depending on final product type,
  - subsidy formula,
  - eligible assets,
  - payout constraints,
  - transfer rules from old Riester contracts,
  - tax treatment of funded and unfunded portions.

Acceptance: no 2027 reform assumptions are silently embedded in 2026 calculations, and the UI/docs make clear that Altersvorsorgedepot is not yet modeled.

### #64 Add Private Leibrente Break-Even Age And Rentenfaktor Diagnostics

`#54` added Rentenfaktor-based Leibrente payout, but the UI still does not explain how demanding a low Rentenfaktor can be. `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md` shows that a 28 EUR Rentenfaktor on 200,000 EUR capital pays 560 EUR/month and needs roughly 30 years to return nominal capital before tax.

Required changes:

- Add a simple break-even-age display for Leibrente mode:
  - `grossBreakEvenYears = capitalAtRetirement / (grossMonthlyPayout * 12)`,
  - `grossBreakEvenAge = retirementAge + grossBreakEvenYears`.
- Show this as a diagnostic, not as an actuarial fair-value verdict.
- Add warnings for very low Rentenfaktor values or break-even ages above a configurable threshold, e.g. age 95.
- Separate `guaranteedRentenfaktor` and `current/projectedRentenfaktor` when the data model supports it.
- Include death-benefit / Rentengarantiezeit caveat in the assumptions drawer once those inputs exist.

Acceptance: in Leibrente mode, the user sees the implied nominal break-even age next to the Rentenfaktor, and a 28 EUR/10k factor starting at 67 on 200,000 EUR shows a break-even around age 97 before tax.

### #65 Add Surrender / Paid-Up Scenario For Private Insurance

Private Rentenversicherung contracts are often terminated, reduced, or made paid-up before retirement. The current model assumes contributions continue unchanged to retirement and only models scheduled accumulation fees. That misses one of the largest practical risks of provision-based insurance wrappers.

Required changes:

- Add an optional scenario where contributions stop at a user-selected age.
- Continue applying ongoing asset / wrapper fees after paid-up status if applicable.
- Allow a surrender-value haircut or Stornoabschlag input.
- Show:
  - projected surrender value,
  - paid-up retirement value,
  - fees already sunk,
  - comparison with continuing the contract and with ETF alternative.
- Keep Basisrente separate: ordinary free surrender should not be available for Basisrente.

Acceptance: a user can model "stop paying at age 45" for Schicht-3 private insurance and see both paid-up value at retirement and immediate surrender value assumptions.

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

- statutory pension module.
- Monte Carlo simulation.
- salary growth and contribution escalation.
- multi-ETF portfolio.
- sensitivity heatmap.
- saved scenario library and scenario duplication.
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
- `#41` / `#42` / `#43` Build/lint, bAV minimum label, and GRV-Minderung BBG formula: resolved as part of prior waves. 238 tests at baseline.
- `#55` Split insurance wrapper fees from fund fees: `FeeModel.annualAssetFee` replaced by `wrapperAssetFee` (Versicherungsmantel) + `fundAssetFee` (Fonds/ETF OGC). `projectAccumulation` uses their sum. Storage migration moves old `annualAssetFee` → `wrapperAssetFee` with `fundAssetFee=0`. UI: two separate p.a. inputs per product with labels. Defaults preserve old totals (bAV 0.50 %, pAV 1.40 %).
- `#56` Pension-phase payout fee: `FeeModel.pensionPayoutFeePct` — fraction of gross monthly payout deducted before income tax and KV/PV. Applied for bAV and pAV only (ETF drawdown not affected). Default 0. UI: "Rentengebühr % je Rente" field in each product fee section.
- `#57` Effektivkosten / RIY: `computeRIY(monthlyContribution, months, grossReturn, capitalWithFees)` in `src/engine/fees.ts` uses 60-iteration bisection on the beginning-of-period annuity FV formula. `ProductResult.accumulationRiy` (pp) exposed per product per scenario. Shown in fee-summary box per product in the assumptions drawer. ETF default (0.2 % TER) produces ~0.2 pp; bAV default produces ~1 pp.
- `#58` Fee quality warnings and research-based presets: 4 one-click fee presets each for bAV (Nettotarif, Standard, Hochkosten, Hoher AG-Match) and pAV (Nettotarif, Standard, Hochkosten, Altvertrag). Threshold warnings displayed below fee grid: contribution fee >5 %, acquisition cost >2.5 %, total asset fee >1.0 %, RIY >1.5 % (Bereich), RIY >2.0 % (unwirtschaftlich). 253 tests.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
