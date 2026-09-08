# Rules and Tax Context Map

For each legal / rule area: the source file, the rule file, and the research doc.

## Rule files

| File | What it contains | When to edit |
|------|-----------------|--------------|
| `src/rules/de2026.ts` | All 2026 statutory values: BBG (RV/KV), GKV/PV rates, GKV additional rate, Rentenwert, Basiszins, §32a tariff zones **and formula coefficients** (`incomeTax.tariff`), Soli-Freigrenzen, AVD allowance constants, Riester constants — plus the co-located `de2026RulesMetadata` provenance block | Once a year when BBG-Bekanntmachung and rate updates are published |
| `src/rules/legalConstants.ts` | Cross-year structural constants: 1/120 SGB V spreading factor, §34 EStG Fünftelregelung divisor, §20 Abs. 1 Nr. 6 / §52 Abs. 28 age split by contract year, 12-year runtime threshold, halbeinkünfte factor 0.5, Soli rate 5.5 % and Milderungszone 11.9 % (`soli`) | Only when underlying law changes, not on the annual cycle |
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
| §22 Nr. 1 Satz 3a Ertragsanteil (private RV Leibrente) | `src/engine/insurancePayout.ts`, `src/rules/de2026.ts` | `netInsurancePayout` + ertragsanteilByAge table |
| Insurance tax mode (§20 Abs. 1 Nr. 6, §52 Abs. 28 EStG) | `src/engine/insurancePayout.ts` | `deriveInsuranceTaxMode` + `halbeinkuenfteMinAgeForContractStartYear` |
| bAV lump-sum tax routing (§34 Abs. 2, §22 Nr. 5 EStG) | `src/engine/bavPayout.ts` | `afterTaxBavLumpSum`, `deriveBavLumpSumTaxMode` |
| Certified §22 Nr. 5 payout tax (AVD / Riester) | `src/engine/certifiedPensionPayout.ts` | `netCertifiedPensionPayout`, `afterTaxCertifiedPensionLumpSum` |
| ETF Vorabpauschale (InvStG §18, §19) | `src/engine/accumulation.ts`, `src/engine/etfPayout.ts` | `projectAccumulation` (`etfVorabpauschale` param), `etfPayoutSchedule` |
| RIY / Effektivkosten | `src/engine/fees.ts` | `computeRIY` |
| GRV EP estimate | `src/engine/grv.ts` | `projectStatutoryPension` |
| AVD allowances (§10a + AVD Reform 2026) | `src/engine/altersvorsorgedepot.ts`, `src/rules/de2026.ts` | `calculateAvdFunding` |
| Riester allowances (§84–§86 EStG) | `src/engine/riester.ts`, `src/rules/de2026.ts` | `calculateRiesterFunding` |

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
