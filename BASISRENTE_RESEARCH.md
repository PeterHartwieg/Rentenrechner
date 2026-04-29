# Basisrente / Ruerup Research Germany 2026

Last researched: 2026-04-28

This note summarizes German Basisrente / Ruerup rules that matter for the calculator model: Schicht-1 contribution deduction, cap sharing with statutory and professional pension contributions, 100% deductibility, payout restrictions, cohort taxation, KV/PV treatment, certification constraints, and implementation audit hooks.

It is not legal, tax, or financial advice. The goal is to make the assumptions in the tool explicit and keep later implementation work source-backed.

## Executive Summary For The Tool

- Basisrente is Schicht 1 / basic old-age provision. It is private-provider old-age provision but intentionally taxed like statutory/basic pension provision, not like a flexible Schicht-3 insurance policy.
- 2026 Schicht-1 special-expense cap: 30,826 EUR/year for single assessment and 61,652 EUR/year for joint assessment. Contributions inside the cap are 100% deductible.
- The cap is shared with statutory pension insurance, agricultural pension fund, professional pension schemes, and certified Basisrente contributions. For employees, both employee and tax-free employer statutory-pension contributions consume the cap before additional Basisrente contributions create extra deduction room.
- The old-age payout must be a monthly lifelong annuity tied to the taxpayer's life and may not start before age 62 for current-law contracts. Normal capital payout, surrender, sale, lending, free inheritance, and ETF-like withdrawal are not compatible with the tax-favored Basisrente model.
- Basisrente old-age pensions are taxed under the same EStG Sec. 22 cohort table as statutory pensions. A pension starting in 2026 has an 84.0% taxable share; new cohorts rise by 0.5 percentage points per year until 100% from 2058.
- KV/PV treatment depends strongly on retiree insurance status:
  - KVdR / compulsory statutory retirees: Basisrente is not a bAV Versorgungsbezug and is not listed as a contribution base under SGB V Sec. 237/229, so the calculator should not automatically deduct KV/PV.
  - Voluntary GKV retirees: SGB V Sec. 240 and GKV-Spitzenverband rules use broad economic capacity, so private pension / life-insurance income can be contribution-relevant up to the monthly BBG.
  - PKV retirees: no statutory GKV/PV deduction in the calculator.
- Main implementation red flags found: the app currently allows `zeitrente` for Basisrente and applies freiwillig-style KV/PV to every public-GKV Basisrente payout, without a KVdR distinction.

## 2026 Constants

| Item | 2026 value / rule | Tool effect |
|---|---:|---|
| Schicht-1 cap, single | 30,826 EUR/year | Maximum annual amount considered for statutory/professional/basic-pension contributions before joint-assessment doubling. |
| Schicht-1 cap, joint | 61,652 EUR/year | Needed for Ehegatten / Lebenspartner joint assessment; current app stores only the single cap. |
| Deductible fraction | 100% | Contributions inside the cap are fully deductible since 2023. |
| Pension contributions counted against cap | Employee plus employer statutory-pension contribution; comparable professional-pension contributions; agricultural pension fund | Basisrente deduction room is the cap left after these contributions. |
| Earliest old-age payout | Not before age 62 | Validate/warn when `retirementAge < 62` for Basisrente. |
| Old-age payout form | Monthly lifelong Leibrente | Do not model normal capital payout or fixed-term-only Zeitrente as a compliant old-age Basisrente payout. |
| 2026 new-pension taxable share | 84.0% | EStG Sec. 22 cohort taxation for Basisrente and GRV. |
| 2027 new-pension taxable share | 84.5% | Cohort table increments by 0.5 pp/year after Wachstumschancengesetz. |
| Full cohort taxation | 100% from 2058 | Clamp later cohorts to 100%. |
| KV/PV BBG | 69,750 EUR/year; 5,812.50 EUR/month | Cap for voluntary-GKV contribution base. |
| KVdR treatment | No automatic KV/PV on Basisrente | Basisrente is not a bAV Versorgungsbezug. |
| Voluntary-GKV treatment | Broad income base under SGB V Sec. 240 | Basisrente/private pension income can be KV/PV-relevant up to BBG. |
| Certification | BZSt certification under AltZertG Sec. 5a | Tax deduction requires certified Basisrentenvertrag. |
| Permitted cost categories | AltZertG Sec. 2a list | Supports fee fields such as fixed EUR fees, percent-of-capital, percent-of-contribution, and pension-payout fees. |

Sources: EStG Secs. 10 and 22; AltZertG Secs. 2, 2a, 5a; DRV 2026 tables; BZSt certification page; SGB V Secs. 237, 229, 240; GKV-Spitzenverband Beitragsbemessung page and Beitragsverfahrensgrundsaetze Selbstzahler.

## Rule Sections

### Contribution Deduction: EStG Sec. 10

Basisrente contributions fall under EStG Sec. 10 Abs. 1 Nr. 2 Buchst. b when the contract builds an own capital-funded old-age provision meeting the statutory restrictions. Contributions to statutory pension insurance, agricultural pension fund, comparable professional pension schemes, and Basisrente contracts share the same Schicht-1 cap.

For the calculator, the annual extra Basisrente deduction should be:

```text
deductibleBasisrente =
  min(basisrenteAnnualContribution,
      max(0, schicht1Cap - pensionSystemContributionsTowardsCap))
  * deductibleFraction
```

Where `pensionSystemContributionsTowardsCap` should include at least:

- employee statutory pension contribution,
- tax-free employer statutory pension contribution,
- comparable employee/employer professional-pension-scheme contributions,
- agricultural old-age fund contributions if modeled.

The 2026 cap is 30,826 EUR for single assessment. Joint assessment doubles it. Since 2023 the deductible fraction is 100%, so there is no phase-in percentage left to model for 2026.

Implementation implication: the app's single-filer formula is directionally right for employees and Versorgungswerk override cases, but joint assessment is missing.

### Contract Restrictions And Certification

Basisrente tax treatment is tied to a certified Basisrentenvertrag. BZSt states that its certification office checks whether submitted contract templates satisfy the AltZertG and EStG certification criteria; AltZertG Sec. 5a links certification to the Basisrentenvertrag requirements in AltZertG Sec. 2 / 2a.

For old-age provision under EStG Sec. 10 Abs. 1 Nr. 2 Buchst. b Doppelbuchst. aa, the relevant calculator constraints are:

- payout as a monthly lifelong annuity tied to the taxpayer's life,
- no payout before age 62,
- no ordinary lump-sum capital option,
- claims may not be freely inherited, transferred, sold, capitalized, or pledged,
- supplementary BU/EM/survivor cover can be part of the contract when it stays within the legal Basisrente structure.

AltZertG Sec. 2a restricts which cost structures a certified product may use. The app's fee model maps reasonably to several allowed categories: fixed monthly/annual EUR fees, percent of formed capital, percent of contributions, and percent of paid benefits after payout starts.

### Payout Taxation: EStG Sec. 22

Basisrente payments are taxable as basic-pension income under EStG Sec. 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa. They should use the same cohort taxable-share table as GRV statutory pension.

Selected cohort values:

| Pension start year | Taxable share |
|---:|---:|
| 2026 | 84.0% |
| 2027 | 84.5% |
| 2030 | 86.0% |
| 2040 | 91.0% |
| 2050 | 96.0% |
| 2058 onward | 100.0% |

The tax-free euro amount is normally determined from the year after pension start and then remains fixed; later pension increases are fully taxable. The current calculator reports a representative monthly result rather than a year-by-year indexed pension schedule, so applying the cohort taxable share to the representative annual payout is a practical approximation. If the app later builds a full annual Basisrente payout schedule, it should lock the euro Rentenfreibetrag rather than re-applying the percentage forever.

### Health And Care Insurance

Basisrente is not bAV. For KV/PV, this matters more than the provider being an insurance company.

For KVdR / compulsory statutory retirees, SGB V Sec. 237 lists the contribution bases for compulsory pensioners: statutory pension, pension-like Versorgungsbezuege, and work income. SGB V Sec. 229 defines Versorgungsbezuege and includes bAV and occupational/public-service pension categories, not ordinary private Basisrente. Therefore, the tool should not apply bAV KV/PV logic or a voluntary-GKV full-income charge to a KVdR Basisrente payout.

For voluntary statutory members, SGB V Sec. 240 requires the contribution assessment to consider the member's entire economic capacity. The GKV-Spitzenverband page explains that the federal principles bind statutory funds and aim at the totality of income; its published self-payer principles / income catalog include private pension and life-insurance income as relevant income categories. For the calculator, voluntary-GKV mode should treat Basisrente payouts as broad private-pension income up to the monthly KV/PV BBG, without the bAV KV Freibetrag.

For PKV retirees, the product comparison should not deduct statutory KV/PV from the Basisrente payout. PKV premiums are a separate household cashflow, not an income-proportional statutory deduction on the product payout.

## Implementation Implications

- Basisrente should be a separate product from Schicht-3 private insurance and from Riester. Do not reuse Sec. 20 capital-gain / half-income insurance tax modes.
- Accumulation can reuse the product fee and projection machinery, but displayed tax benefit must be based on marginal income-tax saving from the Schicht-1 deduction after cap sharing.
- Payout should normally be forced to `leibrente`. A "fixed term" payout is not a compliant old-age Basisrente payout unless a future implementation has a very specific legal basis for a non-old-age rider; do not treat generic `zeitrente` as an ordinary Basisrente retirement option.
- `afterTaxLumpSum` should remain `null`. Avoid showing an equivalent taxable capital value as if it were accessible wealth.
- Retirement tax should route the gross Basisrente pension through the GRV/Basisversorgung Besteuerungsanteil path, not through Ertragsanteil, Abgeltungsteuer, or Sec. 22 Nr. 5.
- KV/PV needs an explicit retirement GKV status:
  - KVdR / pflichtversichert: no Basisrente KV/PV,
  - freiwillig GKV: full broad-income assessment up to BBG,
  - PKV: no statutory KV/PV deduction.
- Joint assessment affects both the Schicht-1 cap and the income-tax saving. The current single-only tax pipeline can materially understate deduction room and misstate tax saving for married users.
- If a full retirement cashflow schedule is added, cohort taxation should lock the tax-free euro amount after the first full pension year.

## Current Tool Fit And Gaps

Already aligned:

- `calculateBasisrenteFunding` computes a Schicht-1 cap remainder and subtracts GRV or Versorgungswerk-style pension-system contributions before granting a Basisrente deduction.
- `rules.basisrente.schicht1CapSingle = 30_826` and `deductibleFraction = 1.0` match the 2026 single-filer / 100% deduction rule.
- `buildContext` passes a Versorgungswerk or Beamtenpension/none override into the Basisrente funding helper.
- The product result sets `afterTaxLumpSum: null`, which matches the no-normal-capital-payout rule.
- `netBasisrentePayout` routes the income-tax leg through `calculateRetirementTax` as `statutoryPensionAnnual`, so it uses the EStG Sec. 22 cohort table.
- Fee fields cover cost types that are relevant under AltZertG Sec. 2a and product information.

Potential gaps / audit findings:

- **High priority: `zeitrente` is likely not compliant for Basisrente old-age payout.** EStG Sec. 10 points to monthly lifelong Leibrente for old-age Basisrente. The app currently allows `payoutMode: 'zeitrente'` in domain types, validation, UI, product simulation, and tests.
- **High priority: KV/PV treatment lacks KVdR vs freiwillig distinction.** `netBasisrentePayout` applies freiwillig-style full KV/PV whenever `profile.publicHealthInsurance` is true. For KVdR / compulsory statutory retirees, Basisrente should normally have no KV/PV deduction. This can materially understate net Basisrente for employees who qualify for KVdR.
- **Medium priority: joint assessment is missing.** The rules file only stores `schicht1CapSingle`, and the funding/tax-saving path uses single-filer tax logic.
- **Medium priority: retirement age under 62 is not enforced for Basisrente.** UI text warns, but validation should block or warn if the product is modeled with payout before age 62.
- **Medium priority: cap-source comment in `src/rules/de2026.ts` should be rechecked.** The 2026 value is correct, but the comment appears to describe the derivation imprecisely; official 2026 tables tie the 30,826 EUR value to the statutory Schicht-1 cap / pension framework rather than the app's general RV BBG field.
- **Lower priority: no full annual payout schedule / fixed Rentenfreibetrag.** Current representative monthly output is acceptable for comparison, but a future schedule should lock the euro tax-free pension amount.
- **Lower priority: no explicit survivor/BU rider modeling.** This is fine for a pure old-age calculator, but the UI should avoid implying that the modeled capital is freely inheritable.

## Implementation Audit Hooks

Check these functions/constants in a later legal-vs-implementation audit:

| Area | File / symbol | Audit question |
|---|---|---|
| Contribution cap | `src/rules/de2026.ts` `basisrente.schicht1CapSingle` | Is the annual cap correct for the rule year, and is joint assessment represented? |
| Deductible fraction | `src/rules/de2026.ts` `basisrente.deductibleFraction` | Is it 100% for 2026+ and only year-specific where needed? |
| Funding | `src/engine/basisrente.ts` `calculateBasisrenteFunding` | Does it subtract employee + employer GRV / Versorgungswerk contributions and compute marginal tax saving on the correct zvE? |
| Context wiring | `src/engine/simulationContext.ts` `buildContext` | Are Versorgungswerk, Beamtenpension, and no-pension cases passed into the cap calculation correctly? |
| Payout tax | `src/engine/basisrente.ts` `netBasisrentePayout` | Does income tax use the Basisversorgung cohort table and the correct filing status? |
| Cohort table | `src/rules/de2026.ts` `besteuerungsanteilGrv` | Does the table match EStG Sec. 22 / Wachstumschancengesetz for all supported years? |
| Retirement pipeline | `src/engine/retirementTax.ts` `calculateRetirementTax` | Does routing Basisrente through `statutoryPensionAnnual` preserve deductions and avoid bAV/Schicht-3 tax modes? |
| Gross payout | `src/engine/projections.ts` `computeGrossMonthlyPayout` | Is Basisrente constrained to compliant lifelong annuity rather than generic fixed-term drawdown? |
| Product assembly | `src/engine/products/basisrente.ts` `simulate` | Is `afterTaxLumpSum` always null, and is `payoutMode` legally constrained? |
| Domain model | `src/domain/products/basisrente.ts` `BasisrenteAssumptions` | Should `payoutMode` be narrowed to `leibrente` only? |
| Validation | `src/engine/products/basisrente.validation.ts` `validateBasisrente` | Does validation reject non-compliant payout modes and payout age below 62? |
| UI | `src/features/inputs/BasisrenteInputs.tsx` | Does UI avoid offering Zeitrente/capital-like choices and expose KVdR/freiwillig status? |
| Tests | `src/engine/products/basisrente.test.ts` | Do tests encode legal behavior, especially no lump sum, no Zeitrente, and KVdR vs freiwillig split? |

## Source Notes

Primary / official sources:

- EStG Sec. 10: Schicht-1 Altersvorsorgeaufwendungen, Basisrente contract restrictions, certification reference, cap mechanics: https://www.gesetze-im-internet.de/estg/__10.html
- EStG Sec. 22: cohort taxation for statutory/basic pensions and taxable-share table: https://www.gesetze-im-internet.de/estg/__22.html
- AltZertG Sec. 2: Basisrentenvertrag definitions: https://www.gesetze-im-internet.de/altzertg/__2.html
- AltZertG Sec. 2a: permitted cost structures: https://www.gesetze-im-internet.de/altzertg/__2a.html
- AltZertG Sec. 5a: certification of Basisrentenvertraege: https://www.gesetze-im-internet.de/altzertg/__5a.html
- BZSt, certification of Altersvorsorge- and Basisrentenvertraege: https://www.bzst.de/DE/Unternehmen/RenteVorsorge/ZertifizierungAltersvorsorgeprodukte/AltersvorsorgeBasisrentenvertraege/altersvorsorgebasisrentenvertraege_node.html
- Deutsche Rentenversicherung, Zahlen und Tabellen 1st half 2026 PDF; includes 2026 Schicht-1 cap 30,826 EUR, 100% deduction, and 2026 taxable pension share 84%: https://www.deutsche-rentenversicherung.de/Nordbayern/DE/Presse-Experten/Zahlen-und-Tabellen/Ausgabe-1-HJ-2026.pdf?__blob=publicationFile&v=13
- BMF, Rentenbesteuerung overview and 2026 context: https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerliche_Themengebiete/Rentenbesteuerung/2021-04-28-Rentenbesteuerung-Eine-Frage-der-Gerechtigkeit.html
- SGB V Sec. 237: contribution bases for compulsory statutory pensioners: https://www.gesetze-im-internet.de/sgb_5/__237.html
- SGB V Sec. 229: Versorgungsbezuege definition: https://www.gesetze-im-internet.de/sgb_5/__229.html
- SGB V Sec. 240: contribution assessment for voluntary statutory members: https://www.gesetze-im-internet.de/sgb_5/__240.html
- SGB V Sec. 223: contribution assessment period and BBG reference: https://www.gesetze-im-internet.de/sgb_5/__223.html
- SGB XI Sec. 57: Pflegeversicherung contribution link for pensioners / Versorgungsbezuege: https://www.gesetze-im-internet.de/sgb_11/__57.html
- GKV-Spitzenverband, Beitragsbemessung and binding self-payer principles / income catalog: https://www.gkv-spitzenverband.de/krankenversicherung/kv_grundprinzipien/finanzierung/beitragsbemessung/beitragsbemessung.jsp
- GKV-Spitzenverband, Beitragsverfahrensgrundsaetze Selbstzahler 2025 PDF: https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/grundprinzipien_1/finanzierung/beitragsbemessung/2025-01-01_Einheitliche_Grundsaetze_zur_Beitragsbemessung_freiwilliger_Mitglieder_Stand_01_01_2025.pdf

Secondary explanatory source, clearly not controlling law:

- Verbraucherzentrale, Ruerup-Rente pitfalls, costs, lock-up, cap-sharing explanation: https://www.verbraucherzentrale.de/wissen/geld-versicherungen/altersvorsorge/rueruprente-auf-diese-fallstricke-sollten-sie-bei-der-basisrente-achten-110665
