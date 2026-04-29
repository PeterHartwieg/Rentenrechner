# Tax And Social Security 2026 Research

Focused companion to `LEGAL_REVIEW.md` for cross-product German 2026 tax and social-security constants used by the calculator.

Last reviewed: 2026-04-28.

## Executive Summary For The Tool

The app's 2026 rule-year shape is broadly aligned with the official cross-product framework: the 2026 Section 32a EStG tariff, Soli threshold and Milderungszone, RV/AV/KV/PV caps and rates, Pflege child discounts, bAV 8%/4% BBG anchoring, Sparerpauschbetrag, and retirement KV/PV mechanics are represented in central rules/helpers rather than scattered through product code.

The highest-value audit targets are payroll-side details rather than product payout formulas:

- Private-health Vorsorgepauschale: the 2026 BMF guidance says the private KV/PV Teilbetrag is reduced by tax-free employer subsidies. `calculateVorsorgepauschale2026` currently appears to use gross private premiums.
- PKV employer subsidy: Section 257 SGB V uses the half general KV rate plus half average Zusatzbeitrag, capped by half the actual private KV premium. The current helper combines KV and Pflege into one cap and omits the average Zusatzbeitrag in the KV cap.
- Vorsorgepauschale rounding: BMF says the separated Teilbetrage are summed and rounded up to full euros. The helper currently returns an unrounded number.
- Saxony Pflege: the law requires a different employer/employee split. The app documents this as not modeled and uses the non-Saxony split.

## Constants Table

| Area | 2026 value modeled | Primary / official basis | Implementation hook |
|---|---:|---|---|
| Income tax basic allowance | 12,348 EUR | [EStG Section 32a](https://www.gesetze-im-internet.de/estg/__32a.html) | `de2026Rules.incomeTax.basicAllowance`; `calculateIncomeTax2026` |
| First progression zone end | 17,799 EUR | [EStG Section 32a](https://www.gesetze-im-internet.de/estg/__32a.html) | `firstProgressionEnd` |
| Second progression zone end | 69,878 EUR | [EStG Section 32a](https://www.gesetze-im-internet.de/estg/__32a.html) | `secondProgressionEnd` |
| Reichensteuer threshold | 277,826 EUR | [EStG Section 32a](https://www.gesetze-im-internet.de/estg/__32a.html) | `topTaxStart` |
| Soli Freigrenze, single | 20,350 EUR income-tax liability | [SolZG 1995 Section 3](https://www.gesetze-im-internet.de/solzg_1995/__3.html) | `solidarityFreeTax`; `calculateSolidarityTax` |
| Soli rate | 5.5% | [SolZG 1995 Section 4](https://www.gesetze-im-internet.de/solzg_1995/__4.html) | `calculateSolidarityTax`; capital gains helper |
| Soli Milderungszone rate | 11.9% of excess over Freigrenze | [SolZG 1995 Section 4](https://www.gesetze-im-internet.de/solzg_1995/__4.html) | hardcoded `0.119` in `calculateSolidarityTax` |
| RV/AV BBG | 101,400 EUR/year; 8,450 EUR/month | [SVBezGrV 2026 Section 4](https://www.gesetze-im-internet.de/svbezgrv_2026/BJNR1160A0025.html); [Bundesregierung overview](https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/beitragsgemessungsgrenzen-2386514) | `socialSecurity.pensionCapYear` |
| KV/PV BBG | 69,750 EUR/year; 5,812.50 EUR/month | [SVBezGrV 2026 Section 2](https://www.gesetze-im-internet.de/svbezgrv_2026/BJNR1160A0025.html); [BMG GKV rates](https://www.bundesgesundheitsministerium.de/beitraege.html) | `healthCareCapYear`; `healthAndCareCapMonth` |
| Bezugsgröße | 47,460 EUR/year; 3,955 EUR/month | [SVBezGrV 2026 Section 1](https://www.gesetze-im-internet.de/svbezgrv_2026/__1.html) | `bezugsgroesseMonthly` |
| Preliminary Durchschnittsentgelt | 51,944 EUR/year | [SVBezGrV 2026 Section 3](https://www.gesetze-im-internet.de/svbezgrv_2026/BJNR1160A0025.html) | `durchschnittsentgelt` |
| General RV rate | 18.6%, split 9.3% / 9.3% | [DRV 2026 changes](https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Pressemitteilungen/Pressemitteilungen-archiv/2025/2025-12-18-rv-aenderungen-2026.html) | `pensionEmployeeRate`; `pensionEmployerRate` |
| Unemployment rate | 2.6%, split 1.3% / 1.3% | [DRV Lexikon Beitragssatz](https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/summa-summarum/Lexikon/B/beitragssatz.html) | `unemploymentEmployeeRate`; `unemploymentEmployerRate` |
| General GKV rate | 14.6% | [BMG GKV rates](https://www.bundesgesundheitsministerium.de/beitraege.html) | `healthGeneralRate` |
| Reduced GKV rate | 14.0% | [BMG GKV rates](https://www.bundesgesundheitsministerium.de/beitraege.html) | `healthReducedRate` |
| Average Zusatzbeitrag | 2.9% | [BMG GKV rates](https://www.bundesgesundheitsministerium.de/beitraege.html) | profile default / UI assumption; not a rule field |
| Pflege base rate | 3.6% total; 1.8% employee and 1.8% employer outside Saxony | [BMG Pflege financing](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung) | `careEmployeeBaseRate`; `careEmployerRate` |
| Pflege childless | 4.2% total; employee 2.4% outside Saxony | [BMG Pflege financing](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung); [SGB XI Section 55](https://www.gesetze-im-internet.de/sgb_11/__55.html) | `careEmployeeChildlessRate`; `careRetirementChildlessRate` |
| Pflege child discount | 0.25 pp for each child 2 through 5 under 25; max 1.0 pp | [SGB XI Section 55](https://www.gesetze-im-internet.de/sgb_11/__55.html); [BMG Pflege financing](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung) | `careEmployeeRateForChildren` |
| Saxony Pflege split | employee +0.5 pp, employer -0.5 pp | [BMG Pflege financing](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung); [SGB XI Section 58](https://www.gesetze-im-internet.de/sgb_11/__58.html) | not modeled |
| KV Freibetrag / PV Freigrenze for Versorgungsbezüge | 197.75 EUR/month | [BMG GKV rates](https://www.bundesgesundheitsministerium.de/beitraege.html); [SGB V Section 226](https://www.gesetze-im-internet.de/sgb_5/__226.html); [SGB XI Section 57](https://www.gesetze-im-internet.de/sgb_11/__57.html) | `kvFreibetragVersorgungMonthly`; `calculateRetirementKvPv` |
| bAV tax-free limit | 8% RV BBG = 8,112 EUR/year | [EStG Section 3 Nr. 63](https://www.gesetze-im-internet.de/estg/__3.html) | `bav.taxFreePctOfPensionCap` |
| bAV SV-free limit | 4% RV BBG = 4,056 EUR/year | [SvEV Section 1](https://www.gesetze-im-internet.de/svev/__1.html) | `bav.socialSecurityFreePctOfPensionCap` |
| Sparerpauschbetrag | 1,000 EUR single; 2,000 EUR joint | [EStG Section 20(9)](https://www.gesetze-im-internet.de/estg/__20.html) | `capitalGains.saverAllowance` |
| Capital gains tax | 25% plus Soli | [EStG Section 32d](https://www.gesetze-im-internet.de/estg/__32d.html); [SolZG 1995 Section 3](https://www.gesetze-im-internet.de/solzg_1995/__3.html) | `calculateCapitalGainsTax` |
| 2026 InvStG Basiszins | 3.20% | [BMF letter, 2026-01-13](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.pdf?__blob=publicationFile&v=1) | `capitalGains.basiszins` |
| Employee Werbungskosten-Pauschbetrag | 1,230 EUR/year | [EStG Section 9a](https://www.gesetze-im-internet.de/estg/__9a.html) | `employeeAllowance` |
| Retirement Werbungskosten-Pauschbeträge | 102 EUR/year for Versorgungsbezüge; 102 EUR/year for pensions/other recurring pension income | [EStG Section 9a](https://www.gesetze-im-internet.de/estg/__9a.html) | `werbungskostenPauschalVersorgungsbezuege`; `werbungskostenPauschalRenten` |
| Sonderausgaben-Pauschbetrag | 36 EUR single; 72 EUR joint | [EStG Section 10c](https://www.gesetze-im-internet.de/estg/__10c.html) | `specialExpensesAllowance`; `sonderausgabenPauschbetrag` |

## Rule Sections

### 1. Income Tax Tariff And Soli

For assessment year 2026, Section 32a EStG uses the app's tariff thresholds and coefficients:

- `x <= 12,348`: no income tax.
- `12,349..17,799`: `(914.51 * y + 1,400) * y`.
- `17,800..69,878`: `(173.10 * z + 2,397) * z + 1,034.87`.
- `69,879..277,825`: `0.42 * x - 11,135.63`.
- `>= 277,826`: `0.45 * x - 19,470.38`.

The Soli helper should compute 5.5% of income tax, but in the Milderungszone it is limited by 11.9% of the income-tax amount above the Freigrenze. For 2026 the single Freigrenze is 20,350 EUR of income tax. The app correctly models the "min(regular, transition)" shape.

Implementation implication: keep the Section 32a tariff isolated in `calculateIncomeTax2026`. Do not inline tariff thresholds in product modules.

### 2. Payroll Vorsorgepauschale

The BMF 2026 guidance applies from 2026-01-01 and replaces the older minimum-Vorsorgepauschale approach. It divides the Vorsorgepauschale into RV, statutory KV/PV, private basis KV/PV, and unemployment Teilbeträge. The BMF guidance also says:

- The payroll-tax base can differ from social-security Arbeitsentgelt; for bAV, the tax-free conversion affects the Vorsorgepauschale base differently from the SV-free conversion.
- Each BBG is observed in the corresponding component.
- State-specific Pflege contribution splits, including Saxony, must be reflected.
- Childless Pflege surcharge and child discounts are reflected.
- Private KV/PV Teilbetrag for tax classes I-V uses the reported private basis premiums reduced by tax-free employer subsidies under Section 3 Nr. 62 EStG.
- Unemployment Teilbetrag is included only to the extent the KV/PV plus AV Teilbeträge do not exceed 1,900 EUR.
- No Mindestvorsorgepauschale is used from 2026.

Implementation implication: `calculateVorsorgepauschale2026` is the correct central location, but it should be checked against BMF rounding and the private-premium subsidy reduction.

### 3. Payroll Social Contributions And Pflege Children

RV and AV are capped by the RV/AV BBG. GKV and Pflege are capped by the KV/PV BBG. GKV contributions split the general rate and the Zusatzbeitrag between employee/employer; the app takes the user/profile Zusatzbeitrag as a percentage.

Pflege outside Saxony:

- childless employee: 2.4%; employer: 1.8%.
- one child: employee 1.8%; employer 1.8%.
- two to five qualifying children under 25: employee rate falls by 0.25 pp per additional child, down to 0.8% for five or more qualifying children; employer remains 1.8%.

Saxony caveat: employee/employer split shifts by +0.5 pp / -0.5 pp. The tool currently does not model state of employment, so non-Saxony assumptions should stay explicit in UI/legal notes.

Implementation implication: `careEmployeeRateForChildren` should remain pure and test-covered. If Saxony is added later, make it an explicit profile field; do not infer from residence.

### 4. PKV Employer Subsidy

For private health insurance, Section 257 SGB V caps the employer subsidy by a hypothetical statutory GKV employer share: half the general KV rate plus half the average Zusatzbeitrag, applied up to the KV BBG, and also capped at half of the actual private KV premium. BMG's 2026 GKV page states the 2026 maximum employer health subsidy as 508.59 EUR/month.

For private Pflege-Pflichtversicherung, Section 61 SGB XI has the analogous cap: the employer share that would apply in social Pflegeversicherung, capped at half the actual private Pflege premium. Outside Saxony, the 2026 Pflege employer cap is 5,812.50 * 1.8% = 104.63 EUR/month.

Implementation implication: keep KV and Pflege caps separate. A single combined cap can accidentally overstate health subsidy when only PKV premium is high, or understate total subsidy when both private health and private Pflege premiums are high.

### 5. Retirement KV/PV Mechanics

For KVdR Pflichtversicherte:

- Statutory GRV pension is subject to KV, with the retiree and the pension insurer bearing the KV contribution half each under Section 249a SGB V.
- PV on statutory pension is borne by the retiree at the applicable Pflege rate; there is no employer-style PV half from DRV.
- Versorgungsbezüge, including bAV pensions, are subject to the general KV contribution rate and Zusatzbeitrag; the retiree bears the contribution alone under Sections 248 and 250 SGB V.
- The monthly KV Freibetrag for bAV/occupational pensions is applied to the aggregate Versorgungsbezüge, not per source.
- PV uses a Freigrenze for Versorgungsbezüge through SGB XI: below the threshold no PV; above the threshold the full amount is assessed.
- One-time bAV capital benefits are spread over 120 months under Section 229 SGB V.

For freiwillig Versicherte:

- Section 240 SGB V uses a broader income concept, including capital income/rental income and other retirement income, subject to the KV/PV BBG.
- The BMG page notes that voluntary retirees' pension-related KV share can involve pension-insurance participation/subsidy; the current tool mostly models product-specific marginal KV/PV rather than a full household net-retirement system.

Implementation implication: `calculateRetirementKvPv` correctly centralizes the aggregate-cap problem. Later audits should verify whether the proportional apportionment choice is still intended where statute/administrative guidance prescribes a priority order for freiwillig income categories.

### 6. Pauschbeträge And Capital Gains

The app uses these cross-product income-tax deductions:

- Arbeitnehmer-Pauschbetrag: 1,230 EUR.
- Werbungskosten-Pauschbetrag for Versorgungsbezüge: 102 EUR.
- Werbungskosten-Pauschbetrag for pension/sonstige Renteneinkünfte: 102 EUR.
- Sonderausgaben-Pauschbetrag: 36 EUR single, 72 EUR joint.

Capital gains use 25% Abgeltungsteuer plus Soli, with a 1,000 EUR Sparerpauschbetrag for single filers. The ETF model also applies the 2026 InvStG Basiszins of 3.20% for Vorabpauschale; that is a 2026 constant, not a forecast for future years.

Implementation implication: because `calculateRetirementTax` currently supports only `filingStatus = 'single'`, any joint-assessment support must revisit Sparerpauschbetrag, Soli thresholds, Section 32a splitting, and Pauschbeträge together.

## Current Tool Fit / Gaps

Fit:

- Central rule file `src/rules/de2026.ts` contains the 2026 statutory values and avoids product-level hardcoding for caps/rates.
- `src/engine/tax.ts` matches the official 2026 tariff coefficients and Soli shape.
- `calculateEmployeeSocialContributions` and `calculateBavFunding` apply the correct BBG families for RV/AV versus KV/PV and bAV 8%/4% thresholds.
- `careEmployeeRateForChildren` implements the children-under-25 discount and the lifetime one-child exemption from the childless surcharge.
- `calculateRetirementKvPv` models aggregate KV Freibetrag, PV Freigrenze, 120-month bAV spreading, and BBG-aware apportionment in one function.
- Fixed in 2026-04-28 audit: the freiwillig-versichert path no longer applies the KVdR-only PV Freigrenze to Versorgungsbezuege; full freiwillig broad-income assessment is used before BBG capping.
- Rule updates for `durchschnittsentgelt` and `aktuellerRentenwert` noted in `LEGAL_REVIEW.md` appear to have been incorporated into `de2026.ts`.

Gaps / red flags:

- `calculateVorsorgepauschale2026` uses gross `pkvMonthlyPremium` and `pPVMonthlyPremium` for the private KV/PV Teilbetrag; BMF 2026 guidance requires reduction by tax-free employer subsidies. This can overstate the payroll Vorsorgepauschale for PKV users.
- `calculateVorsorgepauschale2026` does not appear to round the summed Teilbeträge up to full euros, while BMF guidance requires a full-euro rounded sum.
- `calculatePkv257Subsidy` omits the 2026 average Zusatzbeitrag from the health-subsidy cap and combines health and Pflege into one cap. The legally cleaner model is `min(half actual PKV, KV cap)` plus `min(half actual pPV, Pflege cap)`.
- The average Zusatzbeitrag is profile/default data, not a central `de2026Rules.socialSecurity` field. That is acceptable for user-specific Zusatzbeitrag modeling, but it complicates official default/yearly update audits and PKV Section 257 caps.
- Saxony Pflege split is not modeled; this is documented but should remain visible because it affects both payroll net and Vorsorgepauschale.
- Retirement KV/PV for freiwillig Versicherte does not model minimum contribution and does not fully model Section 106 SGB VI health-insurance subsidy for freiwillig/PKV statutory pensioners.
- The app is single-filer only for retirement-tax pipeline; `calculateRetirementTax('married')` throws.

## Implementation Audit Hooks

Tax:

- `src/engine/tax.ts`
  - `calculateIncomeTax2026(taxableIncome, rules)`
  - `calculateSolidarityTax(incomeTax, rules)`
  - `calculateCapitalGainsTax(gain, rules, partialExemption, annualAllowance)`
- Tests:
  - `src/engine/products/etf.test.ts` for Section 32a, Soli, and Sparerpauschbetrag coverage.
  - `src/engine/retirementTax.test.ts` for retirement personal tax and Abgeltungsteuer routing.

Salary / payroll:

- `src/engine/salary.ts`
  - `contributionBase`
  - `careEmployeeRateForChildren`
  - `calculateEmployeeSocialContributions`
  - `calculateEmployerSocialContributions`
  - `calculatePkv257Subsidy`
  - `calculateVorsorgepauschale2026`
  - `calculateSalaryResult`
  - `calculateBavFunding`
- Tests:
  - `src/engine/products/bav.test.ts` for Vorsorgepauschale, bAV 4%/8% BBG, Pflege child rates, GRV reduction.
  - `src/engine/products/bav.payout.test.ts` for PKV premium/subsidy tests.

Retirement:

- `src/engine/retirementTax.ts`
  - `calculateRetirementTax`
  - `calculateRetirementKvPv`
- Product payout callers:
  - `src/engine/projections.ts`: `netBavPayout`, `afterTaxBavLumpSum`, `netInsurancePayout`, `afterTaxInsuranceLumpSum`
  - `src/engine/grv.ts`: `projectStatutoryPension`
  - `src/engine/basisrente.ts`: `netBasisrentePayout`
  - `src/engine/altersvorsorgedepot.ts`: `netAvdPayout`
  - `src/engine/riester.ts`: `netRiesterPayout`
- Tests:
  - `src/engine/retirementKvPv.test.ts`
  - `src/engine/bavLumpSumTax.test.ts`
  - product payout tests in `src/engine/products/*.test.ts`

Rules/constants:

- `src/rules/de2026.ts`
  - `incomeTax`
  - `socialSecurity`
  - `bav`
  - `basisrente`
  - `capitalGains`
  - `besteuerungsanteilGrv`
  - `versorgungsfreibetrag`
  - `werbungskostenPauschalVersorgungsbezuege`
  - `werbungskostenPauschalRenten`
  - `sonderausgabenPauschbetrag`
- `src/rules/legalConstants.ts`
  - `insurance.halbeinkuenfteMinRuntimeYears`
  - `insurance.halbeinkuenfteMinAge`
  - `insurance.halbeinkuenfteFactor`
  - `bav.versorgungsbezugSpreadingMonths`
  - `bav.fuenftelregelungDivisor`
  - `ertragsanteilByAge`

## Source Notes

Primary / official sources consulted:

- [EStG Section 32a](https://www.gesetze-im-internet.de/estg/__32a.html) - 2026 tariff zones and formula coefficients.
- [SolZG 1995 Sections 3 and 4](https://www.gesetze-im-internet.de/solzg_1995/__3.html) - Soli base, Freigrenzen, and rate mechanics.
- [BMF PAP / Programmablaufplan 2026](https://www.bundesfinanzministerium.de/Datenportal/Daten/frei-nutzbare-produkte/Anwendungen/Programmablaufplan-2026/Programmablaufplan-2026.html) - official payroll algorithm publication.
- [BMF Vorsorgepauschale guidance from 2025-08-14](https://usth.bundesfinanzministerium.de/lsth/2026/B-Anhaenge/Anhang-30a/anhang-30-a.html) - 2026 payroll Vorsorgepauschale components and private KV/PV treatment.
- [SVBezGrV 2026](https://www.gesetze-im-internet.de/svbezgrv_2026/BJNR1160A0025.html) - Bezugsgröße, BBGs, and preliminary Durchschnittsentgelt.
- [BMG GKV contributions](https://www.bundesgesundheitsministerium.de/beitraege.html) - 2026 GKV rates, BBG, average Zusatzbeitrag, retirement contribution notes, employer maximum health subsidy.
- [BMG Pflege financing](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung) - Pflege rates, childless surcharge, child discounts, Saxony split, 2026 Pflege BBG.
- [DRV 2026 changes](https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Pressemitteilungen/Pressemitteilungen-archiv/2025/2025-12-18-rv-aenderungen-2026.html) - RV contribution rate and 2026 pension-tax share context.
- [SGB V Section 257](https://www.gesetze-im-internet.de/sgb_5/__257.html) - employer health-insurance subsidies for employees.
- [SGB XI Section 61](https://www.gesetze-im-internet.de/sgb_11/__61.html) - private Pflege employer subsidy.
- [SGB V Sections 226, 229, 240, 248, 249a, 250](https://www.gesetze-im-internet.de/sgb_5/) - retirement KV/PV bases, Versorgungsbezüge, voluntary members, rates, and contribution bearing.
- [SGB XI Sections 55, 57, 58](https://www.gesetze-im-internet.de/sgb_11/) - Pflege rates, Versorgungsbezüge Freigrenze, and Saxony split.
- [EStG Sections 9a, 10c, 20, 32d](https://www.gesetze-im-internet.de/estg/) - Pauschbeträge, Sparerpauschbetrag, and capital-gains tax.
- [BMF 2026 Basiszins for Vorabpauschale](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.pdf?__blob=publicationFile&v=1) - 3.20% 2026 InvStG basis interest.

Non-primary orientation source used only as a cross-check:

- [Bundesregierung 2026 Beitragsbemessungsgrenzen overview](https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/beitragsgemessungsgrenzen-2386514)
