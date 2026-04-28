# Altersvorsorgedepot 2027 Research Germany

Last researched: 2026-04-28

This note summarizes the planned German 2027 reform of tax-subsidized private old-age provision, especially the new `Altersvorsorgedepot`. It focuses on what matters for the calculator model: product types, eligibility, contribution limits, subsidies, tax treatment, eligible assets, guarantees, payout rules, costs, transfers, and implementation gaps.

It is not legal, tax, or financial advice. The goal is to make the assumptions in the tool explicit and keep future implementation work source-backed.

Important status caveat: as of 2026-04-28, this is not yet fully final law. The Bundestag passed the Altersvorsorgereformgesetz on 2026-03-27. The Bundesrat document states a 2026-05-08 deadline / consent step. Re-check the promulgated BGBl. version before implementing hard-coded 2027 constants.

## Executive Summary For The Tool

- The product is called `Altersvorsorgedepot` or, in standard-product form, `Standarddepot-Vertrag Altersvorsorge`.
- It is not a normal taxable ETF depot. It is a certified, locked, tax-subsidized old-age product under the reformed Altersvorsorgevertraege-Zertifizierungsgesetz / EStG framework.
- The reform keeps the basic old Riester architecture:
  - state allowances during accumulation,
  - special-expense deduction / Guenstigerpruefung,
  - deferred taxation of benefits under Sec. 22 Nr. 5 EStG,
  - harmful-use / transfer rules.
- But the subsidy formula changes materially from old Riester:
  - own contributions up to 360 EUR/year get 50% basic allowance,
  - own contributions from 360.01 EUR to 1,800 EUR/year get 25% basic allowance,
  - maximum basic allowance = 540 EUR/year for directly eligible savers,
  - career-starter bonus remains 200 EUR once for under-25 eligible savers,
  - child allowance is contribution-proportional: 100% of own contribution, max 300 EUR/year per eligible child,
  - full allowance requires only a 120 EUR/year minimum own contribution from 2027.
- The Sec. 10a special-expense amount changes to own contributions up to 1,800 EUR/year plus the related allowance. The contract annual own-contribution limit is higher: 6,840 EUR/year, but contributions above the subsidy/deduction band do not increase the allowance.
- New eligible groups include self-employed / freelancers / tradespeople under 67 with relevant income and tax return, and employed professional-pension-scheme members under conditions. This is broader than old Riester.
- Product categories matter:
  - no-guarantee `Altersvorsorgedepot`,
  - `Standarddepot-Vertrag Altersvorsorge` with special asset mix / cost rules,
  - guarantee products with 80% or 100% minimum capital at payout start,
  - payout-only products for transferred / Wohnfoerderkonto-related capital.
- The Standarddepot has a 1.0 percentage point Effektivkosten cap and may also be offered by a public provider via ordinance.
- Payout is not free drawdown like a normal brokerage account:
  - payout generally cannot start before age 65 or before a statutory/basic pension starts before 65,
  - payout may not first start after age 70,
  - up to 30% of capital can be paid outside monthly benefits at payout start,
  - remaining capital must be paid through certified monthly benefit structures: lifelong annuity / partly variable lifelong payments / payout plan ending no earlier than age 85.
- Current app implication: do not model the Altersvorsorgedepot as the existing ETF product, and do not fold it into Schicht-3 private insurance. It needs a separate product type.

## Legislative Status

| Date | Status | Tool effect |
|---|---|---|
| 2025-12-17 | Federal cabinet adopted the government draft. | Good enough for research history, not enough for implementation constants. |
| 2026-03-27 | Bundestag passed the reform with Finanzausschuss changes. | Current best basis for backlog / design. |
| 2026-04-17 | Bundesrat Drucksache 206/26 published the Bundestag-adopted version. | Use this as the working legal text for research, with caveat. |
| 2026-05-08 | Bundesrat deadline / consent step shown in Drucksache 206/26. | Re-check after this date before coding final behavior. |
| 2027-01-01 | Key EStG / AltZertG reform articles scheduled to enter into force. | Earliest new-product modeling year. |
| 2028-01-01 | Some later articles scheduled for 2028. | Watch certification / information-rule details. |

## 2027 Planned Constants And Rules

| Item | Planned value / rule | Tool effect |
|---|---:|---|
| Product start | New products planned from 2027-01-01 | Year selector / rules module needs 2027 regime. |
| Old Riester new contracts | No new old-model Riester contracts from 2027 | Existing contracts remain; new contracts use reformed regime. |
| Special-expense deduction cap | 1,800 EUR/year own contributions plus related allowance | Replaces old 2,100 EUR cap for new-regime contracts. |
| Annual contract own-contribution limit | 6,840 EUR/year | Contract input should allow higher contributions, but not give extra allowance above the subsidy band. |
| Minimum own contribution | 120 EUR/year | Required for allowances from 2027. |
| Basic allowance tier 1 | 50% of contributions up to 360 EUR/year | 360 EUR own contribution creates 180 EUR basic allowance. |
| Basic allowance tier 2 | 25% of contributions from 360.01 EUR to 1,800 EUR/year | Adds up to 360 EUR. |
| Maximum direct basic allowance | 540 EUR/year | At 1,800 EUR own contribution: 180 + 360 = 540 EUR. |
| Indirectly eligible spouse basic allowance | Max 175 EUR/year | Uses directly eligible spouse's funded contributions as calculation basis. |
| Career-starter bonus | 200 EUR once | For directly eligible savers under 25 at start of contribution year. |
| Child allowance | 100% of own contribution, max 300 EUR/year per child | Full 300 EUR child allowance can be reached at 300 EUR/year own contribution. |
| Guarantee product minimum | 80% or 100% of contributions plus allowances at payout start | Guarantee products are separate from no-guarantee depot. |
| No-guarantee depot | No minimum capital and no minimum performance during accumulation | Main difference from old Riester guarantee drag. |
| Standarddepot Effektivkosten cap | 1.0 percentage point | Must be modeled / displayed if product subtype is Standarddepot. |
| Eligible fund risk class | PRIIP SRI at most 5 for eligible OGAW / AIF / ELTIF | Tool asset assumptions should not allow arbitrary high-risk assets as certified default. |
| Standarddepot de-risking | High-risk OGAW max 50% five years before payout; max 30% two years before and at payout start, unless user requests different percentages | Needs glidepath / allocation logic. |
| Payout start window | Not before age 65 or earlier statutory/basic pension; not first after age 70 | Validate payout age. |
| Payout start choice | At least 5-year corridor; user gives notice at least 3 months before desired start | Qualitative warning unless modeling contract administration. |
| Partial capital at payout start | Up to 30% | Must cap lump-sum assumption. |
| Payout plan horizon | Ends no earlier than age 85 | Drawdown cannot simply use arbitrary `retirementEndAge`. |
| Payout plan recalculation | Monthly payout set initially and at regular intervals up to 3 years; at least 80% of remaining capital divided by remaining months | Needs dedicated payout schedule. |
| Transfer cost to other provider | Max 150 EUR within first 5 years; later / same provider / cost-change cases free | Needed for provider-change scenario. |
| New-provider transfer admin fee | Max 150 EUR one-time | New provider may charge; transferred subsidized capital cannot be used for new acquisition/distribution cost base. |

Sources: Bundesregierung FAQ; Bundestag page on the 2026-03-27 resolution; Bundesrat Drucksache 206/26.

## Product Categories

| Product category | Core structure | Guarantee | Investment scope | Payout | Tool implication |
|---|---|---|---|---|---|
| Altersvorsorgedepot-Vertrag | Certified tax-subsidized depot investing in eligible funds / public bonds under contract wrapper. | No minimum capital or minimum performance during accumulation. | OGAW / UCITS, open public AIF, ELTIF, euro public bonds, settlement account; fund PRIIP SRI max 5. | Certified old-age payout rules; not free ETF liquidation. | New product type. Reuse ETF accumulation mechanics only after adding subsidy, lock-up, transfer, and payout constraints. |
| Standarddepot-Vertrag Altersvorsorge | A standardized Altersvorsorgedepot with electronic contract option, two selected OGAW buckets, de-risking, and cost cap. | No guarantee, but built-in lower-risk/high-risk allocation mechanics. | One SRI 1-2 OGAW and one SRI 3-5 OGAW selected by provider; user chooses allocation or provider default applies. | Same certified payout rules. | Needs allocation/glidepath module and 1.0 pp RIY cap warning. |
| Guarantee product | Certified product with guaranteed minimum capital at payout start. | 80% or 100% of contributions plus allowances. | Provider-dependent; likely insurance / fund-hybrid products. | Leibrente / partial variable lifelong payments / payout plan. | Separate return assumptions because guarantee level materially changes expected return. |
| Payout-only product | Product used to pay out transferred or Wohnfoerderkonto-related capital. | 100% of transferred capital used for benefits. | Payout product rather than accumulation depot. | Certified payout only. | Later expansion; needed for transfer-to-payout-provider scenarios. |
| Existing old Riester contract | Pre-2027 certified contract. | Old contract terms / old 100% contribution guarantee may persist. | Existing product-specific. | Existing terms; may opt into new law under transitional rules. | Keep old Riester logic separate from new Altersvorsorgedepot logic. |

## Eligibility

The new rules keep classic directly eligible groups and expand eligibility.

Likely directly eligible groups include:

- compulsory members of German statutory pension insurance,
- civil servants / judges / soldiers and similar groups when required data-consent conditions are met,
- certain exempt employees and leave cases covered by the amended Sec. 10a wording,
- self-employed / freelancers / tradespeople under age 67 with Sec. 15 or Sec. 18 income and a tax return for the contribution year,
- employees under age 67 with Sec. 19 income who are compulsory members of a professional pension scheme and meet the data-consent requirement.

Indirect spouse eligibility remains, but the new text caps the indirectly eligible spouse's basic allowance at 175 EUR and ties calculation to the directly eligible spouse's funded contributions.

Tool implication: the app needs an eligibility selector, not just an employment-status toggle. For a first implementation, use explicit user inputs:

- directly eligible: yes/no,
- indirect spouse eligibility: yes/no,
- self-employed under 67 with tax return: yes/no,
- professional pension-scheme member: yes/no,
- data consent assumed: yes/no,
- eligible children for child allowance count.

## Contribution Phase

### Basic allowance

For directly eligible savers, the basic allowance is contribution-proportional:

| Own contribution | Basic allowance | Notes |
|---:|---:|---|
| 0 EUR | 0 EUR | Also fails 120 EUR minimum. |
| 120 EUR | 60 EUR | Minimum own contribution met. |
| 300 EUR | 150 EUR | Also enough to maximize one child's child allowance. |
| 360 EUR | 180 EUR | End of 50% tier. |
| 1,000 EUR | 340 EUR | 180 EUR + 25% of 640 EUR. |
| 1,800 EUR | 540 EUR | Maximum direct basic allowance. |
| >1,800 EUR | 540 EUR | No additional basic allowance. |

Formula:

```text
basicAllowance =
  contribution < 120 ? 0 :
  0.50 * min(contribution, 360)
  + 0.25 * max(0, min(contribution, 1800) - 360)
```

For directly eligible savers under 25 at the start of the contribution year, add the one-time 200 EUR career-starter bonus when not already used.

### Child allowance

For each eligible child with Kindergeld attribution, the planned child allowance is 100% of own contribution, capped at 300 EUR/year per child.

Formula sketch:

```text
childAllowance = eligibleChildCount * min(contribution, 300)
```

The Bundesregierung FAQ describes the policy outcome as full 300 EUR child allowance at a monthly saving of 25 EUR, i.e. 300 EUR/year.

### Minimum own contribution

From 2027, allowances require a 120 EUR/year minimum own contribution. This is much simpler than old Riester's 4% prior-year-income rule.

Tool implication:

- For 2026 old Riester, keep old 4% / 60 EUR Sockelbetrag logic.
- For 2027 new-regime products, use 120 EUR/year minimum.
- Do not mix old and new formulas in one product.

### Special-expense deduction

The new Sec. 10a amount is planned as own contributions up to 1,800 EUR/year plus the allowance due for those contributions. The old 2,100 EUR cap is no longer the right formula for new-regime contracts.

Modeling approach:

1. Compute own contributions eligible for deduction: `min(ownContribution, 1800)`.
2. Compute allowance entitlement.
3. Compute `specialExpenseBase = min(ownContribution, 1800) + allowanceEntitlement`.
4. Compute income-tax saving from deducting that base.
5. Run Guenstigerpruefung: only the tax effect above the allowance is an additional tax refund benefit, because the allowance already funds the contract.

Contributions above 1,800 EUR/year can still be contract contributions up to the 6,840 EUR/year contract limit, but they should not increase the allowance or Sec. 10a deduction under the researched draft.

## Accumulation Phase

### Eligible assets

The no-guarantee Altersvorsorgedepot can invest funded contributions, allowances, and accumulated returns in:

- OGAW / UCITS fund shares that may be distributed domestically and have PRIIP SRI at most 5,
- open public AIF shares under the named KAGB provisions with PRIIP SRI at most 5,
- open ELTIF shares with PRIIP SRI at most 5,
- euro-denominated public-sector bonds from German public issuers / guaranteed public-law institutions,
- euro-denominated bonds from euro-area member states, the EU, Euratom, EIB, or EFSF,
- a settlement account if part of the contract.

The provider selects investments unless the contract grants the user a choice from the agreed investment menu.

Tool implication: an ordinary ETF return input can approximate an OGAW equity allocation, but the product is not an arbitrary individual brokerage account. The model should distinguish:

- risk asset expected return,
- low-risk asset expected return,
- current allocation,
- planned glidepath / de-risking,
- fund TER,
- wrapper / provider fee,
- subsidy cashflows.

### Standarddepot glidepath

The Standarddepot has a specific two-bucket structure:

- one OGAW with risk class 1 or 2,
- one OGAW with risk class 3, 4, or 5,
- user can choose allocation or provider default applies,
- provider must replace funds that leave their required risk-class bands,
- five years before payout, high-risk bucket should be at most 50% of capital,
- two years before payout and at payout start, high-risk bucket should be at most 30% of capital,
- the contract partner can request different percentages.

Tool implication: a single `annualReturn` number is too crude for the Standarddepot. A credible model needs at least a simplified glidepath.

## Payout Phase

The Altersvorsorgedepot is locked old-age provision, not a free taxable depot.

Key payout constraints:

- Payout normally cannot start before age 65.
- Payout can start before age 65 if a statutory/basic pension starts before 65.
- Payout may not first start after age 70.
- If no start is agreed, post-2026 contracts default to age 65.
- Up to 30% of capital at payout start may be paid outside monthly benefits.
- Remaining capital must be used for certified monthly benefits.
- Monthly benefits can be:
  - full lifelong Leibrente, level or increasing,
  - 80% lifelong Leibrente plus remaining capital invested at the user's risk for variable lifelong payments,
  - payout plan ending no earlier than age 85, with regular recalculation at intervals up to three years.
- Up to 12 monthly benefits may be bundled into one payment.
- Kleinbetragsrente rules can allow small-benefit commutation.

Payout plan mechanics:

The draft describes a recurring recalculation where at least 80% of remaining capital at the date is divided by the number of months until the end of the payout plan. Residual capital can be paid at the end.

Tool implication:

- Do not use the generic ETF `retirementEndAge` drawdown formula for Altersvorsorgedepot.
- Add a dedicated payout mode:
  - `lifelong_annuity`,
  - `hybrid_80_lifelong_plus_variable`,
  - `certified_payout_plan_to_age_85_plus`,
  - `partial_capital_30pct_plus_monthly`.
- Cap partial lump sum at 30%.
- Validate start age 65-70 unless an early statutory pension flag is active.
- For payout plan, ensure end age >= 85.

## Tax And KV/PV Treatment

### Income tax

The reform keeps deferred taxation under Sec. 22 Nr. 5 EStG for tax-subsidized Altersvorsorgevertraege. Benefits funded through allowances / Sec. 10a deduction are taxable in the payout phase.

Tool implication:

- Do not tax accumulation gains annually like normal ETF Vorabpauschale inside the certified product.
- Do not apply ETF partial exemption to the participant's payout tax calculation unless final law creates a split for unfunded contributions. The researched material treats benefits as Sec. 22 Nr. 5 deferred-tax benefits.
- For monthly payouts, route benefits through the retirement income-tax pipeline as fully taxable subsidized-private-pension income.
- For 30% partial capital, tax as Sec. 22 Nr. 5 income, not as capital-gains-only ETF exit.

### Health and care insurance

The researched sources do not create a bAV-style Versorgungsbezug rule for Altersvorsorgedepot payouts. Until later guidance says otherwise:

- KVdR / compulsory statutory retirees: do not automatically apply bAV Versorgungsbezug KV/PV logic.
- Voluntary statutory retirees: treat as broader contribution-relevant income under Sec. 240 SGB V, analogous to other private pension income.
- PKV retirees: no statutory KV/PV deduction in the calculator.

This should remain a documented assumption and be re-checked when official health-insurance guidance for the new product exists.

## Transfers, Existing Riester, And Lock-Up

- Existing old Riester contracts continue; no automatic cancellation or conversion.
- From 2027, no new old-model Riester contracts are planned.
- Existing savers can voluntarily switch / transfer into the new regime.
- Transitional text allows a saver to elect the new law for all existing contracts; new post-2026 certified contracts can trigger current-law treatment across contracts.
- Transfers to another provider are part of the certification framework.
- If transferred within the first five years, the old provider may charge at most 150 EUR; later, same-provider, or certain cost-change cases are free.
- New provider may charge a one-time administration fee up to 150 EUR.
- Transferred subsidized capital cannot be used as a base for new acquisition / distribution costs.
- The contract can be made paid-up and can be terminated only for transfer to another certified contract or certain housing / Wohn-Riester uses, not as free withdrawal without harmful-use consequences.

## Costs And Product Information

Cost rules are central to the reform.

- Standarddepot Effektivkosten are capped at 1.0 percentage point.
- Providers must calculate Effektivkosten using a PRIIP-like total-cost-indicator method.
- Product information must show:
  - product category,
  - certification number,
  - guaranteed payout amount where relevant,
  - Effektivkosten,
  - costs in accumulation and payout phases,
  - total risk indicator,
  - expected payout under performance scenarios,
  - transfer consequences.
- Annual information must show:
  - use of contributions and allowances,
  - capital formed,
  - actual costs in the prior contribution year,
  - generated returns,
  - guaranteed and expected benefits under continued-paid and paid-up assumptions,
  - ESG information.
- Payout information must be provided no earlier than two years before payout start and must show form, amount, duration, dynamic / variable elements, and payout-phase costs. Unlisted payout-phase costs are not owed.
- Cost increases require advance notice and before/after comparison.

Tool implication:

- The app should be able to ingest real product information later:
  - Effektivkosten,
  - SRI,
  - performance scenarios,
  - actual cost line items,
  - guaranteed vs projected benefits,
  - paid-up scenario values.
- For the Standarddepot, the app should warn if configured RIY exceeds 1.0 pp.

## Current Tool Fit And Gaps

Already aligned:

- ETF accumulation machinery can approximate a no-guarantee investment sleeve after adding subsidy and lock-up logic.
- Existing retirement tax pipeline can be reused for Sec. 22 Nr. 5 payout taxation.
- Existing bAV / private insurance payout-mode work gives a starting point for Leibrente and payout-plan concepts.
- Existing RIY backlog items are directly relevant because the Standarddepot has a legal Effektivkosten cap.

Potential gaps / follow-up work:

- Add a 2027 rules module instead of forcing 2027 values into `de2026.ts`.
- Add product id / model for `altersvorsorgedepot`.
- Add old-Riester vs new-Altersvorsorgedepot regime switch.
- Add eligibility model for direct, indirect, self-employed, and professional-pension-scheme cases.
- Add 2027 allowance formulas:
  - basic allowance tiers,
  - child allowance,
  - career-starter bonus,
  - 120 EUR minimum own contribution.
- Add 2027 Sec. 10a deduction / Guenstigerpruefung with 1,800 EUR own-contribution cap plus allowance.
- Add 6,840 EUR annual contribution limit separate from the subsidy/deduction limit.
- Remove ETF Vorabpauschale / normal capital-gains tax from certified-depot accumulation.
- Add deferred Sec. 22 Nr. 5 payout tax for monthly payout and 30% partial capital.
- Add eligible-asset and risk-class assumptions.
- Add Standarddepot two-bucket glidepath and 1.0 pp RIY cap.
- Add guarantee-product branch with 80% / 100% capital guarantee.
- Add payout constraints:
  - start age 65-70,
  - early pension exception,
  - 30% partial capital cap,
  - payout plan to at least age 85,
  - recurring payout recalculation.
- Add provider-transfer / paid-up / cost-change scenario.
- Add explicit "pending final law" warning until Bundesrat / BGBl. status is confirmed.

## Source Notes

- Bundesregierung FAQ, reform status, subsidy formula, Standarddepot cost cap, broader eligibility, old Riester transition, 2027 start: https://www.bundesregierung.de/breg-de/service/fragen-und-anworten/reform-private-altersvorsorge-2400072
- Deutscher Bundestag, 2026-03-27 resolution and Finanzausschuss changes: https://www.bundestag.de/dokumente/textarchiv/2026/kw05-de-altersvorsorge-1136982
- BMF, Altersvorsorgereformgesetz government draft page and overview: https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2025-12-01-Altersvorsorgereformgesetz/0-Gesetz.html
- Bundesrat Drucksache 206/26, Bundestag-adopted legal text, Bundesrat deadline 2026-05-08: https://dserver.bundestag.de/brd/2026/0206-26.pdf
- EStG Sec. 10a current-law anchor for old Riester / future amended provision: https://www.gesetze-im-internet.de/estg/__10a.html
- EStG Sec. 22 current-law anchor for deferred taxation under Nr. 5: https://www.gesetze-im-internet.de/estg/__22.html
- AltZertG current-law anchor for certification framework that will be amended by the reform: https://www.gesetze-im-internet.de/altzertg/
- SGB V Sec. 240 current-law anchor for voluntary statutory health-insurance contribution treatment: https://www.gesetze-im-internet.de/sgb_5/__240.html
