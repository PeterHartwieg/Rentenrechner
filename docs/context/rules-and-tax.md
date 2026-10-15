# Rules and Tax Context Map

For each legal / rule area: the source file, the rule file, and the research doc.

## Rule files

| File | What it contains | When to edit |
|------|-----------------|--------------|
| `src/rules/de2026.ts` | All 2026 statutory values: BBG (RV/KV), GKV/PV rates, GKV additional rate, Rentenwert, Basiszins, §32a tariff zones **and formula coefficients** (`incomeTax.tariff`), Soli-Freigrenzen, AVD allowance constants, Riester constants — plus the co-located `de2026RulesMetadata` provenance block | Once a year when BBG-Bekanntmachung and rate updates are published |
| `src/rules/legalConstants.ts` | Cross-year structural constants: 1/120 SGB V spreading factor, §34 EStG Fünftelregelung divisor, §20 Abs. 1 Nr. 6 / §52 Abs. 28 age split by contract year, 12-year runtime threshold, halbeinkünfte factor 0.5, Soli rate 5.5 % and Milderungszone 11.9 % (`soli`), §39b PAP KV+PV+AV cap (`payrollTax.vorsorgepauschaleKvPvAvCap`), §1a BetrAVG divisor (`bav.minimumEntitlementDivisor`), §55 Abs. 3a SGB XI Beitragsabschlag + under-25 child window (`care` / `childEligibility`), cohort lookup functions (`besteuerungsanteilGrv`, `versorgungsfreibetrag`, `ertragsanteilByAge`), standalone §9a/§10c Pauschbeträge and §20 InvStG Teilfreistellung — the `legalRuleData` catalog enumerates every exported non-function datum for the content fingerprint | Functions: only on law amendment; data: amend together with a `revision` bump |
| `src/rules/ruleMetadata.ts` | Calculation-model id/version (`TAX_CALCULATION_MODEL`), provenance types, projection-assumption and replay-limitation caveats | Only when the implemented formula (algorithm) changes — bump the model version |
| `src/rules/index.ts` | Re-exports `activeRules` and `legalConstants`; swap to a new year by changing one line; exports `activeRulesMetadata` + `rulesMetadataById` for the scenario runner / UI | To add a new rule year |

Workflow for annual updates, algorithm changes, and the metadata contract —
including what a ruleSetId does and does not guarantee for historical replay:
[`../rules-versioning.md`](../rules-versioning.md).

## Engine files by legal area

| Legal area | Engine file | Key function |
|-----------|-------------|-------------|
| Income tax (§32a EStG tariff) | `src/engine/tax.ts` | `calculateIncomeTax2026` — zones from `rules.incomeTax`, formula coefficients from `rules.incomeTax.tariff` (no engine literals) |
| Solidarity surcharge (§3/§4 SolZG Milderungszone) | `src/engine/tax.ts` | `calculateSolidarityTax` — rate + slope from `legalConstants.soli`, Freigrenze from `rules.incomeTax` |
| Capital gains tax (§20 EStG + InvStG §20 partial exemption) | `src/engine/tax.ts` | `calculateCapitalGainsTax` |
| Payroll tax / Vorsorgepauschale (§39b EStG) | `src/engine/salary.ts` | `calculateSalaryResult`, `calculateVorsorgepauschale2026` |
| bAV salary conversion limits (§3 Nr. 63 EStG, §1 SvEV) | `src/engine/salary.ts` | `calculateBavFunding` |
| PKV employer subsidy (§257 SGB V, §3 Nr. 62 EStG) | `src/engine/salary.ts` | `calculatePkv257Subsidy` |
| Retirement-phase income tax pipeline | `src/engine/retirementTax.ts` | `calculateRetirementTax` |
| GRV Besteuerungsanteil (§22 Nr. 1 Satz 3 a aa EStG) | `src/engine/retirementTax.ts` + `src/rules/de2026.ts` | cohort table in rules |
| Versorgungsfreibetrag (§19 Abs. 2 EStG) | `src/engine/retirementTax.ts` | applied inside `calculateRetirementTax` |
| Basisrente Schicht-1 cap (§10 Abs. 3 EStG) | `src/engine/basisrente.ts` | `calculateBasisrenteFunding` |
| KV/PV on Versorgungsbezüge (§229 SGB V, §226(2), §57 SGB XI) | `src/engine/bavPayout.ts`, `src/engine/retirementPayout.ts` | `netBavPayout`, `afterTaxBavLumpSum`, shared KV/PV helpers |
| KVdR (§249a SGB V half-rate) | `src/engine/grv.ts`, `src/engine/bavPayout.ts` | `projectStatutoryPension`, `netBavPayout` |
| §22 Nr. 1 Satz 3a Ertragsanteil (private RV Leibrente) | `src/engine/insurancePayout.ts`, `src/rules/de2026.ts` | `classifyInsuranceMonthlyIncome` + ertragsanteilByAge table |
| Insurance tax mode (§20 Abs. 1 Nr. 6, §52 Abs. 28 EStG) | `src/engine/insurancePayout.ts` | `deriveInsuranceTaxMode` + `halbeinkuenfteMinAgeForContractStartYear` |
| Private RV monthly classification (both modes) | `src/engine/insurancePayout.ts` | `classifyInsuranceMonthlyIncome` — compare (`netInsurancePayout`) and combine (`portfolioCombine`) share one implementation |
| bAV lump-sum tax routing (§34 Abs. 2, §22 Nr. 5 EStG) | `src/engine/bavPayout.ts` | `afterTaxBavLumpSum`, `deriveBavLumpSumTaxMode` |
| Certified §22 Nr. 5 payout tax (AVD / Riester) | `src/engine/certifiedPensionPayout.ts` | `netCertifiedPensionPayout`, `afterTaxCertifiedPensionLumpSum` |
| ETF Vorabpauschale (InvStG §18, §19) | `src/engine/accumulation.ts`, `src/engine/etfPayout.ts` | `projectAccumulation` (`etfVorabpauschale` param), `etfPayoutSchedule` |
| RIY / Effektivkosten | `src/engine/fees.ts` | `computeRIY` |
| GRV EP estimate | `src/engine/grv.ts` | `projectStatutoryPension` |
| GRV EP wizard estimate (UI seed) | `src/features/inventory/inventoryHelpers.ts` | `estimateEpFromYears`, `estimateCareerPension` |
| AVD allowances (§10a + AVD Reform 2026) | `src/engine/altersvorsorgedepot.ts`, `src/rules/de2026.ts` | `calculateAvdFunding` |
| Riester allowances (§84–§86 EStG) | `src/engine/riester.ts`, `src/rules/de2026.ts` | `calculateRiesterFunding` |

## Corrected values

**GRV wizard EP estimate (2026-09).** `estimateEpFromYears` in
`src/features/inventory/inventoryHelpers.ts` hardcoded `durchschnittsentgelt = 47_079`
while the active rule value is `de2026.ts` `socialSecurity.durchschnittsentgelt = 51_944`.
The helper now reads the rule set — the same denominator `projectStatutoryPension`
divides by — so the wizard no longer seeds `currentEntgeltpunkte` ~10.3 % too high.
New estimates therefore come out **9.37 % lower** (e.g. 50 000 EUR/yr over 40 years:
42.4818 EP → 38.5030 EP, about −169 EUR/month gross at `aktuellerRentenwert = 42.52`).
Already-persisted `currentEntgeltpunkte` values are **not** migrated; only new estimates
use the corrected helper. No oracle snapshot was affected — the engine was always correct.

## Research and source references

| Doc | Covers |
|-----|--------|
| `LEGAL_REVIEW.md` | Source links, 2026 baseline values, legal interpretation notes for all implemented rules |
| `BAV_RESEARCH.md` | bAV-specific legal and product details |
| `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md` | Private insurance tax modes, Ertragsanteil, Schicht-3 scope |
| `ALTERSVORSORGEDEPOT_2027_RESEARCH.md` | AVD Reform 2026 allowance formula, Günstigerprüfung, glidepath rules |
| `TAX_SOCIAL_SECURITY_2026_RESEARCH.md` | Cross-product 2026 income tax, payroll, social-security, PKV subsidy, retirement KV/PV constants |
| `ETF_RESEARCH.md` | ETF capital gains, InvStG partial exemptions, Vorabpauschale, FIFO simplification |
| `BASISRENTE_RESEARCH.md` | Schicht-1 cap, Basisrente payout restrictions, cohort taxation, KV/PV status split |
| `GRV_RESEARCH.md` | Entgeltpunkte, Rentenwert, GRV tax, KVdR/voluntary/PKV treatment, bAV GRV reduction |
| `RIESTER_RESEARCH.md` | Legacy Riester allowances, Mindesteigenbeitrag, Sec. 10a, payout taxation, partial lump sum |
| `LEGAL_IMPLEMENTATION_AUDIT_2026.md` | 2026-04-28 legal-vs-implementation audit findings, fixes, and remaining modeling gaps |
| `docs/validation.md` | External golden-test strategy, official calculator/source map, tolerances, and validation backlog |


## bAV monthly classification (math audit, October 2026)

`classifyBavMonthlyIncome` in `bavPayout.ts` is shared by the compare simulator
and `portfolioCombine.ts`. §3 Nr. 63 Direktversicherung, Pensionskasse and
Pensionsfonds payments enter the fully taxable §22 Nr. 5 channel, for every
mode. Direktzusage and Unterstützungskasse retain the §19 channel and its
Versorgungsfreibetrag. KV/PV classification remains independently §229 SGB V.

For §40b old contracts, lifelong pensions use the retirement-age Ertragsanteil,
even when the capital-payout eligibility flag is true. Nonlife payments reuse
the existing insurance gain-ratio base (with a zero loss floor); a confirmed
`pre2005EligibleTaxFree` flag makes that base zero. These amounts enter the
personal tariff as §22 income, never the §32d flat tax.

Primary sources checked on 2026-10-14:

- [§22 Nr. 5 EStG, DRV legal text](https://rvrecht.deutsche-rentenversicherung.de/SharedDocs/rvRecht/05_Normen_und_Vertraege/02_C-K/EStG/0022/0022_2025_01_01.html):
  Satz 1 (funded benefits), Satz 2 a/b (unfunded lifetime/other benefits),
  Satz 11 (narrow Pensionsfonds grandfather exception).
- [BMF EStH 2025, Anhang 1a I](https://amtliche-handbuecher.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-01a/I/inhalt.html):
  Rn. 128 excludes Abgeltungsteuer for §22 Nr. 5; Rn. 145–147 distinguish
  lifetime Ertragsanteil from other insurance benefits and old-contract
  capital-payout eligibility.

Model limits: the schema does not represent mixed funded/unfunded portions or
already-paying §3 Nr. 66 commitments transferred into Pensionsfonds (Satz 11).
`pensionsfonds_3_63` is an ordinary funded contract, not that exception. For
nonqualifying old-contract nonlife benefits the existing proportional positive
gain model is retained; no vintage-specific interest ledger or loss deduction
is added. Retirement KV/PV income-tax deductions and the tax pipeline's
existing §22 Werbungskosten scope are outside this classification correction.

Reproduction: GRV €2,000/month plus funded bAV €1,000/month, retirement 2027,
single filing, active 2026 tariff: annual aggregate tax €4,452 → €4,828
(+€376); bAV marginal net before KV/PV €762.75 → €731.4166667/month.
Internal default-profile bAV net snapshots fall by €32/year (€2.6666667/month)
in each return scenario; capital, funding and lump-sum results stay unchanged.
The two-bAV combine example's aggregate tax is €8,931 → €8,965 (+€34/year).
External §19 tax oracle fixtures are unchanged. Tax formula model metadata is
unchanged because this fixes payout classification, outside its narrow scope.

The frozen scenario suite changes 19 of 27 cases, exclusively 306 tax stages
and 174 net stages (480 of 5,872 total); funding, accumulation, KV/PV and all
external anchors are unchanged. For example `combine-single-bav/single-conversion`
annual aggregate tax rises €59/€66/€76 in conservative/baseline/optimistic
returns; household net falls €4.9166667/€5.5/€6.3333333 per month. These are
intentional internal regression re-pins caused by removing §19 allowances.
