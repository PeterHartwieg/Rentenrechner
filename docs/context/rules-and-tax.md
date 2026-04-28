# Rules and Tax Context Map

For each legal / rule area: the source file, the rule file, and the research doc.

## Rule files

| File | What it contains | When to edit |
|------|-----------------|--------------|
| `src/rules/de2026.ts` | All 2026 statutory values: BBG (RV/KV), GKV/PV rates, GKV additional rate, Rentenwert, Basiszins, Besteuerungsanteil cohort table, Versorgungsfreibetrag table, Ertragsanteil table, AVD allowance constants, Riester constants | Once a year when BBG-Bekanntmachung and rate updates are published |
| `src/rules/legalConstants.ts` | Cross-year structural constants: 1/120 SGB V spreading factor, §34 EStG Fünftelregelung divisor, §20 Abs. 1 Nr. 6 age/runtime thresholds, halbeinkünfte factor 0.5 | Only when underlying law changes, not on the annual cycle |
| `src/rules/index.ts` | Re-exports `activeRules` and `legalConstants`; swap to a new year by changing one line | To add a new rule year |

## Engine files by legal area

| Legal area | Engine file | Key function |
|-----------|-------------|-------------|
| Income tax (§32a EStG tariff) | `src/engine/tax.ts` | `calculateIncomeTax2026` |
| Solidarity surcharge (§3 SolZG Milderungszone) | `src/engine/tax.ts` | `calculateSolidarityTax` |
| Capital gains tax (§20 EStG + InvStG §20 partial exemption) | `src/engine/tax.ts` | `calculateCapitalGainsTax` |
| Payroll tax / Vorsorgepauschale (§39b EStG) | `src/engine/salary.ts` | `calculateSalaryResult`, `calculateVorsorgepauschale2026` |
| bAV salary conversion limits (§3 Nr. 63 EStG, §1 SvEV) | `src/engine/salary.ts` | `calculateBavFunding` |
| PKV employer subsidy (§257 SGB V, §3 Nr. 62 EStG) | `src/engine/salary.ts` | `calculatePkv257Subsidy` |
| Retirement-phase income tax pipeline | `src/engine/retirementTax.ts` | `calculateRetirementTax` |
| GRV Besteuerungsanteil (§22 Nr. 1 Satz 3 a aa EStG) | `src/engine/retirementTax.ts` + `src/rules/de2026.ts` | cohort table in rules |
| Versorgungsfreibetrag (§19 Abs. 2 EStG) | `src/engine/retirementTax.ts` | applied inside `calculateRetirementTax` |
| Basisrente Schicht-1 cap (§10 Abs. 3 EStG) | `src/engine/basisrente.ts` | `calculateBasisrenteFunding` |
| KV/PV on Versorgungsbezüge (§229 SGB V, §226(2), §57 SGB XI) | `src/engine/projections.ts` | `netBavPayout`, `afterTaxBavLumpSum` |
| KVdR (§249a SGB V half-rate) | `src/engine/grv.ts`, `src/engine/projections.ts` | `projectStatutoryPension`, `netBavPayout` |
| §22 Nr. 1 Satz 3a Ertragsanteil (private RV Leibrente) | `src/engine/projections.ts`, `src/rules/de2026.ts` | `netInsurancePayout` + ertragsanteilByAge table |
| Insurance tax mode (§20 Abs. 1 Nr. 6, §52 Abs. 28 EStG) | `src/engine/projections.ts` | `deriveInsuranceTaxMode` |
| bAV lump-sum tax routing (§34 Abs. 2, §22 Nr. 5 EStG) | `src/engine/projections.ts` | `afterTaxBavLumpSum`, `deriveBavLumpSumTaxMode` |
| ETF Vorabpauschale (InvStG §18, §19) | `src/engine/projections.ts` | `projectAccumulation` (etfVorabpauschale param) |
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
