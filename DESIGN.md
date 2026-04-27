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
  - default GKV additional contribution: `2.2%`
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
    projections.ts
    salary.ts
    simulate.ts
    simulate.test.ts
    tax.ts
  rules/
    de2026.ts
  utils/
    format.ts
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

#### Private Insurance

Modeled as:

- monthly premium.
- configurable fee model:
  - annual asset fee
  - contribution fee
  - fixed monthly fee
  - acquisition cost
  - acquisition-cost spread period
- tax mode:
  - `normal`
  - `steuerfrei`

Decision: insurance tax is intentionally simplified in v1 to the two requested modes.

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

- line chart for projected capital until retirement.
- toggle for nominal vs inflation-adjusted values.
- bar chart for monthly net retirement payout.
- detailed comparison table across all products and return scenarios.

Planned:

- fee-drag chart.
- tax/social-security waterfall for bAV.
- yearly cashflow table.
- break-even view.
- sensitivity heatmap.

## Current Defaults

### Personal Profile

```text
age: 28
retirement age: 67
gross salary: 75,000 EUR/year
tax class: I
children: 0
church tax: false
public health insurance: true
GKV additional contribution: 2.2%
```

### bAV

```text
monthly gross conversion: 300 EUR
extra employer contribution: 0%
default contribution cost: 3%
default capital fee: 0.5% p.a.
default acquisition cost: 2.5% of contribution sum, spread over 5 years
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

- Replace the simplified wage-tax helper with a full BMF PAP adapter.
- Add all tax classes.
- Add married/splitting support.
- Add children and child allowances.
- Add church tax by state.
- Add private health insurance mode.
- Add optional monthly salary, bonus, and special-payment handling.
- Add exact pension-phase taxation for bAV and insurance.
- Add configurable future law years, e.g. `DE-2027`, `DE-2028`.
- Add law-source metadata per rule field.

### bAV Precision

- Model reduction of statutory pension entitlements due to lower pension contributions.
- Model different bAV implementation routes:
  - Direktversicherung
  - Pensionskasse
  - Pensionsfonds
  - Unterstützungskasse
  - Direktzusage
- Add portability/job-change assumptions.
- Add employer-specific matching rules.
- Add guaranteed annuity factors.
- Add lump-sum payout taxation and health/care contribution handling.
- Add future health/care contribution assumptions during retirement.

### ETF Precision

- Add detailed German ETF taxation:
  - Vorabpauschale
  - distributions vs accumulating funds
  - partial exemption by fund type
  - realized-gain sequencing during withdrawal
  - unused Sparerpauschbetrag handling over time
- Add salary/investment contribution growth.
- Add rebalancing or multiple ETF allocations.

### Private Insurance Precision

- Add insurance-specific tax treatment beyond `steuerfrei` and `normal`.
- Add old-contract rules.
- Add half-income method / 12-year / age conditions where applicable.
- Add guaranteed pension factors.
- Add surrender value.
- Add death benefit / survivor assumptions.
- Add contract-specific cost import fields.

### Visualization

- Add tax/social-security waterfall for bAV.
- Add fee-drag comparison.
- Add net-cost versus retirement-value chart.
- Add sensitivity heatmap.
- Add break-even age view.
- Add yearly and monthly audit tables.
- Add exportable scenario report.

### Product and UX

- Add saved scenarios via `localStorage`.
- Add scenario duplication.
- Add shareable URLs.
- Add CSV export.
- Add PDF export.
- Add assumptions/source drawer.
- Add onboarding presets for typical contracts.
- Add bilingual support later, if publishing.
- Add warning system for assumptions that are simplified or missing.

### Engineering

- Add more unit tests around edge cases.
- Add snapshot fixtures for known salary/tax examples.
- Add integration tests for UI interactions.
- Add code splitting if bundle size becomes an issue.
- Add schema validation for editable rule files.
- Add changelog for rule updates.

## Known Limitations

- The current app is not financial, tax, or legal advice.
- The tax model is not yet a complete payroll implementation.
- The retirement phase is simplified.
- Private insurance taxation is simplified to the requested two modes.
- Future law changes are not automatically fetched or updated.
- All projections use fixed annual returns, not stochastic market behavior.

## Next Recommended Milestones

1. Add full BMF PAP integration or a verified adapter for 2026 wage tax.
2. Add a detailed yearly cashflow table so every result is auditable.
3. Add the bAV tax/SV waterfall visualization.
4. Add `localStorage` scenario save/load.
5. Expand insurance contract inputs for real offers.
