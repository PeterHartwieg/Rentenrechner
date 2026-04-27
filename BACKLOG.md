# Rentenrechner Implementation Backlog

This backlog translates the deferred items from `DESIGN.md` into implementation priorities. The main goal is to close trust gaps before adding more surface area.

## Priority Legend

- `P0`: Required before the calculator should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for usability, publishing, or broader audiences.
- `P3`: Later expansion.

## Current Gap Assessment

The current prototype has a clean architecture, but several outputs can appear more exact than the model currently is. The most important next work is therefore model precision, auditability, and visible assumptions.

## P0: Trust And Accuracy

### 1. Full German Payroll Tax Engine

**Problem**

The current wage-tax model uses the 2026 tariff formula and simplified taxable-income derivation. It is not a full BMF Programmablaufplan implementation.

**Current files**

- `src/engine/tax.ts`
- `src/engine/salary.ts`
- `src/rules/de2026.ts`

**Risk**

The bAV net-cost calculation depends directly on payroll tax and social-security deltas. If this is off, all "same net cost" comparisons are off.

**Target**

Implement or integrate the official BMF PAP 2026 logic for the relevant personal profile first:

- tax class I
- no kids
- no church tax
- public health insurance
- monthly and yearly payroll modes

Then extend to other profiles.

**Acceptance Criteria**

- Given a known gross salary, the app returns wage tax close to official BMF calculator output.
- bAV salary conversion recalculates wage tax through the same engine.
- Tests cover at least:
  - 50,000 EUR gross
  - 75,000 EUR gross
  - 100,000 EUR gross
  - bAV conversion at 100, 300, and 500 EUR/month

### 2. Audit Table For Yearly Cashflows

**Problem**

The app shows summary outcomes but does not yet expose enough intermediate rows for verification.

**Current files**

- `src/domain/types.ts`
- `src/engine/projections.ts`
- `src/App.tsx`

**Risk**

Without cashflow rows, it is hard to see why a result changes or whether a tax/social-security effect is plausible.

**Target**

Add a yearly audit table with:

- age
- year
- product
- gross salary
- net salary without product
- net salary with product
- user net cost
- product contribution
- employer contribution
- tax savings
- social-security savings
- fees
- balance
- real balance

**Acceptance Criteria**

- The UI has a "Details" or "Cashflows" section.
- Each product/scenario can be inspected year by year.
- Totals reconcile with summary cards.

**Status**

Implemented. "Jahres-Cashflows" section added below the detail table. Product selector (linked to current scenario) shows per-year: Nettoaufwand, Beitrag, AG-Anteil, Steuer-/SV-Ersparnis, Gebühren, kumulierte Gebühren, Kapital, reales Kapital. Totals row reconciles with summary cards. Note: gross/net salary columns are not per-year tracked (no salary growth model yet); deferred to #1/#5.

### 3. Visible Approximation Warnings

**Problem**

Some calculations are intentionally simplified, but the UI does not make this visible enough.

**Current files**

- `src/App.tsx`
- `src/App.css`
- `DESIGN.md`

**Risk**

Users may over-trust outputs that still omit important German tax details.

**Target**

Add an assumptions/warnings panel that flags:

- payroll tax engine is not yet full PAP
- ETF tax ignores Vorabpauschale
- insurance tax is simplified
- retirement-phase taxes are simplified
- fixed return scenarios are not forecasts

**Acceptance Criteria**

- Warnings are visible without reading source/docs.
- Each warning maps to a backlog item.
- The app distinguishes "implemented", "simplified", and "not modeled".

**Status**

Implemented. "Berechnungshinweise" panel added with 10 items across all three statuses: ✓ implementiert (2026 Steuerregeln, bAV-Förderung), ⚠ vereinfacht (Lohnsteuer-Engine, ETF-Sparerpauschbetrag, Versicherungssteuer, bAV Rentenphase, Rendite-Szenarien), ✗ nicht modelliert (ETF-Vorabpauschale, bAV Kapitalabfindung, Gesetzliche Rente). Each item references the backlog issue number.

### 17. Stale GKV-Zusatzbeitrag Default

**Problem**

`defaultProfile.healthAdditionalContributionPct` is `2.2`. The BMG-festgelegter durchschnittlicher Zusatzbeitrag for 2026 is `2.9` (most major Krankenkassen are at or above this).

**Current files**

- `src/data/defaultScenario.ts`
- `DESIGN.md` (the "Current Defaults" block also says 2.2%)

**Risk**

Default GKV deductions are understated by ~0.7 pp on the relevant base. Affects salary net (which underpins the bAV "fair net cost"), the retirement-phase KV deduction, and therefore every headline number on first load.

**Acceptance Criteria**

- `defaultProfile.healthAdditionalContributionPct: 2.9`.
- Same value updated in `DESIGN.md` § "Current Defaults" and § "Product Scope > Personal default profile".
- Existing snapshot/baseline tests refreshed to match.

**Status**

Implemented. The default profile and design document now use `2.9%`.

### 18. Pflegeversicherung Cliff In Retirement Phase

**Problem**

[projections.ts:164-167](src/engine/projections.ts:164) and [projections.ts:187-189](src/engine/projections.ts:187) calculate the PV base for Versorgungsbezüge as either the full gross or zero, switching at `retirementHealthAllowanceMonthly`:

```ts
const careBaseMonthly =
  grossMonthlyPayout > rules.socialSecurity.retirementHealthAllowanceMonthly
    ? grossMonthlyPayout
    : 0
```

Per §57 Abs. 1 SGB XI in conjunction with §226/§229 SGB V, the PV base equals the KV base — i.e. `max(0, gross − Freibetrag)`, not the full gross.

**Current files**

- `src/engine/projections.ts` (`netBavPayout`, `afterTaxBavLumpSum`)

**Risk**

Material at the default profile (bAV monthly payout is well above 197.75 EUR). Current code overstates PV deduction by `197.75 × 4.2% ≈ 8.31 EUR/month`, and produces a discontinuity at the threshold.

**Target**

Replace both branches with:

```ts
const careBaseMonthly = Math.max(0, grossMonthlyPayout - rules.socialSecurity.retirementHealthAllowanceMonthly)
```

Same fix in `afterTaxBavLumpSum`.

**Acceptance Criteria**

- `netBavPayout` is continuous in `grossMonthlyPayout` across the Freibetrag.
- A unit test pins KV and PV bases for payouts at `Freibetrag − 1`, `Freibetrag`, and `Freibetrag + 100`.

**Status**

Implemented for `netBavPayout`; the old lump-sum helper was removed because bAV Einmalkapital is now intentionally hidden until #19 is modeled exactly.

### 19. bAV Lump-Sum KV/PV Spreading (1/120 Rule)

**Problem**

[projections.ts:174-193](src/engine/projections.ts:174) charges the full annual KV+PV rate on the entire bAV lump-sum capital in one shot. Real-world treatment (§229 Abs. 1 Satz 3 SGB V): a Kapitalauszahlung from Versorgungsbezüge is spread across 120 months for KV/PV (1/120 of capital × KV+PV rate per month for 10 years), with the same `retirementHealthAllowanceMonthly` Freibetrag and BBG cap.

**Current files**

- `src/engine/projections.ts`
- `src/App.tsx` (the table footnote already flags this as "grobe Schätzung")

**Risk**

The "Kapital nach Steuer" column for bAV is overstated by 5–10× relative to the truthful figure. The table footnote acknowledges the simplification but the magnitude is large enough that the column is not directionally comparable to ETF/insurance.

**Target**

Either:

1. Implement the 1/120 spreading: monthly KV/PV = `(capital / 120) × (healthRate + careRetirementChildlessRate)` after the Freibetrag, summed over 120 months and capped at the monthly BBG, and discounted to a present value if the rest of the comparison is in present-value terms; or
2. Hide the bAV "Kapital nach Steuer" cell (display "—") with a tooltip pointing at this backlog item, and rely on the monthly-pension comparison instead.

**Acceptance Criteria**

- bAV lump-sum after-tax is within ±5% of a hand-calculated 1/120-spread reference, or the column is intentionally hidden.
- Footnote text in [App.tsx:700-704](src/App.tsx:700) is updated to reflect the chosen approach.

**Status**

Implemented with option 2: bAV lump-sum after-tax is hidden and the table footnote explains why.

### 20. ETF Saver Allowance Double-Counted

**Problem**

[projections.ts:142-150](src/engine/projections.ts:142) (`afterTaxInvestmentCapital`) applies the *full* annual `saverAllowance` against the lifetime gain at lump-sum time. [projections.ts:123-140](src/engine/projections.ts:123) (`netEtfPayout`) applies the *same* annual `saverAllowance` against each year of payout. Both surfaces describe a different ETF reality and the saver allowance accounting is mutually inconsistent.

**Current files**

- `src/engine/projections.ts`

**Risk**

`afterTaxLumpSum` and `netMonthlyPayout` for the ETF product can disagree in non-obvious ways — the lump-sum view absorbs only one allowance against multi-decade gains while the payout view applies the allowance every year of withdrawal.

**Target**

Pick one of the following and document it:

1. Drop the `saverAllowance` from `afterTaxInvestmentCapital` (the lump-sum surface is "if you sold all today" — historically the user has already used the allowance over decades).
2. Drop it from both surfaces and call out the simplification in the assumptions panel.
3. Wait for #7 (full ETF tax model with annual Sparerpauschbetrag tracking) and then unify.

**Acceptance Criteria**

- A unit test pins both surfaces against the same set of inputs and shows they are internally consistent under the chosen rule.
- The assumptions panel explicitly states how `Sparerpauschbetrag` is treated.

**Status**

Partially implemented. ETF lump-sum now uses no `Sparerpauschbetrag`; ETF withdrawals still apply the annual allowance. The assumptions panel states this until the full ETF tax model in #7 is built.

### 21. Insurance "Steuerfrei" Mode Has No Branch

**Problem**

[simulate.ts:215-217](src/engine/simulate.ts:215) constructs `taxMode: 'insurance-tax-free'` but [simulate.ts:86-122](src/engine/simulate.ts:86) only matches `'etf'`, `'insurance-normal'`, and `'bav'`. The tax-free path falls through to the default initialization (`afterTaxLumpSum = projection.capital`, `netMonthlyPayout = grossMonthlyPayout`), which happens to produce the right behavior but is invisible and untested.

**Current files**

- `src/engine/simulate.ts`

**Risk**

Any future change to the default initialization would silently break the tax-free path with no test failure.

**Target**

Add an explicit branch:

```ts
if (params.taxMode === 'insurance-tax-free') {
  afterTaxLumpSum = projection.capital
  netMonthlyPayout = grossMonthlyPayout
}
```

Add a unit test that switches `assumptions.insurance.taxMode` between `'normal'` and `'steuerfrei'` and asserts the lump-sum and payout differ accordingly.

**Acceptance Criteria**

- An explicit `'insurance-tax-free'` branch exists.
- A test in `simulate.test.ts` pins both insurance tax modes for the default profile.

**Status**

Implemented.

## P1: German Product Precision

### 4. bAV Contribution Limit Handling

**Problem**

The current salary model applies tax/SV bAV limits to the employee salary conversion. It should also model the total bAV contribution context, including employer subsidy, because tax-free and SV-free limits apply to the relevant bAV contributions as a whole.

**Current files**

- `src/engine/salary.ts`
- `src/engine/simulate.ts`
- `src/rules/de2026.ts`

**Risk**

The default case is only slightly affected, but higher employer subsidies can produce incorrect tax/SV treatment.

**Target**

Track separately:

- employee salary conversion
- mandatory employer subsidy
- extra employer subsidy
- total bAV contribution
- tax-free portion
- SV-free portion
- taxable overflow
- SV-liable overflow

**Acceptance Criteria**

- If total bAV contributions exceed 4% BBG, only the allowed portion is SV-free.
- If total bAV contributions exceed 8% BBG, overflow is treated as taxable.
- UI shows how much of the contribution is tax-free and SV-free.

### 5. Statutory Pension Reduction From bAV

**Problem**

Salary conversion reduces pension-insurance contributions when below the pension contribution ceiling. This can reduce future statutory pension entitlements.

**Current files**

- `src/engine/salary.ts`
- `src/engine/simulate.ts`

**Risk**

The bAV can look too attractive if the reduced statutory pension is ignored.

**Target**

Add an optional toggle:

```text
Reduced statutory pension from salary conversion: on/off
```

Estimate lost pension points from reduced pension-insurance base.

**Acceptance Criteria**

- Default can remain off until verified.
- When enabled, bAV net retirement income is reduced by estimated lost statutory pension.
- Method and assumptions are visible in the UI.

### 6. bAV Retirement Phase Detail

**Problem**

Current bAV retirement payout and lump-sum treatment use simplified income tax and GKV/PV treatment.

**Current files**

- `src/engine/projections.ts`

**Risk**

Net monthly pension can be materially wrong depending on other retirement income, KVdR status, voluntary insurance, and future rates.

**Target**

Add configurable retirement income context:

- statutory pension estimate
- other taxable income
- KVdR vs voluntary GKV
- health/care contribution assumptions
- lump sum vs pension payout

**Acceptance Criteria**

- bAV pension taxation can include other taxable retirement income.
- GKV/PV contribution base is shown.
- Lump-sum payout is modeled separately from monthly pension.

**Current Mitigation**

The app now hides bAV lump-sum after-tax capital instead of showing a rough number. The monthly net pension remains visible while the exact 1/120 lump-sum treatment is deferred.

### 7. ETF Tax Model

**Problem**

The ETF model currently approximates capital-gains tax at payout and ignores Vorabpauschale and accumulation-year tax effects.

**Current files**

- `src/engine/projections.ts`
- `src/engine/tax.ts`

**Risk**

ETF after-tax values can be overstated or understated depending on return path, basis interest, distributions, and withdrawal behavior.

**Target**

Add configurable ETF tax parameters:

- accumulating vs distributing
- equity/mixed/other fund partial exemption
- Vorabpauschale calculation
- annual Sparerpauschbetrag use
- realized gains during withdrawals

**Acceptance Criteria**

- Accumulation tracks tax basis.
- Annual tax events reduce cash or portfolio balance.
- Withdrawal taxation uses realized gain share rather than a single average gain ratio only.

### 8. Insurance Tax And Contract Model

**Problem**

Private insurance is currently reduced to fee drag plus either "tax-free" or "normal" taxation.

**Current files**

- `src/data/defaultScenario.ts`
- `src/engine/simulate.ts`

**Risk**

This is too coarse for comparing real German insurance offers.

**Target**

Add contract fields:

- contract start year
- payout age
- runtime
- lump sum vs annuity
- guaranteed annuity factor
- half-income method eligibility
- old-contract tax-free toggle
- surrender value

**Acceptance Criteria**

- The existing `steuerfrei` / `normal` switch remains as simple mode.
- Advanced mode can model common real contract cases.
- Fee assumptions are visible and editable.

### 22. Care Contribution Magic Number For Parents

**Problem**

[salary.ts:34-37](src/engine/salary.ts:34) hard-codes `0.018` as the employee care-insurance rate when the user has children:

```ts
care = profile.publicHealthInsurance && profile.children === 0
  ? healthBase * rules.socialSecurity.careEmployeeChildlessRate
  : healthBase * 0.018
```

`0.018` happens to coincide with `careEmployerRate`, but those are two different concepts. The fall-through branch reuses the *employer* rule field as if it were the employee parent rate. It also silently ignores the §55 Abs. 3 SGB XI Abschlag of 0.25 pp per child for 2–5 children.

**Current files**

- `src/engine/salary.ts`
- `src/rules/de2026.ts`

**Risk**

For v1 (`children: 0`) this branch is dead. As soon as #26 (expose `children` toggle) lands, the code will quietly emit wrong PV employee contributions for any parent profile. Also brittle to any future rule update that touches `careEmployerRate` without the maintainer realizing it propagates here.

**Target**

- Add a `careEmployeeBaseRate: 0.018` field to `GermanRules.socialSecurity`.
- Add a small helper `careEmployeeRateForChildren(children, rules)` that returns `careEmployeeChildlessRate` for 0 children, `careEmployeeBaseRate` for 1 child, and `careEmployeeBaseRate − Math.min(children − 1, 4) × 0.0025` for 2+.
- Use the helper in both `calculateEmployeeSocialContributions` and any future retirement-phase code.

**Acceptance Criteria**

- No remaining magic-number rates in `salary.ts`.
- Unit tests pin the rate at `children = 0, 1, 2, 3, 5, 6` against §55 Abs. 3 SGB XI.

**Status**

Implemented.

### 23. topTaxStart Off By One

**Problem**

[de2026.ts:11](src/rules/de2026.ts:11) sets `topTaxStart: 277_825`. The §32a EStG zone-4 boundary for 2026 is **277,826**.

**Current files**

- `src/rules/de2026.ts`

**Risk**

Practically harmless because the two linear pieces meet at ~277,825.71 — but inconsistent with the statute and surfaces as a 1-EUR shift in the boundary used by `calculateIncomeTax2026`.

**Acceptance Criteria**

- Value updated to `277_826`.
- A test pins the tariff at `277_825`, `277_826`, and `277_827` against an authoritative reference.

**Status**

Implemented.

### 24. retirementHealthAllowanceMonthly Misleading Name

**Problem**

[de2026.ts:25](src/rules/de2026.ts:25) defines `retirementHealthAllowanceMonthly: 197.75`. The numeric value matches the §226 SGB V Freibetrag for Versorgungsbezüge in KVdR (1/20 × monatliche Bezugsgröße West, 3,955 / 20 = 197.75). The name reads as if it were the §19 Abs. 2 EStG Versorgungsfreibetrag (which for the 2026 cohort is ~104 EUR/month). Both are unrelated.

**Current files**

- `src/rules/de2026.ts`
- `src/engine/projections.ts` (consumers)
- `src/domain/types.ts`

**Risk**

A future maintainer is likely to "correct" the value to the wrong concept.

**Target**

- Rename to `versorgungsbezuegeKvFreibetragMonthly` (or shorter `kvFreibetragVersorgungMonthly`).
- Add a one-line comment with the SGB V reference and the 1/20 Bezugsgröße derivation.
- Update consumers in `projections.ts`.

**Acceptance Criteria**

- Field name no longer suggests an EStG Versorgungsfreibetrag.
- Comment explains the §226 SGB V derivation and the 2026 source (Bezugsgröße West 3,955 EUR).

**Status**

Implemented.

## P1: UX For Decision Support

### 9. Tax/SV Waterfall For bAV

**Problem**

The bAV advantage is currently summarized but not visually explained.

**Target**

Add a waterfall chart:

```text
300 EUR gross conversion
- income-tax saving
- employee SV saving
= net cost
+ employer subsidy
= monthly bAV contribution
```

**Acceptance Criteria**

- User can understand why 300 EUR gross costs less than 300 EUR net.
- Values reconcile with bAV summary cards.

### 10. Fee Drag Comparison

**Problem**

Insurance and bAV costs are included but not visually obvious.

**Target**

Add a chart comparing:

- gross contributions
- fees
- ending capital
- lost value vs low-cost ETF

**Acceptance Criteria**

- Each product shows total fees over accumulation.
- User can see how much fees reduce projected capital.

### 11. Local Scenario Persistence

**Problem**

Changes are lost on reload.

**Target**

Save personal profile and assumptions in `localStorage`.

**Acceptance Criteria**

- Changes persist after page reload.
- Add reset-to-default button.
- Schema version allows future migration.

### 25. Expose Profile Toggles (Church Tax, Public Health, Children)

**Problem**

`PersonalProfile` parameterizes `churchTax`, `publicHealthInsurance`, and `children`, but the input panel does not surface them. The assumptions panel hard-codes "Klasse I, keine Kinder, keine Kirchensteuer" even though the engine reads the live values.

**Current files**

- `src/App.tsx`
- `src/domain/types.ts`

**Risk**

The model accepts values the UI cannot reflect; non-default values can only be set by editing source. The visible "Annahmen zur Fairness" block can drift from what the engine actually computes.

**Target**

- Either add three toggles (church tax, public health, children) to the input panel, or
- Remove the corresponding fields from `PersonalProfile` until they are user-editable.

**Acceptance Criteria**

- Either the toggles exist and the assumption panel reflects the live values, or the type is narrowed and the assumption panel matches what is hard-coded.

### 26. Editable Retirement End Age

**Problem**

`assumptions.retirementEndAge` is fixed at `90` and only displayed inside the chart caption. Users cannot change horizon to e.g. 85 or 95.

**Current files**

- `src/App.tsx`

**Acceptance Criteria**

- A "Kapitalverzehr bis Alter" number field exists alongside the other inputs.
- The `Monatliche Netto-Rente` chart caption reflects the live value (it already does — verify after edit).

**Status**

Implemented. "Kapitalverzehr bis" NumberField is live in the input panel (App.tsx:364); chart caption already reflects the value.

### 27. ETF Partial-Exemption Mode Selector

**Problem**

`assumptions.etf.equityPartialExemption` defaults to `0.3` (Aktienfonds) with no UI surface. ETF results materially change for non-equity ETFs.

**Current files**

- `src/App.tsx`
- `src/data/defaultScenario.ts`
- `src/domain/types.ts`

**Target**

Add a select with the InvStG §20 categories:

- Aktienfonds: 30%
- Mischfonds: 15%
- Inländische Immobilienfonds: 60%
- Ausländische Immobilienfonds: 80%
- Sonstige (Anleihe-ETF): 0%

**Acceptance Criteria**

- Select bound to `equityPartialExemption`.
- A label explains that the percentage is the steuerfreier Anteil of gains.

### 28. Insurance "Steuerfrei" Mode Tooltip

**Problem**

The select offers `steuerfrei` vs. `normal besteuert` without explaining when each applies. A user has no way to know that "steuerfrei" implies pre-2005 contracts or the 12-Jahre/Alter-62 + Halbeinkünfte rule.

**Current files**

- `src/App.tsx`

**Acceptance Criteria**

- An info icon or footnote next to the select describes the conditions for each mode.
- Text is in German, consistent with the rest of the UI.

### 29. ContributionMode Toggle Or Drop Dead Defaults

**Problem**

`etf.monthlyInvestment: 180` and `insurance.monthlyPremium: 180` in [defaultScenario.ts:23](src/data/defaultScenario.ts:23) are unreachable: both products default to `contributionMode: 'same-as-bav-net-cost'` and there is no UI toggle. The values are dead.

**Current files**

- `src/App.tsx`
- `src/data/defaultScenario.ts`

**Target**

Either:

1. Add a toggle "Privatprodukte: gleicher Nettoaufwand wie bAV / eigene Beiträge" with a number field for the custom monthly amount; or
2. Remove the unused `monthlyInvestment` / `monthlyPremium` fields and the `'custom'` variant of `PrivateContributionMode`.

**Acceptance Criteria**

- No defaults are dead.
- If the toggle is added, the assumptions panel reflects the chosen mode.

### 30. Retirement Age Validation

**Problem**

[App.tsx:166-182](src/App.tsx:166) lets `age` go up to 66 and `retirementAge` start from 55. With `age = 60, retirementAge = 55` the simulation produces `monthsToRetirement = -60`. `projectAccumulation` short-circuits silently, `monthlyPayoutFromCapital` divides on degenerate inputs, and the result table fills with zeros without explanation.

**Current files**

- `src/App.tsx`

**Target**

Clamp at the input level: `retirementAge.min = max(55, age + 1)` and `age.max = retirementAge − 1`. Optionally short-circuit the simulation with a friendly inline banner if the constraint is violated.

**Acceptance Criteria**

- Invalid age combinations are not reachable through the inputs.
- If they are programmatically constructed (URL/load), the UI shows a clear message instead of silent zeros.

**Status**

Partially implemented. Invalid combinations are no longer reachable through the age inputs.

## P2: Publishable Product

### 12. Source And Assumption Drawer

Add a UI drawer with:

- legal source links
- rule values
- calculation status
- last verified date

### 13. CSV Export

Export summary and yearly cashflows.

### 14. Shareable Scenario URL

Serialize selected assumptions into a compressed URL parameter.

### 15. PDF Report

Export a readable comparison report.

### 16. Input Presets

Add presets for:

- low-cost ETF only
- standard bAV minimum employer subsidy
- generous employer bAV match
- high-cost private insurance
- old tax-free insurance

## P3: Future Expansion

- Riester.
- Ruerup.
- statutory pension module.
- Monte Carlo simulation.
- salary growth and contribution escalation.
- multi-ETF portfolio.
- bilingual UI.
- public deployment.

## Recommended Implementation Order

1. Land the P0 correctness fixes from the v1-live audit (#17 stale Zusatzbeitrag, #18 PV cliff, #19 bAV lump-sum spreading or hide, #20 saver-allowance dedup, #21 explicit insurance-tax-free branch).
2. Add approximation warnings in the UI (#3).
3. Add yearly audit table (#2).
4. Replace simplified payroll calculation with BMF PAP-backed wage tax (#1).
5. Add bAV tax/SV limit treatment for total bAV contributions (#4).
6. Add bAV tax/SV waterfall (#9).
7. Add local scenario persistence (#11).
8. Add ETF tax basis and Vorabpauschale (#7).
9. Add advanced private insurance contract model (#8).

## Quick Wins

These are small changes that would immediately improve trust. Each is under an hour:

- Set `defaultProfile.healthAdditionalContributionPct` to `2.9` and update `DESIGN.md` (#17).
- Update `incomeTax.topTaxStart` to `277_826` (#23).
- Replace the PV cliff with `Math.max(0, gross − Freibetrag)` in `netBavPayout` and `afterTaxBavLumpSum` (#18).
- Add a `careEmployeeBaseRate` rule field and remove the `0.018` magic in `salary.ts` (#22).
- Add an explicit `taxMode === 'insurance-tax-free'` branch in `simulate.ts` (#21).
- Rename `retirementHealthAllowanceMonthly` to a §226-SGB-V-anchored name with a comment (#24).
- Clamp `retirementAge ≥ age + 1` in the input panel (#30).
- Remove the unused `etf.monthlyInvestment` and `insurance.monthlyPremium` defaults, or expose `contributionMode` (#29).
- Add tests for bAV at values near 4% and 8% BBG limits.
- Add a visible "simplified" badge for ETF tax, insurance tax, and retirement tax.
- Add source links in the UI assumptions panel.

Status: the earlier naming/math cleanup items are implemented. `yearlyFees` now contains actual fees for the year, `cumulativeFees` is tracked separately, and the misleading annualized-return field was renamed to `capitalMultipleAnnualized`.

## Test Coverage Backlog

Tests that should accompany the v1-live work, organized by what they pin:

- `calculateSolidarityTax`: zero zone, Milderungszone transition (`incomeTax > 20,350` near boundary), full 5.5% zone.
- `calculateCapitalGainsTax`: with and without saver allowance, with `partialExemption ∈ {0, 0.15, 0.3, 0.6, 0.8}`.
- `netBavPayout`: KV/PV behavior at `gross = Freibetrag − 1`, `Freibetrag`, `Freibetrag + 100`, and at high payouts hitting the BBG cap (after #18).
- `afterTaxBavLumpSum`: the chosen treatment from #19.
- `calculateBavFunding`: SV-savings cap on the statutory subsidy at `monthlyGrossConversion = 100, 300, 500, 700` — the 4%-BBG threshold is around 338 EUR/month.
- Default-profile end-to-end snapshot: `capitalAtRetirement`, `afterTaxLumpSum`, `netMonthlyPayout` for each (product × scenario) cell. Catches regressions when any rule, formula, or default changes.

---

## Appendix: 2026 Baseline Value Fact-Check

Cross-checked `src/rules/de2026.ts` and `src/data/defaultScenario.ts` against BMF, BMG, Bundesregierung, and lohn-info on 2026-04-27. Engine-bug findings from this audit have been folded into the prioritized items above (#17–#30); this table remains as a verification reference.

| Field | Code | 2026 official | Status |
|---|---|---|---|
| `incomeTax.basicAllowance` | 12,348 | 12,348 | ✓ |
| `incomeTax.firstProgressionEnd` | 17,799 | 17,799 | ✓ |
| `incomeTax.secondProgressionEnd` | 69,878 | 69,878 | ✓ |
| `incomeTax.topTaxStart` | 277,825 | **277,826** | off by 1 EUR — see #23 |
| Tariff polynomials (914.51, 1400, 173.1, 2397, 1034.87, −11135.63, −19470.38) | as coded | matches BMF PAP-2026 | ✓ |
| `incomeTax.solidarityFreeTax` | 20,350 | 20,350 | ✓ |
| Soli rate / Milderungszone | 5.5% / 11.9% | 5.5% / 11.9% | ✓ |
| `socialSecurity.pensionCapYear` | 101,400 | 101,400 (8,450 × 12, bundeseinheitlich) | ✓ |
| `socialSecurity.healthCareCapYear` | 69,750 | 69,750 (5,812.50 × 12) | ✓ |
| RV rates (employee/employer 9.3%) | 0.093 / 0.093 | 0.093 / 0.093 | ✓ |
| AV rates (1.3% each) | 0.013 / 0.013 | 0.013 / 0.013 | ✓ |
| GKV `healthGeneralRate` | 0.146 | 0.146 | ✓ |
| `careEmployerRate` | 0.018 | 0.018 | ✓ |
| `careEmployeeChildlessRate` | 0.024 | 0.024 (1.8% + 0.6% Kinderlosenzuschlag) | ✓ |
| `careRetirementChildlessRate` | 0.042 | retiree pays full 3.6% + 0.6% = 4.2% (no employer share) | ✓ |
| `bav.taxFreePctOfPensionCap` | 0.08 | 8% (§3 Nr. 63 EStG) | ✓ |
| `bav.socialSecurityFreePctOfPensionCap` | 0.04 | 4% (§1 SvEV) | ✓ |
| `bav.statutoryEmployerSubsidyPct` | 0.15 | 15% (BetrAVG §1a Abs. 1a) | ✓ |
| `capitalGains.taxRate` / `solidarityRate` / `saverAllowance` | 0.25 / 0.055 / 1,000 | 0.25 / 0.055 / 1,000 | ✓ |
| `employeeAllowance` (Werbungskosten-Pauschbetrag) | 1,230 | 1,230 (unchanged since 2023) | ✓ |
| `specialExpensesAllowance` | 36 | 36 | ✓ |
| `defaultProfile.healthAdditionalContributionPct` | **2.2** | **2.9** (BMG-Festlegung 2026 für durchschnittlichen Zusatzbeitrag) | stale — see #17 |
| `retirementHealthAllowanceMonthly` | 197.75 | matches §226 SGB V Freibetrag for Versorgungsbezüge in KVdR (1/20 × Bezugsgröße West 3,955 = 197.75) for 2026 | ✓ value, misleading name — see #24 |

Sources: bundesfinanzministerium.de (Steueränderungen 2026), bundesregierung.de (BBG 2026), lohn-info.de (SV-Beiträge 2026), bundesgesundheitsministerium.de (durchschnittlicher Zusatzbeitrag 2026), deutsche-rentenversicherung.de (SV-Rechengrößen 2026).
