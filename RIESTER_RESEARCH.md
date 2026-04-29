# Riester Altvertrag Research Germany 2026

Last researched: 2026-04-28

This note summarizes the German legacy Riester / certified Altersvorsorgevertrag rules that matter for the calculator model in 2026: eligibility assumptions, allowances, minimum own contribution, Sec. 10a special-expense deduction and Guenstigerpruefung, payout taxation, partial capital payout, and harmful-use warnings.

It is not legal, tax, or financial advice. The goal is to make assumptions in the tool explicit and keep later legal-vs-implementation review source-backed.

## Executive Summary For The Tool

- Legacy Riester is a Schicht-2 certified old-age product. In 2026 it is modeled as an existing / old-law Riester contract, not as the planned 2027 Altersvorsorgedepot regime.
- The subsidy has two layers:
  - State allowances paid into the contract: Grundzulage, Kinderzulage, and a one-time Berufseinsteigerbonus.
  - Sec. 10a EStG special-expense deduction up to 2,100 EUR/year including allowances. The tax office performs a Guenstigerpruefung; only the tax benefit above the allowance value is an extra tax refund to the saver.
- 2026 core values:
  - Grundzulage: 175 EUR/year.
  - Kinderzulage: 185 EUR/year for children born before 2008; 300 EUR/year for children born from 2008 onward.
  - Berufseinsteigerbonus: 200 EUR once for eligible savers under age 25 at the beginning of the relevant contribution year.
  - Full allowance generally requires a Mindesteigenbeitrag of 4% of prior-year relevant income, capped at 2,100 EUR including allowances, reduced by the allowance entitlement, with a 60 EUR/year Sockelbetrag.
  - If own contributions are too low, allowances are reduced proportionally.
- Payouts from tax-subsidized Riester capital are generally taxed under Sec. 22 Nr. 5 EStG. For a simple fully subsidized model, treating running payouts and the permitted partial lump sum as fully taxable ordinary income is directionally right.
- Up to 30% of the subsidized capital can be paid out at the beginning of the payout phase without being harmful use; the remaining capital must finance certified old-age benefits.
- Harmful use under Sec. 93 EStG is complex and should be treated as a qualitative warning unless the app later models subsidy-repayment and Wohn-Riester cases in detail.

## 2026 Constants

| Item | 2026 value / rule | Tool effect |
|---|---:|---|
| Sec. 10a special-expense cap | 2,100 EUR/year including allowances | Deductible base is own Riester contributions plus allowance entitlement, capped at 2,100 EUR. |
| Grundzulage | 175 EUR/year | Full annual basic allowance for directly eligible savers when the minimum contribution is met. |
| Kinderzulage, child born before 2008 | 185 EUR/year | Child allowance depends on child benefit attribution and birth year. |
| Kinderzulage, child born from 2008 onward | 300 EUR/year | Higher allowance for post-2007 children. |
| Berufseinsteigerbonus | 200 EUR once | One-time extra allowance for eligible under-25 savers; not a recurring annual allowance. |
| Career-starter age test | Under 25 at the start of the contribution year | Implementation should use beginning-of-year age, not generic current age. |
| Full-allowance base contribution | 4% of prior-year relevant income | Relevant income depends on the eligibility group; for GRV employees, previous-year pension-insurable pay is the usual model input. |
| Maximum required own contribution logic | 2,100 EUR cap including allowances | Formula should be `max(60, min(4% * relevantIncome, 2100) - allowanceEntitlement)`. |
| Sockelbetrag | 60 EUR/year | Minimum annual own contribution in the statutory formula. |
| Allowance proration | Own contribution / Mindesteigenbeitrag | Applies when own contributions are below the required minimum. |
| Partial capital payout | Up to 30% at payout start | Permitted only at the beginning of payout; remaining capital must stay in certified payout. |
| Payout taxation | Sec. 22 Nr. 5 EStG | Fully taxable for benefits based on subsidized contributions / allowances; mixed funded and unfunded capital is more nuanced. |

Sources: EStG Secs. 10a, 22 Nr. 5, 79-93; AltZertG Sec. 1; official ZfA / Deutsche Rentenversicherung Riester information; BMF private-old-age-provision tax guidance.

## Product And Eligibility Scope

### Certified Riester contract

Riester benefits require a certified Altersvorsorgevertrag. AltZertG Sec. 1 sets the central product shape: contributions serve old-age provision, benefits are generally paid as lifelong old-age benefits or certified payout arrangements, and partial capital at payout start is limited.

For the calculator, this means Riester is not a normal ETF depot and not an ordinary private pension insurance. It is locked, subsidized retirement provision with certification constraints, provider rules, transfer rules, and harmful-use consequences.

### Direct eligibility

EStG Sec. 10a and Sec. 79 define the eligible-person architecture. Typical directly eligible groups include people subject to German statutory pension insurance, civil servants / judges / soldiers and similar public-service groups, and other statutory categories where the law treats them as eligible. The exact group list matters because the relevant income for Sec. 86 can differ.

Current tool implication:

- A first-pass boolean `directlyEligible` is acceptable for a calculator assumption, but it hides important groups and data-consent requirements.
- The UI should not imply that every taxpayer can receive Riester allowances.
- If the app later supports self-employed users, civil servants, mini-job cases, parental leave, unemployment benefits, or professional pension schemes, eligibility needs more structure than a single boolean.

### Indirect spouse eligibility

EStG Sec. 79 includes spouse / civil-partner mechanics for people who are not directly eligible but can receive an allowance through a directly eligible spouse under statutory conditions. This is part of the old Riester architecture and affects allowance entitlement and minimum contribution logic.

Current tool implication:

- The present `RiesterEligibility` model has no indirect-spouse field. It only models directly eligible savers.
- That is fine if the app labels the product as a simplified direct-eligibility model, but it is a gap for household / married cases.

## Contribution Phase Rules

### Grundzulage

EStG Sec. 84 sets the basic allowance at 175 EUR/year. It is granted at full amount when the saver is eligible and meets the required own contribution. If the minimum contribution is not met, the allowance is reduced under Sec. 86.

Tool formula:

```text
grundzulageFull = directlyEligible ? 175 : 0
grundzulageActual = grundzulageFull * prorationFactor
```

### Kinderzulage

EStG Sec. 85 sets the child allowance by child birth year:

- 185 EUR/year for a child born before 2008.
- 300 EUR/year for a child born after 2007.

The entitlement depends on child benefit attribution. In ordinary cases, the allowance is linked to the parent who receives Kindergeld, with statutory assignment and transfer rules for parents.

Tool implications:

- The birth-year split is essential and should remain in constants.
- A robust UI needs an "eligible children for Riester / child benefit attribution" input, not only a general `childBirthYears` list.
- For married parents, a future household model should support assignment of child allowances between spouses.

### Berufseinsteigerbonus

EStG Sec. 84 grants an additional 200 EUR once to eligible savers who have not yet reached age 25 at the beginning of the relevant contribution year. It is a one-time increase, not an annual allowance stream.

Tool implications:

- The bonus should appear only in the first eligible contribution year if not already used.
- A long projection should not add 200 EUR every year.
- The age test should be "under 25 at the beginning of the contribution year"; using contract-start age is a reasonable shortcut only if the input explicitly means first contribution year age.

### Mindesteigenbeitrag

EStG Sec. 86 defines the own contribution needed for the full allowance. For the common employee model, the practical formula is:

```text
fullAllowanceEntitlement = grundzulage + kinderzulage + careerStarterBonusForThatYear
grossRequiredInclAllowances = min(0.04 * priorYearRelevantIncome, 2100)
ownContributionRequired = max(60, grossRequiredInclAllowances - fullAllowanceEntitlement)
```

Notes:

- The 2,100 EUR limit is part of the minimum-contribution logic, not only the Sec. 10a deduction cap.
- Relevant income is generally prior-year income, not current-year projected salary.
- The allowance entitlement subtracted in the formula should be the allowance claim for that contribution year.
- Where income is very low or allowances exceed the 4% value, the 60 EUR Sockelbetrag becomes decisive.

Example:

```text
Relevant income: 75,000 EUR
4% income: 3,000 EUR
Cap including allowances: min(3,000, 2,100) = 2,100 EUR
No children, Grundzulage 175 EUR
Required own contribution: 2,100 - 175 = 1,925 EUR/year
```

### Allowance proration

If the own contribution is below the required minimum, EStG Sec. 86 reduces the allowances in proportion to the contribution actually paid.

Formula sketch:

```text
if annualOwnContribution >= ownContributionRequired:
  prorationFactor = 1
else:
  prorationFactor = annualOwnContribution / ownContributionRequired

actualAllowance = fullAllowanceEntitlement * prorationFactor
```

The relationship between contributions below the 60 EUR Sockelbetrag and the statutory reduction formula should be checked against ZfA administrative practice before hard-coding a zero-allowance rule. The conservative user-facing message is simple: below 60 EUR/year the saver is below the statutory minimum contribution.

## Sec. 10a Special-Expense Deduction And Guenstigerpruefung

Sec. 10a EStG allows qualifying Riester contributions plus the related allowance to be deducted as special expenses up to 2,100 EUR/year. The tax office then performs the Guenstigerpruefung:

1. Compute the income-tax effect of the Sec. 10a deduction.
2. Compare that tax effect with the allowance entitlement.
3. If the deduction is more favorable, the saver gets the excess tax reduction; the allowance itself is already paid into the contract.

Tool formula:

```text
specialExpenseBase = min(annualOwnContribution + actualAllowance, 2100)
taxSaving = tax(zvE) - tax(zvE - specialExpenseBase)
extraTaxRefund = max(0, taxSaving - actualAllowance)
monthlyNetCost = monthlyOwnContribution - extraTaxRefund / 12
```

Implementation nuance:

- For a precise annual model, the Guenstigerpruefung should use the allowance legally due for that year.
- In a multi-year projection, child allowances and career-starter bonus can vary by year. A single steady-state allowance value is a simplification.

## Accumulation And Certification Constraints

Riester contracts are certified retirement products. The model should treat these points as qualitative constraints unless the UI adds detailed contract inputs:

- Capital is generally locked for retirement use.
- Provider fees, guarantee mechanics, and old-law contribution guarantees can materially reduce expected returns.
- Wohn-Riester, provider transfers, divorce / Versorgungsausgleich, and inheritance cases create special tax and subsidy outcomes.
- If the user has existing capital, the tool should distinguish funded / subsidized capital from purely unfunded capital if it later wants exact Sec. 22 Nr. 5 payout taxation.

## Payout Phase Rules

### Sec. 22 Nr. 5 EStG taxation

Sec. 22 Nr. 5 EStG taxes benefits from Riester / certified old-age contracts according to the funding history. For a simple model where contributions and allowances were subsidized under Sec. 10a / Secs. 79 ff. EStG, full ordinary-income taxation of benefits is a practical approximation.

Important nuance:

- If the contract contains non-subsidized contributions or returns attributable to non-subsidized capital, Sec. 22 Nr. 5 has special differentiation rules. A fully taxable treatment can overstate tax on mixed-funded contracts.
- The app currently models Riester as fully taxable through `otherTaxableAnnual`, which is appropriate only for the fully subsidized simplification.

### Partial capital payout up to 30%

AltZertG Sec. 1 permits a partial capital payout of up to 30% at the beginning of the payout phase. This is not harmful use when done within the certified contract rules. The paid capital remains taxable under Sec. 22 Nr. 5 to the extent it is based on subsidized capital.

Tool implications:

- Cap `partialCapitalPct` at 0.30.
- Allow the partial capital only at payout start, not arbitrary withdrawals.
- Do not apply bAV 1/120 KV/PV spreading or Sec. 34 Fuenftelregelung to the Riester partial lump sum in the simple model.

### Harmful use

EStG Sec. 93 governs harmful use. In broad terms, if subsidized Riester capital is used outside the permitted old-age / certified-use framework, allowances and Sec. 10a tax benefits can become repayable and the contract may trigger additional tax consequences. Wohn-Riester has its own special mechanics.

Tool implication:

- Treat harmful use as a qualitative warning unless a future feature explicitly models repayment of allowances, repayment of tax benefits, Wohnfoerderkonto taxation, provider reporting, and timing.

## Current Tool Fit And Gaps

Already aligned:

- Riester is modeled as a separate Schicht-2 / Altvertrag product, not as ETF or Schicht-3 private insurance.
- Constants for 2026 Grundzulage, child allowances, career-starter bonus, 60 EUR Sockelbetrag, 4% factor, and 2,100 EUR cap exist in `src/rules/de2026.ts`.
- Child allowance birth-year split is implemented in `computeRiesterChildAllowance`.
- Allowances are prorated when contributions fall short.
- Sec. 10a deduction and Guenstigerpruefung are modeled as an extra tax refund above allowances.
- Payouts route through the retirement-tax pipeline as Sec. 22 Nr. 5-style ordinary taxable income.
- Partial capital percentage is capped at 30% in validation and simulation.
- Harmful use is not numerically modeled, which is acceptable if surfaced as a warning.

Potential gaps / follow-up work:

- Fixed in 2026-04-28 audit: Mindesteigenbeitrag cap placement now applies the `min(..., 2100)` cap in the Sec. 86 formula before subtracting allowances.
- Career-starter bonus recurrence: current funding is computed once and annualized over all projection years. If `careerStarterBonusUsed` is false and the age test passes, the one-time 200 EUR bonus can be treated like a recurring annual allowance in accumulation and `taxAndSvSavings`.
- Prior-year relevant income: current code uses `salaryResult.annualGross` from the current modeled salary and caps it at the pension BBG. Sec. 86 uses prior-year relevant income and has eligibility-group-specific definitions.
- Eligibility is simplified to `directlyEligible`. Indirect spouse eligibility and special eligible groups are not modeled.
- Child allowance attribution is simplified. The engine uses all `profile.childBirthYears` for directly eligible savers and does not model Kindergeld recipient / parent assignment.
- The Sec. 10a / payout model assumes one steady-state annual allowance. Real child eligibility and the career-starter bonus vary over time.
- Payout taxation assumes fully subsidized capital. Existing capital and contributions above the deductible / subsidized band may need funded-vs-unfunded tracking for exact Sec. 22 Nr. 5 taxation.
- The current `netRiesterPayout` uses the voluntary-GKV Sec. 240 path for all GKV users. That may be intentionally conservative, but it should be documented separately because Riester is not a bAV Versorgungsbezug under Sec. 229 SGB V.
- Filing status in `calculateRetirementTax` is effectively single only. Married / joint-assessment Riester Guenstigerpruefung and retirement tax are not modeled.

## Implementation Audit Hooks

Check these functions and constants in a later code audit:

| File | Hook | What to verify |
|---|---|---|
| `src/rules/de2026.ts` | `riester.grundzulage` | 175 EUR/year from EStG Sec. 84. |
| `src/rules/de2026.ts` | `riester.childAllowancePre2008`, `childAllowancePost2007` | 185 / 300 EUR split from EStG Sec. 85. |
| `src/rules/de2026.ts` | `riester.careerStarterBonus`, `careerStarterMaxAge` | 200 EUR once; under-25 test should map to age <= 24 at beginning of contribution year. |
| `src/rules/de2026.ts` | `riester.minEigenbeitragPct`, `annualCapInclAllowances`, `sockelbetrag` | Sec. 86 formula requires 4%, 2,100 EUR cap including allowances, and 60 EUR Sockelbetrag. |
| `src/engine/riester.ts` | `computeRiesterChildAllowance` | Birth-year split is right; caller should supply only Riester-eligible / assigned children. |
| `src/engine/riester.ts` | `computeFullRiesterAllowances` | Direct-only eligibility, career-starter one-time treatment, and child assignment simplification. |
| `src/engine/riester.ts` | `calculateRiesterFunding` | Verify Mindesteigenbeitrag formula: `min(4% * relevantIncome, 2100) - allowances`, not `4% * relevantIncome - allowances`. |
| `src/engine/riester.ts` | `calculateRiesterFunding` | Verify prior-year relevant income source rather than current gross salary. |
| `src/engine/riester.ts` | `calculateRiesterFunding` | Check whether below-60-EUR contributions should zero allowances or prorate under the Sec. 86 ratio. |
| `src/engine/riester.ts` | `calculateRiesterFunding` | Guenstigerpruefung should compare tax saving with actual allowance entitlement for that year. |
| `src/engine/products/riester.ts` | `monthlyProductContribution` | Ensure career-starter bonus is not paid into the contract every projected year. |
| `src/engine/products/riester.ts` | `taxAndSvSavings` | Annualized allowances and Guenstiger benefit should not multiply one-time benefits by all years. |
| `src/engine/products/riester.ts` | `partialPct = Math.min(..., 0.30)` | Correct cap for permitted partial capital payout at payout start. |
| `src/engine/riester.ts` | `netRiesterPayout` | Sec. 22 Nr. 5 fully taxable route for subsidized capital; KV/PV assumption should be explicit. |
| `src/engine/riester.ts` | `afterTaxRiesterLumpSum` | Partial lump sum taxed as ordinary Sec. 22 Nr. 5 income in payout year; no Sec. 34 or 1/120 bAV spreading. |
| `src/engine/retirementTax.ts` | `otherTaxableAnnual` | Riester and AVD route here; verify deduction / filing-status limitations. |
| `src/engine/products/riester.validation.ts` | `partialCapitalPct` | Validation cap at 0.30. |
| `src/engine/products/riester.test.ts` | Mindesteigenbeitrag examples | Tests now expect 75,000 EUR income to require 1,925 EUR/year for a no-child saver with full Grundzulage. |
| `src/data/defaultScenario.ts` | `defaultRiesterAssumptions` | Default `careerStarterBonusUsed: false` is harmless at age 28 but risky if user age / contract-start age is changed below 25. |

## Source Notes

Primary / official sources used:

- EStG Sec. 10a, additional special-expense deduction for old-age provision and Guenstigerpruefung: https://www.gesetze-im-internet.de/estg/__10a.html
- EStG Sec. 22, including Nr. 5 taxation of Leistungen from Altersvorsorgevertraege: https://www.gesetze-im-internet.de/estg/__22.html
- EStG Sec. 79, allowance-eligible persons / spouse mechanics: https://www.gesetze-im-internet.de/estg/__79.html
- EStG Sec. 82, Altersvorsorgebeitraege definition: https://www.gesetze-im-internet.de/estg/__82.html
- EStG Sec. 84, Grundzulage and Berufseinsteigerbonus: https://www.gesetze-im-internet.de/estg/__84.html
- EStG Sec. 85, Kinderzulage: https://www.gesetze-im-internet.de/estg/__85.html
- EStG Sec. 86, Mindesteigenbeitrag and allowance reduction: https://www.gesetze-im-internet.de/estg/__86.html
- EStG Sec. 90, allowance application / procedure context: https://www.gesetze-im-internet.de/estg/__90.html
- EStG Sec. 93, harmful use: https://www.gesetze-im-internet.de/estg/__93.html
- AltZertG Sec. 1, certification requirements and payout / partial-capital framework: https://www.gesetze-im-internet.de/altzertg/__1.html
- Deutsche Rentenversicherung, Riester-Rente overview and allowance explanation: https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/Zusaetzliche-Altersvorsorge/Riester-Rente/riester-rente_node.html
- BZSt / ZfA, Riester / Altersvorsorgezulage information and administrative role: https://www.bzst.de/DE/Privatpersonen/Altersvorsorge/altersvorsorge_node.html
- BMF / EStH 2023, "Steuerliche Foerderung der privaten Altersvorsorge", BMF-Schreiben vom 5. Oktober 2023: https://ao.bundesfinanzministerium.de/esth/2023/C-Anhaenge/Anhang-01a/I/anhang-1a-I-neu.html

Secondary explanatory sources, if used later, should be labeled clearly and should not override the statutory text above.
