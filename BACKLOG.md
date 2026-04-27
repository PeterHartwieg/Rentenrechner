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

The app now applies a rough bAV lump-sum tax/GKV/PV estimate instead of showing gross capital as "after tax", and labels the table column accordingly. This is still not a full retirement-phase tax model.

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

1. Add approximation warnings in the UI.
2. Add yearly audit table.
3. Replace simplified payroll calculation with BMF PAP-backed wage tax.
4. Add bAV tax/SV limit treatment for total bAV contributions.
5. Add bAV tax/SV waterfall.
6. Add local scenario persistence.
7. Add ETF tax basis and Vorabpauschale.
8. Add advanced private insurance contract model.

## Quick Wins

These are small changes that would immediately improve trust:

- Rename any "annualized return" output internally unless it becomes a real IRR.
- Rename `yearlyFees` to `cumulativeFees` or calculate actual yearly fees.
- Add a visible "simplified" badge for ETF tax, insurance tax, and retirement tax.
- Add source links in the UI assumptions panel.
- Add tests for bAV at values near 4% and 8% BBG limits.

Status: the first two naming/math cleanup items are implemented. `yearlyFees` now contains actual fees for the year, `cumulativeFees` is tracked separately, and the misleading annualized-return field was renamed to `capitalMultipleAnnualized`.
