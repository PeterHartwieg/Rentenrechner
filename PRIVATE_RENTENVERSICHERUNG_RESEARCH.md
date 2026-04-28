# Private Rentenversicherung Contract Research Germany 2026

Last researched: 2026-04-28

This note summarizes German private pension-insurance rules that matter for the calculator model: product families, contribution-phase tax treatment, payout taxation, health / care insurance treatment, costs, guarantees, liquidity, and differences between ungefoerderte private Rentenversicherung, Basisrente / Ruerup, and Riester.

It is not legal, tax, or financial advice. The goal is to make the assumptions in the tool explicit and keep future implementation work source-backed.

## Executive Summary For The Tool

- "Private Rentenversicherung" is not one tax regime. The calculator should distinguish at least:
  - Schicht 1: Basisrente / Ruerup, including fondsgebundene Basisrente.
  - Schicht 2: Riester / certified Altersvorsorgevertrag.
  - Schicht 3: ungefoerderte private Rentenversicherung / private Fondspolice.
- The current product "Private Versicherung" mostly models Schicht 3 capital payout taxation:
  - pre-2005 qualifying contracts: income-tax-free capital payout.
  - post-2004 contracts with runtime >= 12 years and payout age >= 62: half the gain taxable at the personal income-tax rate.
  - otherwise: full gain taxed as capital income / Abgeltungsteuer.
- For Schicht 3 lifelong private annuities, the tool should not use the same gain-ratio / Halbeinkuenfte logic as capital payouts. Lifelong private Leibrenten are generally taxed only with the Ertragsanteil under Sec. 22 EStG. At age 67, the Ertragsanteil is 17%; at age 62 it is 21%.
- Basisrente is economically and legally closer to the statutory pension than to a flexible private policy: contributions are deductible as Altersvorsorgeaufwendungen, but only within the shared Schicht-1 cap; payout must be lifelong pension, no normal lump sum, no free surrender, no lending / sale / inheritance like a depot.
- 2026 Basisrente / Schicht-1 deduction values:
  - Maximum Altersvorsorgeaufwendungen: 30,826 EUR/year single; 61,652 EUR/year jointly assessed.
  - 100% deductible since 2023.
  - The cap is shared with employee and employer statutory-pension contributions, professional pension schemes, agricultural pension funds, and Basisrente contributions.
  - For a pension starting in 2026, the taxable pension share is 84.0%; the taxable share rises by 0.5 percentage points per new cohort until 100% in 2058.
- 2026 old Riester rules:
  - Basic allowance: 175 EUR/year.
  - Child allowance: 185 EUR/year for children born before 2008; 300 EUR/year for children born after 2007.
  - One-time career-starter bonus: 200 EUR if eligible before age 25.
  - Full allowance generally requires minimum own contribution of 4% of prior-year relevant income, capped at 2,100 EUR including allowances, with a 60 EUR/year Sockelbetrag.
  - Special-expense deduction up to 2,100 EUR including allowances, with a Guenstigerpruefung.
- Health and care contributions differ strongly by retiree status:
  - KVdR / compulsory statutory retirees: ungefoerderte private Rentenversicherung and Basisrente are normally not bAV Versorgungsbezuege and do not trigger the bAV KV/PV burden.
  - Voluntary statutory retirees: Sec. 240 SGB V can include broad income types, so private pensions / private annuities can become KV/PV-relevant up to the BBG.
  - PKV retirees: no statutory KV/PV deduction in the model.
- Product costs and Rentenfaktor are often the decisive variables. Consumer sources are consistently skeptical of high-cost private policies; the tool should avoid displaying "tax advantage" as the main result without also showing costs, low guaranteed Rentenfaktor risk, surrender / paid-up scenarios, and ETF opportunity cost.

## 2026 Constants

| Item | 2026 value | Tool effect |
|---|---:|---|
| Schicht-1 deduction cap, single | 30,826 EUR/year | Maximum deductible Altersvorsorgeaufwendungen before subtracting statutory / professional pension contributions. |
| Schicht-1 deduction cap, jointly assessed | 61,652 EUR/year | Doubled cap for spouses / civil partners assessed together. |
| Deductible share for Schicht-1 contributions | 100% | Contributions within the cap are fully deductible since 2023. |
| Basisrente earliest normal payout | Usually age 62 for newer contracts | UI should warn if Basisrente payout is modeled before 62, except legacy / statutory special cases. |
| Basisrente / statutory-pension taxable share for 2026 pension start | 84.0% | Applies to new 2026 cohort under Sec. 22 EStG cohort table. |
| Full cohort taxation year | 2058 | New cohorts reach 100% taxable share in 2058. |
| Private Leibrente Ertragsanteil at age 62 | 21% | Taxable share of each payment for ungefoerderte private lifelong annuity. |
| Private Leibrente Ertragsanteil at age 67 | 17% | Better default for current retirement-age examples. |
| Private Leibrente Ertragsanteil at age 70 | 15% | Useful for delayed annuity starts. |
| Schicht-3 capital payout half-income conditions | Contract runtime >= 12 years and payout after age 62 | If met, half the gain is taxed at the personal income-tax rate. |
| Old Schicht-3 contract boundary | Contract before 2005 | Potentially tax-free capital payout if old-law conditions are met; contract-specific flag required. |
| Riester special-expense cap | 2,100 EUR/year incl. allowances | Cap for Sec. 10a EStG Guenstigerpruefung. |
| Riester basic allowance | 175 EUR/year | Added to contract if full allowance conditions are met. |
| Riester child allowance | 185 EUR/year before-2008 child; 300 EUR/year after-2007 child | Depends on child benefit attribution and allowance assignment. |
| Riester career-starter bonus | 200 EUR one-time | For eligible savers under 25 at the start of the contribution year. |
| Riester minimum own contribution | 4% of prior-year relevant income minus allowances, max 2,100 EUR, min 60 EUR | Needed for allowance reduction logic. |
| Riester current capital guarantee | At start of payout, paid contributions plus allowances must be available | Main reason old Riester products often have low equity exposure. Reform may change this from 2027. |
| Riester partial capital option | Up to 30% at start of payout | Remaining funded capital must provide lifelong retirement income. |

Sources: EStG Secs. 10, 10a, 20, 22, 79, 82, 84, 85, 86; AltZertG Secs. 1 and 2; Deutsche Rentenversicherung / Riester-ZfA; BMF / Bundestag 2026 private-altersvorsorge reform pages; BaFin private Rentenversicherung; Verbraucherzentrale private Rentenversicherung.

## Product Families

| Product family | Core structure | Contribution tax | Payout tax | Liquidity / inheritance | Cost and risk notes | Tool implications |
|---|---|---|---|---|---|---|
| Ungefoerderte private Rentenversicherung / Schicht 3 | Private insurance contract funded from net income. Can be classic, fondsgebunden, hybrid, index policy, deferred annuity, or immediate annuity. | No special contribution deduction for retirement saving. Contributions are paid from net income. | Capital payout: Sec. 20 Abs. 1 Nr. 6 EStG gain taxation; half gain if 12-year / age-62 conditions met. Lifelong annuity: Ertragsanteil under Sec. 22 EStG. | Often has capital option, surrender value, paid-up option, and beneficiary options, but surrender can be costly and annuity phase may be much less inheritable. | High acquisition / distribution costs, annual wrapper fees, fund fees, guarantee drag, Rentenfaktor risk. | Current "Private Versicherung" should be renamed or explicitly labeled "Schicht 3". Add separate tax path for Leibrente Ertragsanteil. |
| Basisrente / Ruerup / Schicht 1 | Certified basic-pension contract; private provider but legally designed like a basic retirement pension. Can be classic or fondsgebunden. | Contributions deductible as Altersvorsorgeaufwendungen up to the shared Schicht-1 cap. Employee and employer statutory-pension contributions consume the cap. | Cohort taxation like statutory pension / Basisversorgung under Sec. 22 EStG. 2026 new pension cohort: 84% taxable. | No normal lump sum, no sale / lending / inheritance as free wealth, no normal surrender. Survivor / disability riders only within legal limits. | Tax deferral can be valuable for high marginal-tax savers, but illiquidity and costs are severe. | Needs its own product type. Do not use Schicht-3 capital-payout logic. Payout mode should be forced to Leibrente. |
| Riester / certified Altersvorsorgevertrag / Schicht 2 | Certified subsidized private retirement contract, often insurance, fund policy, bank savings plan, or Wohn-Riester. | Allowances plus possible special-expense deduction up to 2,100 EUR including allowances. Full allowance needs minimum own contribution. | Fully deferred taxation of funded benefits under Sec. 22 Nr. 5 EStG. Partial capital at start is taxable too. | Payout generally tied to retirement; up to 30% partial capital at start; remaining benefit lifelong. Harmful use triggers repayment / taxation rules. | Existing 100% contribution guarantee reduces return potential. Complex allowance rules and often high product costs. | Needs separate allowance / Guenstigerpruefung model. Do not approximate as Schicht 3. Watch 2027 reform. |
| Immediate annuity / Sofortrente | One-time premium converted immediately into lifelong private pension. Usually Schicht 3 unless Basisrente-like product. | No deduction for ordinary Schicht-3 immediate annuity. Voluntary statutory-pension contribution alternative may be deductible under Schicht 1. | Schicht-3 lifelong payments taxed by Ertragsanteil. | Capital is usually locked into insurer after annuity start; death benefits depend on guarantee period / refund option. | Key driver is Rentenfaktor / break-even age; consumer sources often compare unfavorably with voluntary statutory-pension points for eligible people. | Can be modeled with Leibrente and Ertragsanteil, but accumulation phase is one-time contribution, not monthly savings. |
| Capital life insurance / Kapitallebensversicherung | Savings plus death-benefit insurance; often used historically as old-age saving. | Modern contracts normally no retirement contribution deduction. | Capital payout follows Sec. 20 Abs. 1 Nr. 6 logic; old contracts may have tax-free treatment. | More death-benefit structure than pure annuity. | Bundles investment and risk protection, making cost attribution harder. | Avoid treating as pure retirement saving unless risk component is modeled or stripped out. |

## Schicht 3: Ungefoerderte Private Rentenversicherung

### Contribution phase

For ordinary private pension insurance, contributions are paid from already taxed income. There is normally:

- no salary-conversion effect,
- no social-security saving,
- no employer subsidy,
- no Sec. 10a allowance,
- no Sec. 10 Basisrente deduction.

The calculator's current comparison setup, where ETF, bAV, and private insurance are funded with the same monthly net outlay, is a reasonable Schicht-3 comparison framing. It should be explicit that the private policy does not receive bAV tax/SV savings; it is funded from the same net money that could go into an ETF depot.

### Capital payout tax

For contracts concluded after 2004, Sec. 20 Abs. 1 Nr. 6 EStG taxes the difference between insurance payout and paid contributions if the capital option / surrender / non-annuity payout is used.

Practical modeling:

- If runtime is at least 12 years and the payout is after age 62, only half of the gain is taxable at the personal income-tax rate.
- If those conditions are not met, the full gain is taxable as capital income, generally with 25% Abgeltungsteuer plus solidarity surcharge and, if applicable, church tax.
- The gain is `capital - paid contributions`, not the full payout.
- Fees reduce the capital and therefore indirectly reduce the taxable gain. They should not be separately deducted again unless the tax calculation explicitly supports it.

For old contracts before 2005, capital payouts can be tax-free if old-law conditions are met. The current app's user-confirmable `oldContractTaxFreeEligible` flag is appropriate because old contracts are fact-heavy: runtime, premium-payment period, contract terms, and capital-vs-annuity election matter.

### Lifelong annuity tax

If an ordinary private pension contract is paid as a lifelong Leibrente, the normal Schicht-3 tax treatment is Ertragsanteil taxation under Sec. 22 EStG, not gain-ratio taxation.

Important Ertragsanteil values:

| Age at annuity start | Taxable Ertragsanteil |
|---:|---:|
| 60-61 | 22% |
| 62 | 21% |
| 63 | 20% |
| 64 | 19% |
| 65-66 | 18% |
| 67 | 17% |
| 68 | 16% |
| 69-70 | 15% |

Tool implication: `netInsurancePayout` currently uses a gain-ratio approach for monthly private-insurance payouts. That can be a decent approximation for a capital drawdown / Zeitrente style, but it is not the statutory private Leibrente method. The Leibrente path should compute:

`taxableAnnual = grossAnnualPrivateAnnuity * ertragsanteilByStartAge`

then tax that taxable amount at the personal marginal rate in the retirement-tax pipeline.

### KV / PV

Schicht-3 private pension payouts are not bAV Versorgungsbezuege just because they are paid by an insurer.

Practical modeling:

- KVdR / Pflichtversicherte: ordinary private pension / private annuity should normally not create KV/PV contributions. Sec. 237 SGB V focuses on statutory pension, pension-like income / Versorgungsbezuege, and work income.
- Voluntary statutory members: Sec. 240 SGB V uses the member's entire economic capacity. Private pension income can become contribution-relevant up to the GKV/PV BBG.
- PKV members: no statutory KV/PV deduction.

The current app's high-level split is directionally right: private insurance has no KV/PV in KVdR mode, and voluntary GKV mode includes it as broader income. The lump-sum treatment is still a simplification because real voluntary-GKV contribution treatment can depend on timing, assessment practice, and total monthly income.

## Basisrente / Ruerup

### Contribution phase

Basisrente contributions are part of Altersvorsorgeaufwendungen under Sec. 10 EStG. In 2026 the maximum deductible amount is 30,826 EUR for a single person and 61,652 EUR for jointly assessed couples. Since 2023, the deductible share is 100%.

The cap is not a pure "Ruerup cap". It is shared with:

- statutory pension contributions, including the tax-free employer share,
- professional pension-scheme contributions,
- agricultural pension-fund contributions,
- certified Basisrente contributions.

Practical examples:

- Self-employed person with no statutory / professional pension contributions can potentially use the full cap for Basisrente.
- Employee below the RV BBG has both employee and employer statutory-pension contributions consuming the cap before any Basisrente contribution is useful.
- High earners may still have cap space, but the app needs to subtract statutory / professional contributions to avoid overstating the tax benefit.

### Contract restrictions

Basisrente is designed as basic retirement provision. For the tool, assume:

- lifelong monthly pension only,
- no normal lump-sum payout,
- no normal surrender / free withdrawal,
- no lending, sale, capitalization, or free inheritance,
- payout generally not before age 62 for newer contracts,
- survivor / disability benefits only if contractually included and legally permitted.

This is the central user-facing risk: Basisrente can look excellent during the contribution phase because of tax refunds, but the money is much less flexible than Schicht-3 insurance or an ETF depot.

### Payout tax

Basisrente payouts are taxed like statutory-pension / basic-pension income under the Sec. 22 EStG cohort table.

For the tool:

- Determine the calendar year pension starts.
- Look up the taxable share for that cohort.
- Tax that share through the retirement income-tax pipeline.
- Do not apply Schicht-3 Ertragsanteil.
- Do not apply Schicht-3 half-gain capital-payout logic.

Selected cohort values:

| Pension start year | Taxable share |
|---:|---:|
| 2026 | 84.0% |
| 2027 | 84.5% |
| 2030 | 86.0% |
| 2040 | 91.0% |
| 2050 | 96.0% |
| 2058 onward | 100.0% |

### KV / PV

For KVdR / Pflichtversicherte, Basisrente is generally not a bAV Versorgungsbezug. The app should not automatically apply the bAV KV Freibetrag / PV Freigrenze logic to it.

For voluntary statutory retirees, Basisrente payouts can be part of broader contribution-relevant income under Sec. 240 SGB V. For PKV retirees, no statutory KV/PV deduction should be modeled.

## Riester / Certified Altersvorsorgevertrag

### Contribution phase

Riester uses allowances plus possible special-expense deduction. The model needs both, because the best result depends on income, children, and marginal tax rate.

Core 2026 old-law values:

- Grundzulage: 175 EUR/year.
- Kinderzulage: 185 EUR/year for each child born before 2008.
- Kinderzulage: 300 EUR/year for each child born after 2007.
- Berufseinsteiger-Bonus: one-time 200 EUR for eligible savers who have not yet reached age 25 at the start of the contribution year.
- Mindesteigenbeitrag for full allowance: 4% of prior-year relevant income, capped at 2,100 EUR including allowances, minus allowances.
- Sockelbetrag: 60 EUR/year.
- Special-expense deduction: up to 2,100 EUR/year including allowances, with Guenstigerpruefung. If the tax saving is higher than the allowances, the tax office grants the excess tax effect while the allowance remains part of the contract funding.

Tool formula sketch:

1. Determine direct or indirect eligibility.
2. Compute allowance entitlement from adult, child, and career-starter inputs.
3. Compute full-allowance minimum own contribution:

`max(60, min(0.04 * priorYearRelevantIncome, 2100) - allowanceEntitlement)`

4. If own contribution is below the minimum, prorate allowances.
5. Compute special-expense effect on `ownContribution + allowance`, capped at 2,100 EUR.
6. Compare tax effect against allowances and add only the excess as a tax refund benefit.

### Payout phase

Riester is deferred taxation. Benefits funded by allowances / special-expense deduction are generally fully taxable under Sec. 22 Nr. 5 EStG.

For the tool:

- Running Riester pension should be treated as fully taxable ordinary retirement income, not Ertragsanteil.
- Partial capital payout at start should be taxable too.
- Up to 30% partial capital is generally possible at the beginning of payout, with remaining capital used for lifelong income.
- Harmful use, surrender, or transfer rules are outside the current calculator unless a special scenario is added.

### 2027 reform watch item

As of 2026-04-28, the Bundestag has passed a reform of tax-subsidized private old-age provision for 2027, including an Altersvorsorgedepot and new guarantee-product logic. The Bundesrat process / final effective details should be checked before implementation. For the current 2026 calculator, old Riester rules still matter for existing and 2026 contracts.

Potential future tool impact:

- Product type may need "Altersvorsorgedepot" separate from insurance.
- Guarantee level may be 0%, 80%, or 100% depending on final product rules.
- Subsidy formula may move away from old fixed Riester allowances.
- Existing Riester contracts may have Bestandsschutz and transfer rules.

Do not implement the 2027 regime from this note alone. Re-check final promulgated law when adding it.

## Payout Modes And Tax Mapping

| Product / payout | Tax base | Tax route | KV/PV route |
|---|---|---|---|
| Schicht-3 capital payout, post-2004, 12 years + age 62 met | 50% of gain | Personal income-tax rate | KVdR no; voluntary GKV potentially yes; PKV no |
| Schicht-3 capital payout, post-2004, conditions not met | 100% of gain | Capital-income tax / Abgeltungsteuer | KVdR no; voluntary GKV potentially yes; PKV no |
| Schicht-3 capital payout, qualifying pre-2005 | 0% for income tax | Tax-free under old-law conditions | KVdR usually no; voluntary GKV potentially yes; PKV no |
| Schicht-3 lifelong Leibrente | Ertragsanteil by age | Personal income-tax rate on Ertragsanteil | KVdR no; voluntary GKV potentially yes; PKV no |
| Basisrente lifelong pension | Cohort taxable share | Sec. 22 basic-pension table | KVdR generally no bAV KV/PV; voluntary GKV potentially yes; PKV no |
| Riester running pension | Full funded benefit | Sec. 22 Nr. 5 EStG | Depends on retiree status; not bAV Freibetrag logic unless bAV Riester special case is explicitly modeled |
| Riester partial capital | Full funded benefit | Sec. 22 Nr. 5 EStG | Same retiree-status caveat |
| bAV Direktversicherung / Pensionskasse / Pensionsfonds | Full benefit for tax-favored contributions | Sec. 22 Nr. 5 EStG | bAV Versorgungsbezug; KV/PV rules from BAV_RESEARCH.md |

## Costs And Economic Drivers

The important cost drivers for private pension-insurance products are:

- Abschluss- / Vertriebskosten: often based on the planned gross contribution sum and charged over the first 5 years, 6 years, 10 years, or via other contract rules. This makes early surrender / contribution reduction painful.
- Contribution fees: percentage deducted from each premium.
- Fixed policy fees: hurt small monthly contributions disproportionately.
- Annual wrapper / administration fee: deducted from contract value.
- Fund costs: ETFs can be cheap, but active funds or managed baskets can add heavy ongoing drag.
- Guarantee cost: 80-100% nominal guarantees reduce equity exposure and can force low-return bond allocation.
- Rentenfaktor: monthly pension per 10,000 EUR capital. It dominates annuity economics and may differ between guaranteed, current, and projected values.
- Pension-phase costs: some policies deduct a percentage from each pension payment or use cautious annuity pricing.
- Biometric riders: disability, survivor, or death-benefit riders may be valuable, but they should be modeled separately from pure retirement saving.
- Tax wrapper benefit: for Schicht 3, the "tax advantage" is often only half-gain taxation on capital payout or Ertragsanteil taxation on annuity. It must be compared against higher product costs and ETF partial exemption / Vorabpauschale treatment.

### Concrete fee examples found

These are examples, not market averages. Use them to calibrate realistic input ranges and warning thresholds.

| Source / product example | Contribution setup | Acquisition / distribution cost | Contribution admin cost | Asset / fund cost | Pension-phase cost | Effektivkosten / impact |
|---|---:|---:|---:|---:|---:|---:|
| Verbraucherzentrale explanatory private-RV example, 2026 | Generic private pension explanation | Example mentions 6% of contribution sum, spread over 10 years | Not specified in extracted example | Not specified | Not specified | Used by Verbraucherzentrale to illustrate how strong cost drag can be over long terms. |
| AXA Relax Rente Comfort Plus cost-transparency deck, 2026 example | 100 EUR/month, 37-year contribution period | 2.50% of gross contribution sum = 1,110 EUR | 9.75% of annual contribution = 117 EUR/year | 0.70% p.a. of capital before cost surplus, 0.4764% p.a. after cost surplus; free investment OGC 0.25% p.a. | Not extracted in the shown example | Break-even against paid-in contributions after about 11 years at 4%/4% scenario, about 9 years at 4%/6% scenario. |
| Verbraucherzentrale cost-drag table for private Rentenversicherung | 100 EUR/month for 40 years | Included in effective-cost examples | Included | Included | Included | At 5% gross return, 2% p.a. Effektivkosten reduce the generated return by about 56%; at 3% cost drag, by about 75%. |
| Finanztip private Rentenversicherung article, 2026 | General market guidance | Varies | Varies | Varies | Varies | Most private pension contracts are viewed as too expensive; voluntary statutory-pension points can have a much higher comparable Rentenfaktor for eligible older savers. |
| GDV Effektivkosten explainer | General life-insurance product disclosure | Included in RIY | Included | Included | Included | Effektivkosten / Reduction in Yield show how many percentage points per year costs reduce return, including acquisition, administration, and fund costs. |

Concrete cost lines to support in the model:

- `acquisitionCostPct`: real examples include 2.50% and explanatory examples around 6% of planned contribution sum.
- `acquisitionCostSpreadYears`: examples can be 5-6 years, but 10-year spreading also appears in consumer examples.
- `contributionFee`: real examples include 9.75% of contributions.
- `annualAssetFee`: examples include 0.60-0.70% p.a. wrapper fees before external fund costs.
- `fundFee`: should be separated from wrapper fee eventually. The current model only has one annual asset fee, so users must add wrapper plus fund cost manually.
- `pensionPayoutFee`: should be added; annuity-stage charges can materially lower paid pension.
- `fixedMonthlyFee`: should remain; it is important for small contracts.
- `guaranteeLevelPct`: should be added; guarantees change expected return, not just risk.
- `guaranteedRentenfaktor` and `currentRentenfaktor`: should be separate; many offers display both.

### Effective-cost impact example

For intuition, assume a 28-year-old pays 200 EUR/month from net income into a Schicht-3 private Rentenversicherung until age 67. Assume 5.0% gross annual return before product costs for 39 years.

| Effektivkosten | Net return after costs | Capital at 67 | Capital lost vs no-cost 5% case |
|---:|---:|---:|---:|
| 0.0% | 5.0% | 280,048 EUR | 0 EUR |
| 0.5% | 4.5% | 248,497 EUR | 31,551 EUR |
| 1.0% | 4.0% | 220,932 EUR | 59,116 EUR |
| 1.5% | 3.5% | 196,828 EUR | 83,220 EUR |
| 2.0% | 3.0% | 175,733 EUR | 104,315 EUR |
| 2.5% | 2.5% | 157,253 EUR | 122,795 EUR |

This table ignores taxes, surrender values, guarantees, Rentenfaktor, and mortality pooling. It shows why small-looking annual cost differences dominate the long-run result.

## Rentenfaktor And Break-Even

Rentenfaktor is the monthly pension per 10,000 EUR of accumulated capital.

Example:

- Capital at retirement: 200,000 EUR.
- Rentenfaktor: 28 EUR/month per 10,000 EUR.
- Gross monthly pension: `200,000 / 10,000 * 28 = 560 EUR/month`.
- Gross annual pension: 6,720 EUR.
- Simple capital break-even before tax and without death benefits: `200,000 / 6,720 = 29.8 years`.
- If pension starts at 67, capital is recovered around age 97 before considering taxes, inflation, insurer surplus, guarantee periods, or survivor benefits.

The tool should display this kind of simple break-even warning for Leibrente mode. It is not an actuarial fair-value calculation, but it makes low Rentenfaktoren legible.

Recommended inputs:

- guaranteed Rentenfaktor,
- current / projected Rentenfaktor,
- annuity start age,
- pension guarantee period,
- survivor pension percent,
- death-benefit / refund option,
- pension indexation / surplus mode,
- pension-phase cost deduction.

## Liquidity, Surrender, Paid-Up Contracts, And Inheritance

- Schicht-3 private contracts are more flexible than Basisrente or bAV, but not as flexible as an ETF depot. Surrender values can be poor in the first years because acquisition costs are front-loaded.
- Many contracts allow contribution holidays, reductions, increases, or paid-up status, but these changes can trigger new costs, lower guarantees, or reduce the future Rentenfaktor.
- Basisrente is highly illiquid: no ordinary capital payout, no surrender value freely payable to the saver, and only limited survivor-benefit structures.
- Riester is locked to old-age provision; harmful use can trigger repayment / tax consequences. A 30% partial capital payout at retirement is materially different from full liquidity.
- In annuity phase, remaining wealth is usually not equivalent to inheritable ETF capital. Death benefits depend on Rentengarantiezeit, Beitragsrueckgewaehr, survivor pension, or other contract riders.

## Current Tool Fit And Gaps

Already aligned:

- The current "Private Versicherung" product represents an ungefoerderte Schicht-3 policy better than Basisrente or Riester.
- Post-2004 capital payout classification already checks contract runtime and payout age for the half-gain regime.
- Pre-2005 potential tax-free treatment is represented by a user-confirmable flag.
- Fees include annual asset fee, contribution fee, fixed monthly fee, acquisition cost percent, and acquisition-cost spread years.
- Payout modes include Leibrente, Zeitrente, Kapitalverzehr, and Rentenfaktor.
- KV/PV treatment distinguishes KVdR / voluntary GKV directionally for private-insurance payouts.

Potential gaps / follow-up work:

- Rename "Private Versicherung" to "Private Rentenversicherung (Schicht 3)" or add a product-type selector.
- Add separate product models for Basisrente and Riester. They should not reuse Schicht-3 tax logic.
- Fix private Leibrente taxation: use Ertragsanteil by annuity start age instead of gain-ratio / Halbeinkuenfte logic.
- Add Basisrente contribution deduction:
  - 2026 cap 30,826 EUR / 61,652 EUR,
  - subtract statutory / professional pension contributions,
  - apply 100% deductible share,
  - force lifelong pension payout,
  - apply Sec. 22 cohort taxation in payout.
- Add Riester contribution logic:
  - eligibility,
  - basic / child / career-starter allowances,
  - 4% minimum contribution with 60 EUR Sockelbetrag,
  - 2,100 EUR special-expense cap,
  - Guenstigerpruefung,
  - full deferred taxation under Sec. 22 Nr. 5,
  - 30% partial-capital limit.
- Add explicit health-insurance status for each product or a shared retirement GKV mode with clearer labels:
  - KVdR Pflichtmitglied,
  - voluntary GKV,
  - PKV.
- Add `guaranteeLevelPct`, `guaranteedRentenfaktor`, and `currentRentenfaktor`.
- Add pension-phase fee support.
- Add annual fund fee separate from wrapper asset fee.
- Add surrender / paid-up scenario, because private policies are often terminated before retirement and early-year cost drag is central.
- Add one-time premium support for immediate annuities / Sofortrente.
- Add break-even age display for Leibrente mode.
- Add warning when retirement age is below 62 for modern private pension insurance tax assumptions.
- Add reform watch for 2027 Altersvorsorgedepot / new subsidized private products once final law is in force and product details are available.

## Source Notes

- EStG Sec. 10: Basisrente / Altersvorsorgeaufwendungen definition, restrictions, and cap mechanism: https://www.gesetze-im-internet.de/estg/__10.html
- EStG Sec. 10a: Riester special-expense deduction / Guenstigerpruefung: https://www.gesetze-im-internet.de/estg/__10a.html
- EStG Sec. 20 Abs. 1 Nr. 6: private insurance capital payout gain taxation and half-gain conditions: https://www.gesetze-im-internet.de/estg/__20.html
- EStG Sec. 22: Basisrente cohort taxation and private Leibrente Ertragsanteil table: https://www.gesetze-im-internet.de/estg/__22.html
- EStG Sec. 79: Riester eligibility, including indirect spouse eligibility: https://www.gesetze-im-internet.de/estg/__79.html
- EStG Sec. 82: certified Altersvorsorgebeitrag definition: https://www.gesetze-im-internet.de/estg/__82.html
- EStG Sec. 84: Riester basic allowance and career-starter bonus: https://www.gesetze-im-internet.de/estg/__84.html
- EStG Sec. 85: Riester child allowance values: https://www.gesetze-im-internet.de/estg/__85.html
- EStG Sec. 86: Riester minimum own contribution and 60 EUR Sockelbetrag: https://www.gesetze-im-internet.de/estg/__86.html
- EStG Sec. 87: Riester allowance distribution across multiple contracts: https://www.gesetze-im-internet.de/estg/__87.html
- AltZertG Sec. 1: certified Riester / Altersvorsorgevertrag conditions, lifelong payout, age 62, guarantee and partial capital structure: https://www.gesetze-im-internet.de/altzertg/__1.html
- AltZertG Sec. 2: certified Basisrentenvertrag conditions: https://www.gesetze-im-internet.de/altzertg/__2.html
- AltZertG Sec. 2a: certified product cost structure: https://www.gesetze-im-internet.de/altzertg/__2a.html
- Deutsche Rentenversicherung / Riester-ZfA, state funding and allowance mechanics: https://riester.deutsche-rentenversicherung.de/DE/Lohnt-sich-Riester/Staatliche-Foerderung-fuer-Sie/staatliche-foerderung-fuer-sie
- Deutsche Rentenversicherung, 2026 social-security values including knappschaftliche RV BBG 124,800 EUR/year: https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2025/25-10-08-bundeskabinett-sv-rechengroessen-vo-2026.html
- Finanzverwaltung Bayern, Alterseinkuenfte-Rechner 2026 note on 30,826 EUR / 61,652 EUR deductible Altersvorsorgeaufwendungen: https://www.steuerberechnung.bayern.de/Alterseinkuenfte-Rechner/2026/aekr_formular.asp?VLG=1
- BMF, Rentenbesteuerung overview and 2026 Grundfreibetrag context: https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerliche_Themengebiete/Rentenbesteuerung/2021-04-28-Rentenbesteuerung-Eine-Frage-der-Gerechtigkeit.html
- BaFin, private Rentenversicherung product guidance and cost / payout factors: https://www.bafin.de/DE/Verbraucher/Versicherung/Produkte/Rentenversicherung/renten_artikel.html
- Verbraucherzentrale, private Rentenversicherung criticism, cost drag, guarantees, taxes, surrender notes: https://www.verbraucherzentrale.de/wissen/geld-versicherungen/altersvorsorge/private-rentenversicherung-zur-altersvorsorge-nicht-die-erste-wahl-13896
- Finanztip, private Rentenversicherung / Sofortrente / Rentenfaktor context: https://www.finanztip.de/private-rentenversicherung/
- GDV, Effektivkosten / Reduction in Yield explanation: https://www.gdv.de/gdv/themen/leben/effektivkosten-richtig-lesen-12442
- AXA, "Kosten verstehen" 2026 deck with private / bAV cost examples: https://entry.axa.de/axa-makler/pb/site/me-2022/get/documents_E-816278627/makler-extranet/AXA_Makler/Privat/Vorsorge/Private%20Altersvorsorge/Relax%20Rente/Kosten%20verstehen_2026.pdf
- SGB V Sec. 237: contribution-relevant income for compulsory statutory retirees: https://www.gesetze-im-internet.de/sgb_5/__237.html
- SGB V Sec. 240: contribution-relevant income for voluntary statutory members: https://www.gesetze-im-internet.de/sgb_5/__240.html
- AOK Arbeitgeber, 2026 Versorgungsbezug Freibetrag / Freigrenze and bAV-only KV Freibetrag note: https://www.aok.de/fk/tools/weitere-inhalte/beitraege-und-rechengroessen-der-sozialversicherung/beitragssaetze-bei-versorgungsbezuegen/
- Bundestag, 2026 reform of tax-subsidized private Altersvorsorge / Altersvorsorgedepot passed by Bundestag on 2026-03-27: https://www.bundestag.de/dokumente/textarchiv/2026/kw05-de-altersvorsorge-1136982
- BMF, reform of subsidized private old-age provision / Altersvorsorgereformgesetz draft and FAQ material: https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2025-12-01-Altersvorsorgereformgesetz/0-Gesetz.html
