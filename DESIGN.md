# Rentenrechner Design Document

## Design Vision

Rentenrechner is an interactive German retirement-comparison tool for evaluating private ETF investing, private insurance products, and employer pension plans (`bAV`) on a fair, transparent basis.

The central design idea is that the app should be a cashflow simulator, not a simple compound-interest calculator. Every product is reduced to comparable monthly cashflows:

```text
salary / user contribution
-> taxes and social-security effects
-> product contribution
-> costs and fees
-> invested value
-> accumulation
-> retirement payout
-> tax / health / care deductions
-> comparable net outcome
```

The first version is built for personal use with one German tax profile, while the architecture keeps tax rules, personal assumptions, and product contracts separate so the app can later become configurable and publishable.

## Product Scope

### Included in v1

- German market only.
- German UI only.
- Personal default profile:
  - age: `28`
  - retirement age: `67`
  - gross salary: `75,000 EUR/year`
  - tax class: `I`
  - marital status: single
  - children: `0`
  - church tax: no
  - public health insurance
  - default GKV additional contribution: `2.9%`
- Products:
  - private ETF depot
  - `bAV` / employer pension via salary conversion
  - private fund/ETF insurance
- Fixed return scenarios:
  - conservative
  - base
  - optimistic
- Nominal and inflation-adjusted visualizations.
- Comparison of capital at retirement and projected monthly net retirement income.
- Basic test coverage for tax helper logic, bAV funding, and fair net-cost comparison.

### Explicitly Out of Scope for v1

- Monte Carlo simulation.
- Riester, Ruerup, statutory pension, real estate, crypto, or other asset classes.
- Multi-user publishing workflow.
- Backend, accounts, database, or server-side persistence.
- Full financial/tax advisory completeness.

## Key Design Principles

### Fair Comparison

Private ETF and private insurance products are compared against the same monthly net cost as the `bAV`.

This is important because a `300 EUR` gross bAV contribution does not cost the user `300 EUR` net. The app computes the net salary difference and uses that as the private-investment benchmark.

### Auditability

The calculation model is structured around typed inputs and explicit intermediate results. This allows future views to expose monthly or yearly cashflow rows instead of hiding the math behind summary numbers.

### Configurability

German legal values and product contract assumptions are separated:

- `src/rules/de2026.ts` contains law/rate assumptions.
- `src/data/defaultScenario.ts` contains personal and product defaults.
- product simulations consume these objects instead of hard-coding values.

### Conservative Precision

The app uses official 2026 German tax and social-security values where already implemented, but avoids pretending the first prototype is a full payroll engine. The model is precise enough for directional personal comparison and structured so a full BMF PAP implementation can replace the simplified pieces later.

### Local-First

The app is a static frontend. No personal financial data leaves the browser.

## Technical Architecture

The app is a Vite + React + TypeScript static application.

Chosen stack:

- `Vite` for fast local development and static publishing.
- `React` for interactive UI state.
- `TypeScript` for financial-domain safety.
- `Recharts` for dashboard charts.
- `lucide-react` for UI icons.
- `Vitest` for calculation tests.

Current structure:

```text
src/
  data/
    defaultScenario.ts
  domain/
    types.ts
  engine/
    fees.ts / fees.test.ts
    projections.ts
    retirementTax.ts / retirementTax.test.ts / retirementKvPv.test.ts
    bavLumpSumTax.test.ts
    bavWarnings.ts / bavWarnings.test.ts
    salary.ts
    simulate.ts / simulate.test.ts
    tax.ts
  rules/
    de2026.ts
    index.ts
    legalConstants.ts
  storage.ts / storage.test.ts
  utils/
    csvExport.ts
    format.ts
    scenarioSchema.ts / scenarioSchema.test.ts
    urlShare.ts
  App.tsx
  App.css
  index.css
```

## Calculation Architecture

### Data Flow

```text
UI inputs
-> PersonalProfile + ScenarioAssumptions + GermanRules
-> simulateRetirementComparison()
-> ProductResult[]
-> charts, cards, and comparison table
```

### Domain Types

The domain model defines shared types for:

- personal profile
- return scenarios
- product assumptions
- fee models
- German legal rules
- salary results
- bAV funding results
- yearly projections
- comparable product results

This keeps calculation outputs consistent across ETF, bAV, and private insurance.

### Salary and bAV Model

The `bAV` model calculates:

- salary without bAV
- salary with bAV salary conversion
- income-tax delta
- employee social-security delta
- employer social-security saving
- statutory employer subsidy, capped by actual employer social-security saving
- optional extra employer subsidy
- true monthly net cost to the employee

Decision: the legal minimum employer subsidy is not modeled as a blind flat `15%`. It is capped by the calculated employer social-security saving.

### Tax Model

The current income-tax helper implements the 2026 German tariff formula for the relevant single-person case.

Implemented assumptions:

- tax class I profile.
- no children.
- no church tax.
- public health insurance.
- 2026 income-tax tariff values.
- solidarity surcharge threshold.
- simplified taxable-income derivation using salary, social contributions, employee allowance, special expenses allowance, and bAV tax-free conversion.

Decision: this is intentionally not yet a complete BMF Programmablaufplan implementation.

### Social-Security Model

The model includes 2026:

- pension insurance contribution cap.
- health/care contribution cap.
- employee pension rate.
- employee unemployment rate.
- public health rate plus configurable additional contribution.
- childless care contribution.
- employer contribution rates for bAV subsidy calculations.

Decision: because the default salary is above the 2026 health/care contribution cap but below the pension contribution cap, the model must calculate each social-security branch separately.

### Product Models

#### ETF Depot

Modeled as:

- monthly net investment.
- annual ETF asset fee / TER.
- annual return scenario.
- German capital-gains taxation approximation.
- equity fund partial exemption.
- payout via capital depletion until configured retirement end age.

Decision: ETF is the baseline product and is compared against the same net burden as bAV.

#### bAV

Modeled as:

- gross salary conversion.
- statutory employer subsidy.
- configurable additional employer subsidy.
- product fees.
- tax and social-security savings during accumulation.
- retirement payout reduced by simplified income tax and public health/care deductions.

Decision: bAV output prioritizes net monthly retirement income and contribution leverage, not only gross capital.

#### Private Insurance (Schicht 3)

Modeled as:

- monthly premium equal to bAV net cost (fair comparison).
- configurable fee model:
  - wrapper asset fee (Versicherungsmantel, p.a.)
  - fund/ETF asset fee (Fonds OGC/TER, p.a.)
  - contribution fee
  - fixed monthly fee
  - acquisition cost and spread period
  - pension payout fee (% of gross monthly annuity)
- law-based tax mode derived from `contractStartYear` and contract runtime:
  - `pre2005`: entirely tax-free (§52 Abs. 28 EStG a.F., 12-year/5-payment conditions)
  - `halbeinkuenfte`: half the gain at personal marginal rate (§20 Abs. 1 Nr. 6 EStG, 12-year/age-62 rule)
  - `abgeltungsteuer`: full gain at flat 25 % + Soli (§20 Abs. 2 EStG)
- payout mode: `leibrente` (Rentenfaktor-driven, lifelong), `zeitrente` (contractual term), or `kapitalverzehr` (depletion to `retirementEndAge`).

This product models an ungefoerderte Schicht-3 private Rentenversicherung. Basisrente (Rürup) and Riester are out of scope.

## UI and Visualization Decisions

### Layout

The first screen is the working calculator, not a landing page.

Desktop layout:

- sticky input panel on the left.
- dashboard/results on the right.
- summary metrics first.
- capital chart.
- monthly net pension chart.
- assumptions panel.
- detail comparison table.

Mobile layout:

- single-column responsive layout.
- horizontally scrollable scenario control and comparison table where needed.

### German UI

All visible product/user-facing labels are German in v1.

Examples:

- `Eingaben`
- `Rendite-Szenarien`
- `Vermögen bis Rentenbeginn`
- `Monatliche Netto-Rente`
- `Detailvergleich`

### Visual Style

The design is intentionally utilitarian and dashboard-like:

- light neutral background.
- white panels.
- restrained borders.
- product colors:
  - ETF: blue
  - bAV: teal
  - private insurance: amber
- cards are used only for metrics and contained dashboard panels.

Decision: avoid marketing-page styling. This is a work-focused calculator.

### Main Visualizations

Implemented:

- line chart for projected capital until retirement (nominal / inflation-adjusted toggle).
- bar chart for monthly net retirement payout.
- detailed comparison table across all products and return scenarios.
- fee-drag stacked bar chart (capital net of tax + total fees) per product/scenario.
- bAV tax/SV waterfall panel.
- yearly cashflow audit table.
- shareable scenario URLs (`?s=` base64url parameter).
- CSV export (summary, yearly cashflows, ETF payout schedule).
- assumptions drawer with Regelwerte & Quellen 2026.
- fee presets (Nettotarif / Standard / Hochkosten) and threshold warnings per product.
- Effektivkosten / RIY display per product.

Planned:

- break-even age view for Leibrente products.
- sensitivity heatmap.
- PDF export.

## Current Defaults

### Personal Profile

```text
age: 28
retirement age: 67
gross salary: 75,000 EUR/year
tax class: I
childBirthYears: []
church tax: false
public health insurance: true (GKV)
GKV additional contribution: 2.9%
pkvMonthlyPremium: 0  (used when PKV = true)
pPVMonthlyPremium: 0  (used when PKV = true)
```

### bAV

```text
monthly gross conversion: 300 EUR
payout mode: leibrente, Rentenfaktor 30 EUR/10k/month
statutory employer subsidy: enabled (§1a Abs. 1a BetrAVG)
contractual employer match: 0 %
wrapper asset fee: 0.30 % p.a.
fund asset fee: 0.20 % p.a.  (total 0.50 %)
contribution fee: 3 %
acquisition cost: 2.5 % of contribution sum, spread over 5 years
pension payout fee: 0 %
```

### Private Insurance

```text
contract start year: 2024  (→ halbeinkuenfte at retirement)
payout mode: leibrente, Rentenfaktor 28 EUR/10k/month
wrapper asset fee: 1.20 % p.a.
fund asset fee: 0.20 % p.a.  (total 1.40 %)
contribution fee: 3 %
fixed monthly fee: 5 EUR
acquisition cost: 2.5 % of contribution sum, spread over 5 years
pension payout fee: 0 %
```

### Return Scenarios

```text
conservative: 3%
base: 5%
optimistic: 7%
```

### Inflation

```text
2% p.a.
```

### Retirement Payout

```text
capital depletion until age 90
```

## Legal and Data References

The rule model is based on official German sources and is intended to remain source-driven.

Important references:

- BMF Programmablaufplan 2026:
  https://www.bundesfinanzministerium.de/Datenportal/Daten/frei-nutzbare-produkte/Anwendungen/Programmablaufplan-2026/Programmablaufplan-2026.html
- BetrAVG § 1a:
  https://www.gesetze-im-internet.de/betravg/__1a.html
- EStG § 3 Nr. 63:
  https://www.gesetze-im-internet.de/estg/__3.html
- SvEV § 1:
  https://www.gesetze-im-internet.de/svev/__1.html
- 2026 social-security thresholds:
  https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514
- Investment tax partial exemption:
  https://www.gesetze-im-internet.de/invstg_2018/__20.html

## Deferred Items

### Tax and Payroll Precision

- Replace the §39b EStG Vorsorgepauschale helper with a full BMF PAP wage-tax adapter.
- Add all tax classes.
- Add married/splitting support (Ehegattensplitting).
- Add child tax credits and child allowances.
- Add church tax by state.
- Add optional monthly salary, bonus, and special-payment handling.
- Add configurable future law years, e.g. `DE-2027`, `DE-2028`.
- Add law-source metadata per rule field.

### bAV Precision

- Add portability/job-change assumptions.
- Add future health/care contribution assumptions during retirement.
- Add correct Schicht-3 Ertragsanteil taxation for pAV Leibrente (BACKLOG #59).

### ETF Precision

- Add support for distributing funds (Vorabpauschale / gain basis tracking already handles accumulating; distributing funds differ).
- Add salary/investment contribution growth.
- Add rebalancing or multiple ETF allocations.

### Private Insurance Precision

- Add correct §22 EStG Ertragsanteil taxation for Schicht-3 Leibrente (BACKLOG #59).
- Label product explicitly as Schicht 3 / ungefoerdert (BACKLOG #60).
- Derive contract runtime from calendar years for accurate tax-mode classification (BACKLOG #44).
- Add Basisrente (Rürup, Schicht 1) as a separate product (BACKLOG #61).
- Add Riester / certified Altersvorsorgevertrag (BACKLOG #62).
- Add surrender value and paid-up scenario (BACKLOG #65).
- Add death benefit / survivor assumptions.
- Add break-even age and Rentenfaktor diagnostics (BACKLOG #64).

### Visualization

- Add break-even age view for Leibrente products.
- Add net-cost versus retirement-value chart.
- Add sensitivity heatmap.

### Product and UX

- Add scenario duplication.
- Add PDF export.
- Add bilingual support (if publishing).

### Engineering

- Add more unit tests around edge cases.
- Add snapshot fixtures for known salary/tax examples.
- Add integration tests for UI interactions.
- Add code splitting if bundle size becomes an issue.
- Add schema validation for editable rule files.
- Add changelog for rule updates.

## Known Limitations

- The current app is not financial, tax, or legal advice.
- The tax model implements §39b EStG Vorsorgepauschale, not the full BMF PAP wage-tax engine; edge cases (bonus months, multi-employer) are not modeled.
- Only tax class I / single filing is supported. No Ehegattensplitting, church tax, or child tax credits in the income-tax calculation.
- Schicht 1 (Basisrente) and Schicht 2 (Riester) are not modeled.
- Private Rentenversicherung Leibrente is taxed using a gain-ratio approximation; the correct §22 EStG Ertragsanteil method (BACKLOG #59) is not yet implemented.
- Saxony's split PV employer/employee rates (§55 Abs. 3 Satz 6 SGB XI) are not modeled.
- All projections use fixed annual returns, not stochastic simulation.
- Future law changes are not automatically fetched or updated.

## Next Recommended Milestones

1. Correct private Rentenversicherung Leibrente taxation to §22 EStG Ertragsanteil (BACKLOG #59).
2. Explicitly label and scope the private product as Schicht 3 (BACKLOG #60).
3. Derive pAV contract runtime from calendar years for accurate tax-mode classification (BACKLOG #44).
4. Add break-even age and Rentenfaktor quality diagnostics for Leibrente products (BACKLOG #64).
5. Consider adding Basisrente (Schicht 1) as a separate product (BACKLOG #61).
