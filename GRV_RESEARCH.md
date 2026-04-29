# GRV Research Germany 2026

Last researched: 2026-04-28

This note summarizes German statutory pension (gesetzliche Rentenversicherung, GRV) rules that matter for the calculator model: Entgeltpunkte, Durchschnittsentgelt, aktueller Rentenwert, Zugangsfaktor, taxation, health/care contributions in retirement, manual Renteninformation overrides, and bAV salary-conversion interactions.

It is not legal, tax, or financial advice. The goal is to make the tool assumptions explicit and keep later implementation audits source-backed.

## Executive Summary For The Tool

- The core old-age pension formula is:

```text
monthly pension = personal Entgeltpunkte * Rentenartfaktor * aktueller Rentenwert
personal Entgeltpunkte = Entgeltpunkte adjusted by Zugangsfaktor
```

- For a normal Regelaltersrente, the simplified tool formula `Entgeltpunkte * aktuellerRentenwert` is directionally correct because Rentenartfaktor and Zugangsfaktor are normally 1.0.
- The 2026 EP denominator is the vorlaeufiges Durchschnittsentgelt of 51,944 EUR. Pensionable earnings are capped at the 2026 general RV BBG of 101,400 EUR/year.
- The current pension value is time-sensitive in 2026:
  - 2026-01-01 through 2026-06-30: 40.79 EUR per EP.
  - From 2026-07-01: 42.52 EUR per EP.
  - The app's `de2026Rules` uses 42.52 EUR as the 2026 projection value, which is a deliberate "post-July/latest 2026" assumption rather than the value legally paid on 2026-04-28.
- Manual Renteninformation override is appropriate and often preferable to an EP estimate, but the UI must be clear whether the user enters a current gross amount or the projected gross amount from the official letter. Applying a `rentenwertGrowthRate` to an already projected Renteninformation amount can double-count future increases.
- GRV pensions are taxed under EStG Sec. 22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe aa by pension-start cohort. For a 2026 pension start, 84.0% is taxable; new cohorts rise by 0.5 percentage points per year until 100% in 2058.
- KVdR / compulsory statutory health retirees pay only the pensioner half of health insurance on the statutory pension; the pension insurance carrier bears the other half under SGB V Sec. 249a. The retiree pays the full Pflegeversicherung contribution.
- Voluntary GKV and PKV retirees are not the same as KVdR. SGB VI Sec. 106 provides a health-insurance subsidy for voluntary/private insured pensioners, but the member/policyholder pays contributions/premiums directly. Pflegeversicherung is not subsidized in the same way.
- bAV salary conversion can reduce future GRV pension because SV-free converted salary is not pensionable income up to the RV BBG. The app's `estimatedMonthlyGrvReduction` captures this hidden cost, but it is a simplified current-value estimate.

## 2026 Constants

| Item | 2026 value | Tool effect |
|---|---:|---|
| General RV/AV BBG | 101,400 EUR/year; 8,450 EUR/month | Caps annual pensionable earnings and bAV 4%/8% cap calculations. |
| Preliminary Durchschnittsentgelt | 51,944 EUR/year | Denominator for future EP estimate in 2026-style projection. |
| RV contribution rate | 18.6% total; 9.3% employee; 9.3% employer | Salary phase contribution and bAV saving logic. |
| Aktueller Rentenwert until 2026-06-30 | 40.79 EUR/EP/month | Legal value paid before the July 2026 adjustment. |
| Aktueller Rentenwert from 2026-07-01 | 42.52 EUR/EP/month | App rule value for 2026 projections. |
| Normal old-age Rentenartfaktor | 1.0 | App assumes this implicitly for GRV old-age pension. |
| Zugangsfaktor at regular retirement age | 1.0 | App assumes this implicitly. |
| Early/late access adjustment | -0.3% per early month; +0.5% per deferred month | Not modeled in current GRV estimate. |
| GRV taxable share for 2026 pension-start cohort | 84.0% | `besteuerungsanteilGrv(2026)`. |
| Full taxable-share cohort | 2058 onward | `besteuerungsanteilGrv` clamps at 100%. |
| General GKV rate | 14.6% plus kassenindividueller Zusatzbeitrag | KVdR retiree share is half on GRV pension; voluntary path differs. |
| Pflegeversicherung base rate | 3.6% total in app rules | Retiree pays full PV rate on statutory pension. |
| Childless PV surcharge | +0.6 percentage points | App reaches 4.2% for childless pensioners via childless employee part plus employer/base part. |
| Child PV discount | -0.25 percentage points for each 2nd to 5th child under 25 | App uses child birth years and contribution year. |
| KV/PV BBG | 69,750 EUR/year; 5,812.50 EUR/month | Cap for retirement health/care contribution base. |
| Versorgung KV Freibetrag / PV Freigrenze | 197.75 EUR/month | Relevant to bAV/Versorgungsbezuege, not normal GRV pension. |

Primary sources: SGB VI Secs. 63, 64, 68, 69, 70, 77, 106, 158, 159; SVBezGrV 2026; EStG Sec. 22; SGB V Secs. 226, 237, 240, 241, 242, 249a; SGB XI Sec. 55 plus BMG care-contribution guidance; Deutsche Rentenversicherung and BMAS 2026 Rentenanpassung pages.

## Rule Sections

### Entgeltpunkte Estimate

SGB VI Sec. 70 says EP for contribution periods are determined by dividing the contribution assessment base by the Durchschnittsentgelt for the same calendar year. For the year of pension start and the prior year, the preliminary Durchschnittsentgelt is used.

For the calculator's simplified forward estimate:

```text
futureEP(year) = min(grossSalaryYear, pensionCapYear) / durchschnittsentgelt
projectedEP = currentEntgeltpunkte + sum(futureEP for remaining years)
```

This is a transparent estimate, but it is not a full DRV account projection. It ignores child-raising periods, unemployment/sickness contribution periods, school/study Anrechnungszeiten, Minijob details, Grundrente Zuschlaege, Versorgungsausgleich, survivor/disability rules, and historical final-vs-preliminary Durchschnittsentgelt corrections.

### Durchschnittsentgelt And BBG

The 2026 preliminary Durchschnittsentgelt is 51,944 EUR. The general RV BBG is 101,400 EUR/year. A user earning more than the BBG cannot earn more EP from the excess salary; their EP for current-year employment is capped.

The app currently holds both `durchschnittsentgelt` and `pensionCapYear` constant across the projection horizon. This is a simplification. If user salary growth is enabled, a legally closer projection would also need future average-wage and BBG growth assumptions. Without that, salary growth can overstate future EP for users whose own salary rises with the general wage level.

### Rentenformel, Rentenwert, Rentenartfaktor, Zugangsfaktor

SGB VI Secs. 63 and 64 define the monthly pension amount by multiplying personal EP, Rentenartfaktor, and aktueller Rentenwert. SGB VI Sec. 68 defines the current pension value as the monthly old-age pension amount for one year of average earnings contributions and adjusts it each July. SGB VI Sec. 69 authorizes the annual regulation.

For a regular old-age pension:

- Rentenartfaktor: 1.0.
- Zugangsfaktor: 1.0 when claimed at the relevant regular or otherwise unreduced retirement age.

SGB VI Sec. 77 reduces the Zugangsfaktor by 0.003 per month of early old-age pension and increases it by 0.005 per month of deferred claim after the regular age. The current app does not model these access adjustments; `profile.retirementAge` is treated as a projection age rather than a legally validated pension-claim age.

### Salary Growth And Rentenwert Indexation

The implementation exposes:

- `annualSalaryGrowthRate`: increases the user's salary in EP-based mode year by year.
- `rentenwertGrowthRate`: increases the pension value until retirement in both EP-based and manual modes.

This gives users a scenario lever, but it is not the statutory Rentenanpassungsformel. SGB VI Sec. 68 includes wage, contribution-rate, and sustainability factors. The app does not project those factors; it applies a user-specified constant growth rate.

Implementation implication: document this as a scenario assumption, not a legal forecast. If salary growth and rentenwert growth are both used, consider adding a Durchschnittsentgelt/BBG growth assumption or warning that future EP may be overstated.

### Manual Renteninformation Override

The official Renteninformation is the best user-facing source for already credited EP and DRV's own assumptions. The calculator supports `manualMonthlyGross` to bypass EP estimation.

Two legally/economically distinct inputs can sound similar:

- current gross pension claim based on current EP and current Rentenwert;
- projected gross monthly pension from the Renteninformation at the user's planned retirement age.

The current implementation multiplies manual gross by `rentenwertGrowthRate` until retirement. That is reasonable only if the manual input is a current-value amount. If the user copies an official projected retirement amount and also enters positive Rentenwert growth, the result can double-count future increases.

### EStG Sec. 22 Besteuerungsanteil

GRV old-age pensions are taxable as sonstige Einkuenfte under EStG Sec. 22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe aa. The taxable share is determined by the calendar year in which the pension starts.

Selected cohort values:

| Pension start year | Taxable share |
|---:|---:|
| 2026 | 84.0% |
| 2027 | 84.5% |
| 2030 | 86.0% |
| 2040 | 91.0% |
| 2050 | 96.0% |
| 2058 onward | 100.0% |

Legal nuance: the tax-free part is generally locked as a euro amount after the pension-start phase, so later pension increases become fully taxable. The current app performs a one-year/static retirement-income calculation and applies the cohort percentage directly to the modeled annual pension. That is acceptable for a simple first-year/net monthly comparison, but not a year-by-year tax forecast through retirement.

### KVdR Health Contribution Under SGB V Sec. 249a

For compulsory statutory health-insurance pensioners, SGB V Sec. 237 includes the statutory pension as contribution-relevant income. SGB V Sec. 249a allocates health-insurance contributions on statutory pension income between the retiree and the pension insurance carrier. In practical terms, the retiree pays half of the general health rate plus half of the Zusatzbeitrag on the GRV pension; DRV bears the other half.

The app models this by sending `monthlyStatutoryPension` into `calculateRetirementKvPv` with `isFreiwilligVersichert: false`, which applies `healthRate / 2` to the GRV pension.

### Voluntary GKV And SGB VI Sec. 106 Subsidy Gap

Voluntary statutory retirees are assessed under SGB V Sec. 240. The contribution base is broader than KVdR and can include general economic capacity, subject to the BBG and minimum-contribution rules. SGB VI Sec. 106 provides a health-insurance subsidy for voluntary GKV and PKV pensioners, but it is a subsidy tied to the statutory pension, not a blanket half-rate on all retirement income. The retiree still pays Pflegeversicherung themselves.

Current tool gap: GRV projection does not expose a proper voluntary-GKV pensioner path for the statutory pension baseline. It always routes `pensionBaselineType === 'grv'` as KVdR half-rate, even when the profile is not in public health insurance or when the user would be freiwillig rather than KVdR.

### Pflegeversicherung

SGB XI Sec. 55 sets the care contribution rate, childless surcharge, and child-related discounts. Pensioners generally pay the full Pflegeversicherung contribution on the statutory pension; there is no DRV employer half for PV analogous to KV.

The app's pattern of computing a full `careRate` and applying it to the GRV pension is aligned for the core KVdR case. Check future updates carefully because care rates and child-discount mechanics are politically active and can change by statute or ordinance.

### bAV Salary-Conversion GRV Reduction

The legal/economic chain is:

1. Salary conversion can be tax-free under EStG Sec. 3 Nr. 63 and social-security-free within the 4% RV-BBG corridor under social-security rules.
2. SV-free conversion reduces pensionable Arbeitsentgelt up to the RV BBG.
3. Lower pensionable earnings reduce future EP under SGB VI Sec. 70.
4. Lower EP reduce monthly GRV under the SGB VI pension formula.

The current implementation estimates:

```text
lostPensionableBase =
  min(grossBefore, RV_BBG) - min(grossBefore - effectiveSvFreeConversion, RV_BBG)

estimatedMonthlyGrvReduction =
  yearsToRetirement * lostPensionableBase / durchschnittsentgelt * aktuellerRentenwert
```

This is a useful hidden-cost estimate. It correctly produces no loss for salary already fully above the RV BBG and partial loss when conversion moves only part of capped salary. It is still static: it does not index the lost EP effect by future Durchschnittsentgelt/Rentenwert assumptions, and it can double-count if a user's manual Renteninformation already incorporates current bAV salary conversion.

## Implementation Implications

- Treat GRV as a baseline pension, not a product competing for contributions. It belongs in `SimulationResult.statutoryPension` and as other retirement income in product payout tax calculations.
- Keep year-specific constants in `src/rules/de2026.ts`: RV BBG, KV/PV BBG, Durchschnittsentgelt, Rentenwert, rates, and cohort table behavior.
- Document `aktuellerRentenwert: 42.52` as effective from 2026-07-01. If the UI says "today" before July 2026, it should either show 40.79 or explicitly state the projection uses the July 2026 value.
- If `annualSalaryGrowthRate` is nonzero, future work should add `durchschnittsentgeltGrowthRate` and maybe `bbgGrowthRate`, or flag that EP projection is a personal-salary scenario against a constant 2026 denominator.
- Add a legal access-age layer before modeling Zugangsfaktor. A simple version: assume factor 1.0 only when `retirementAge` is a regular/unreduced claim age; otherwise warn or compute +/- monthly adjustment.
- Keep manual override but rename/help-text it precisely:
  - "current gross pension amount in today's Rentenwert" can be indexed by `rentenwertGrowthRate`;
  - "projected gross pension from Renteninformation at retirement" should not be indexed again unless the user explicitly chooses extra growth.
- Add a retiree health-insurance status beyond `publicHealthInsurance`: `kvdr`, `freiwillig_gkv`, `pkv`. The current boolean cannot distinguish employment-phase insurance from retirement-phase contribution law.
- Model SGB VI Sec. 106 subsidy separately from contributions for freiwillig/PKV retirees. The subsidy is not a PV subsidy and does not make all income half-rate.
- Keep bAV GRV reduction optional and explain when not to use it: if the manual GRV override already reflects the salary conversion, the reduction should be off.

## Current Tool Fit And Gaps

Already aligned:

- EP-based GRV estimate uses salary capped at RV BBG divided by Durchschnittsentgelt.
- Manual gross pension override exists.
- Rentenwert growth and salary growth are available as explicit assumptions.
- 2026 preliminary Durchschnittsentgelt and RV BBG are represented in rules.
- 2026 post-July Rentenwert of 42.52 EUR is represented in rules.
- GRV income tax routes through the Sec. 22 cohort table.
- KVdR core case uses half health rate on statutory pension and full PV.
- bAV salary conversion estimates the hidden GRV pension reduction from SV-free conversion.
- Integration tests cover EP formula, BBG cap, manual override, rentenwert growth, salary growth, and bAV GRV reduction.

Potential gaps / follow-up work:

- `projectStatutoryPension` assumes Rentenartfaktor and Zugangsfaktor 1.0; early/late pension claim effects are missing.
- `aktuellerRentenwert` uses the 2026-07-01 value for the whole rule year. Good for forward projection, but potentially misleading before July 2026.
- EP projection with salary growth does not also grow Durchschnittsentgelt or BBG.
- Manual override plus positive Rentenwert growth can double-count if the input is the projected Renteninformation amount.
- GRV health treatment is hardcoded as KVdR half-rate for `pensionBaselineType === 'grv'`; voluntary GKV, PKV, and SGB VI Sec. 106 subsidy mechanics are not modeled.
- Retirement income tax is single-filer only in `calculateRetirementTax`; married/joint assessment is not implemented.
- Tax treatment applies the cohort percentage statically; it does not lock a euro tax-free amount and then tax later pension increases fully in a year-by-year retirement projection.
- bAV GRV reduction uses current constants and does not align with the optional salary/Rentenwert growth assumptions.
- If `manualMonthlyGross` already includes the bAV effect, turning on `includeGrvReduction` double-counts the reduction.

## Implementation Audit Hooks

Check these files/functions/constants in the later legal-vs-implementation audit:

| Area | Hook |
|---|---|
| GRV projection | `src/engine/grv.ts` -> `projectStatutoryPension` |
| EP estimate | `projectStatutoryPension`: `currentEntgeltpunkte`, `annualSalaryGrowthRate`, salary cap loop |
| Manual override | `projectStatutoryPension`: `manualMonthlyGross` branch and `rentenwertGrowthRate` application |
| Rentenwert | `src/rules/de2026.ts` -> `socialSecurity.aktuellerRentenwert` |
| Durchschnittsentgelt | `src/rules/de2026.ts` -> `socialSecurity.durchschnittsentgelt` |
| RV BBG | `src/rules/de2026.ts` -> `socialSecurity.pensionCapYear` |
| GRV tax cohort | `src/rules/de2026.ts` -> `besteuerungsanteilGrv`; `src/engine/retirementTax.ts` -> `calculateRetirementTax` |
| Retirement KV/PV | `src/engine/retirementTax.ts` -> `calculateRetirementKvPv` |
| GRV KV/PV routing | `src/engine/grv.ts` -> `pensionBaselineType === 'grv'` branch |
| PV child logic | `src/engine/salary.ts` -> `careEmployeeRateForChildren` |
| bAV GRV reduction | `src/engine/salary.ts` -> `calculateBavFunding`, `estimatedMonthlyGrvReduction` |
| Context wiring | `src/engine/simulationContext.ts` -> `buildContext`; `src/engine/simulate.ts` -> `projectStatutoryPension` call |
| Domain inputs | `src/domain/products/grv.ts` -> `StatutoryPensionAssumptions` |
| Defaults | `src/data/defaultScenario.ts` -> `defaultAssumptions.statutoryPension` |
| UI inputs | `src/features/inputs/GRVInputs.tsx` |
| Tests | `src/engine/simulate.integration.test.ts` section `#72 projectStatutoryPension`; `src/engine/retirementKvPv.test.ts`; `src/engine/retirementTax.test.ts`; `src/engine/products/bav.test.ts` bAV GRV reduction tests |

## Source Notes

Primary / official:

- SGB VI Sec. 63, Grundsaetze / formula principle: https://www.gesetze-im-internet.de/sgb_6/__63.html
- SGB VI Sec. 64, Rentenformel: https://www.gesetze-im-internet.de/sgb_6/__64.html
- SGB VI Sec. 68, aktueller Rentenwert and annual adjustment formula: https://www.gesetze-im-internet.de/sgb_6/__68.html
- SGB VI Sec. 69, regulation authority for Rentenwert and Durchschnittsentgelt: https://www.gesetze-im-internet.de/sgb_6/__69.html
- SGB VI Sec. 70, Entgeltpunkte for contribution periods: https://www.gesetze-im-internet.de/sgb_6/__70.html
- SGB VI Sec. 77, Zugangsfaktor: https://www.gesetze-im-internet.de/sgb_6/__77.html
- SGB VI Sec. 106, Zuschuss zur Krankenversicherung: https://www.gesetze-im-internet.de/sgb_6/__106.html
- SGB VI Sec. 158 / 159, contribution-rate and BBG framework: https://www.gesetze-im-internet.de/sgb_6/__158.html and https://www.gesetze-im-internet.de/sgb_6/__159.html
- SVBezGrV 2026, official 2026 social-security calculation values: https://www.gesetze-im-internet.de/svbezgrv_2026/SVBezGrV_2026.pdf
- BMAS Sozialversicherungsrechengroessen-Verordnung 2026 overview: https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/sozialversicherungs-rechengroessenverordnung-2026.html
- BMAS Rentenwertbestimmungsverordnung 2026 overview: https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/rentenwertbestimmungsverordnung-2026.html
- Deutsche Rentenversicherung, Rentenanpassung 2026 FAQ: https://www.deutsche-rentenversicherung.de/SharedDocs/FAQ/Gesetzesaenderungen/Rentenanpassung/FAQ-Rentenanpassung-2026/Rentenanpassung-2026.html
- Deutsche Rentenversicherung, 2026 Rentenanpassung press note: https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2026/260305-rentenanpassung-2026.html
- EStG Sec. 22, cohort taxation table for statutory pensions: https://www.gesetze-im-internet.de/estg/__22.html
- EStG Sec. 3 Nr. 63, bAV tax-free cap: https://www.gesetze-im-internet.de/estg/__3.html
- BetrAVG Sec. 1a, salary-conversion entitlement and employer subsidy: https://www.gesetze-im-internet.de/betravg/__1a.html
- SGB IV Sec. 14, Arbeitsentgelt / Entgeltumwandlung treatment: https://www.gesetze-im-internet.de/sgb_4/__14.html
- SGB V Sec. 226, contribution-relevant income and Versorgung Freibetrag: https://www.gesetze-im-internet.de/sgb_5/__226.html
- SGB V Sec. 237, contribution-relevant income for compulsory pensioners: https://www.gesetze-im-internet.de/sgb_5/__237.html
- SGB V Sec. 240, voluntary members contribution base: https://www.gesetze-im-internet.de/sgb_5/__240.html
- SGB V Sec. 241 / 242, general health rate and Zusatzbeitrag: https://www.gesetze-im-internet.de/sgb_5/__241.html and https://www.gesetze-im-internet.de/sgb_5/__242.html
- SGB V Sec. 249a, contribution bearing for compulsory pensioners with pension income: https://www.gesetze-im-internet.de/sgb_5/__249a.html
- SGB XI Sec. 55, care contribution structure, childless surcharge, child discounts, BBG: https://www.gesetze-im-internet.de/sgb_11/__55.html
- BMG, Finanzierung der Pflegeversicherung, current 3.6% / 4.2% values from 2025 onward: https://www.bundesgesundheitsministerium.de/service/begriffe-von-a-z/k/kinderlosenzuschlag.html
- Deutsche Rentenversicherung, Kranken- und Pflegeversicherung der Rentner: https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/In-der-Rente/Kranken-und-Pflegeversicherung-der-Rentner/kranken-und-pflegeversicherung-der-rentner_node.html
- Deutsche Rentenversicherung, Zuschuss zur Krankenversicherung 2026: https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2026/260323-zuschuss-krankenversicherung.html

Secondary / explanatory, used only for interpretation checks:

- Deutsche Rentenversicherung brochure "Rente: So wird sie berechnet" for user-facing formula explanation and examples.
- Existing project research docs: `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`.
