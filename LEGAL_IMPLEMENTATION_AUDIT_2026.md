# Legal vs Implementation Audit 2026

Last audited: 2026-04-28

This audit compares the legal research notes against the actual implementation. It is a technical/legal consistency audit for the calculator, not legal, tax, or financial advice.

## Scope And Method

Research documents completed or refreshed first:

| Area | Research document |
|---|---|
| ETF depot | `ETF_RESEARCH.md` |
| bAV | `BAV_RESEARCH.md` |
| Private pension insurance | `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md` |
| Basisrente / Ruerup | `BASISRENTE_RESEARCH.md` |
| Altersvorsorgedepot 2027 | `ALTERSVORSORGEDEPOT_2027_RESEARCH.md` |
| Riester Altvertrag | `RIESTER_RESEARCH.md` |
| GRV | `GRV_RESEARCH.md` |
| Cross-product tax and social security | `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`, `LEGAL_REVIEW.md` |

Implementation areas checked:

- `src/rules/de2026.ts`, `src/rules/legalConstants.ts`
- `src/engine/tax.ts`, `src/engine/salary.ts`, `src/engine/retirementTax.ts`
- `src/engine/projections.ts`, `src/engine/grv.ts`, `src/engine/basisrente.ts`, `src/engine/altersvorsorgedepot.ts`, `src/engine/riester.ts`
- `src/engine/products/*.ts`, `src/engine/products/*.validation.ts`, product tests
- `src/engine/simulationContext.ts`, `src/engine/buildResult.ts`, `src/engine/simulate.ts`

## Executive Summary

The implementation is broadly well-structured for auditability: statutory constants are mostly centralized in `de2026.ts`, structural rules live in `legalConstants.ts`, and product modules call common tax/payout helpers instead of duplicating law logic.

Three concrete implementation defects were fixed in this pass:

| Status | Legal item | Implementation result |
|---|---|---|
| Fixed | Riester Sec. 86 Mindesteigenbeitrag | Required own contribution is now `max(60, min(4% * relevantIncome, 2100) - allowances)`, so the 75,000 EUR no-child example is 1,925 EUR/year rather than 2,825 EUR/year. |
| Fixed | bAV Sec. 1a Abs. 1a BetrAVG employer subsidy | Automatic statutory 15% subsidy is now route-aware and only applies to Direktversicherung, Pensionskasse, and Pensionsfonds. |
| Fixed | Freiwillig-versichert PV on Versorgungsbezuege | The voluntary-GKV path no longer applies the KVdR-only PV Freigrenze; voluntary broad-income PV uses the full base before BBG capping. |

The highest-priority remaining legal/modeling gaps are:

| Priority | Area | Finding |
|---|---|---|
| P1 | Basisrente | `zeitrente` is currently allowed, but a tax-favored Basisrente old-age payout should be a monthly lifelong annuity. |
| P1 | Basisrente | `netBasisrentePayout` deducts voluntary-GKV style KV/PV for every public-GKV profile. KVdR / compulsory statutory retirees normally should have no KV/PV deduction on Basisrente. |
| P1 | PKV payroll | Private KV/PV Vorsorgepauschale and Sec. 257 / Sec. 61 employer subsidy need a separate KV/PV cap model and subsidy-reduced private-premium Teilbetrag. |
| P2 | Riester | Career-starter bonus and child allowances are steady-state simplifications; the one-time 200 EUR bonus can be annualized if toggled active. |
| P2 | GRV | GRV retirement health status is hardcoded as KVdR for the GRV baseline; voluntary GKV / PKV and Sec. 106 subsidy are not modeled. |
| P2 | ETF | Retirement withdrawals use average gain-ratio cost basis, not statutory FIFO. |
| P2 | AVD | The 2027 Altersvorsorgedepot constants are based on Bundestag-adopted / Bundesrat-pending text as of 2026-04-28; re-check after Bundesrat/BGBl. |

## Fixes Applied In This Audit

### Riester Mindesteigenbeitrag

- Research item: EStG Sec. 86 formula caps the gross required contribution including allowances at 2,100 EUR before subtracting allowances.
- Previous implementation: `0.04 * relevantIncome - allowances`.
- Current implementation: `min(0.04 * relevantIncome, 2100) - allowances`, floored by the 60 EUR Sockelbetrag.
- Changed files:
  - `src/engine/riester.ts`
  - `src/engine/products/riester.test.ts`
  - `RIESTER_RESEARCH.md`

### bAV Statutory Employer Subsidy By Route

- Research item: BetrAVG Sec. 1a Abs. 1a names Pensionsfonds, Pensionskasse, and Direktversicherung for the 15% pass-through subsidy.
- Previous implementation: applied the statutory minimum whenever the boolean was enabled, even for Direktzusage / Unterstuetzungskasse.
- Current implementation: statutory subsidy only auto-applies for `direktversicherung_3_63`, `pensionskasse_3_63`, and `pensionsfonds_3_63`. Internal promise routes can still model contractual employer contributions.
- Changed files:
  - `src/engine/salary.ts`
  - `src/engine/products/bav.test.ts`
  - `BAV_RESEARCH.md`

### Freiwillig PV Freigrenze

- Research item: the bAV/Versorgungsbezug PV Freigrenze is part of the compulsory/KVdR Versorgungsbezug regime; freiwillig members are assessed under the broader Sec. 240 SGB V path.
- Previous implementation: KV correctly ignored the Freibetrag for freiwillig members, but PV still applied the Freigrenze.
- Current implementation: freiwillig PV uses the full Versorgungsbezug base before BBG scaling.
- Changed files:
  - `src/engine/retirementTax.ts`
  - `src/engine/retirementKvPv.test.ts`
  - `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`

## Cross-Product Tax And Social Security

Aligned:

- `calculateIncomeTax2026` matches the 2026 Sec. 32a tariff zones and formulas stored in `de2026Rules.incomeTax`.
- `calculateSolidarityTax` uses 5.5% and the Milderungszone shape via `min(regular, transition)`.
- `calculateCapitalGainsTax` applies partial exemption, allowance, 25% tax, and 5.5% Soli.
- RV/AV and KV/PV contribution ceilings are separated.
- Pflege childless surcharge and child discounts are implemented in `careEmployeeRateForChildren`.
- bAV 8% tax-free and 4% SV-free caps are centralized and consumed by `calculateBavFunding`.
- Retirement KV/PV is centralized in `calculateRetirementKvPv`, with aggregate KV Freibetrag and aggregate PV Freigrenze for KVdR Versorgungsbezuege.

Remaining gaps:

- P1: `calculateVorsorgepauschale2026` uses gross `pkvMonthlyPremium` and `pPVMonthlyPremium` for private KV/PV; the 2026 BMF guidance requires reducing private basis premiums by tax-free employer subsidies.
- P1: `calculatePkv257Subsidy` combines PKV and private Pflege into one cap and omits the average Zusatzbeitrag in the health-subsidy cap. The cleaner model is `min(half actual PKV, KV cap)` plus `min(half actual private Pflege, Pflege cap)`.
- P2: Vorsorgepauschale returns an unrounded amount; BMF guidance says the sum of Teilbetraege is rounded up to full euros.
- P2: Saxony Pflege split is not modeled.
- P2: Retirement tax pipeline is single-filer only; joint assessment, splitting table, and 2,000 EUR capital allowance are not represented.
- P3: Voluntary-GKV minimum contribution and full Sec. 106 statutory-pension subsidy mechanics are not modeled.

## ETF Depot

Aligned:

- ETF is treated as ordinary taxable private wealth, not a pension wrapper.
- `rules.capitalGains.taxRate = 0.25`, `solidarityRate = 0.055`, `saverAllowance = 1000`, and `basiszins = 0.032`.
- Default partial exemption of 30% fits an equity fund assumption.
- `projectAccumulation` models Vorabpauschale only where configured and records cumulative gross Vorabpauschale.
- `afterTaxInvestmentCapital` and `etfPayoutSchedule` reduce later taxable gains by cumulative gross Vorabpauschale, preventing the main double-taxation problem.
- ETF payout is a capital drawdown path, not an annuity/pension tax path.

Remaining gaps / explicit simplifications:

- P2: ETF payout schedule uses proportional average gain-ratio drawdown, not FIFO tax lots.
- P2: The annual Sparer-Pauschbetrag is assumed fully available in annual ETF payout rows; other user capital income is not modeled.
- P3: Full liquidation currently uses allowance 0, which is conservative but inconsistent with annual payout rows if the user has unused allowance.
- P3: Vorabpauschale tax is deducted from modeled portfolio value; in reality brokers often debit cash / clearing account.
- P3: Distributing ETFs, church tax, loss pots, NV certificate, foreign withholding, and Guenstigerpruefung are not modeled.

## bAV

Aligned:

- Salary conversion funding uses the 8% tax-free and 4% SV-free BBG corridors.
- Two-pass bAV funding accounts for employer contributions consuming tax/SV-free limits.
- Employer subsidy is capped by employer social-security saving.
- GRV reduction from SV-free salary conversion is modeled.
- Lump-sum tax routing distinguishes Sec. 3 Nr. 63 routes, old Sec. 40b, and Direktzusage/Unterstuetzungskasse Fuenftelregelung.
- KV/PV on running Betriebsrente and capital payout 1/120 spreading route through `calculateRetirementKvPv`.

Fixed:

- Automatic statutory 15% employer subsidy is now route-aware.

Remaining gaps / explicit simplifications:

- P2: Pensionsfonds capital payout may be restricted, often to 30%; the current bAV payout-mode UI/validation is broader.
- P2: Payout before age 62 is not blocked/warned as a legal edge case.
- P2: Sec. 100 EStG low-earner employer subsidy is not modeled.
- P2: Direktzusage and Unterstuetzungskasse are still approximated by a capital-pot projection; real employer promise/reinsured designs can differ materially.
- P3: Collective-agreement overrides are modeled only as user-controlled subsidy toggles/inputs.

## Private Pension Insurance

Aligned:

- Contract-start/runtime/retirement-age tax mode derives `pre2005`, `halbeinkuenfte`, or `abgeltungsteuer`.
- Leibrente payout uses Ertragsanteil instead of capital-gain modes.
- Lump-sum and running payout routes use the shared retirement tax pipeline where appropriate.
- Wrapper/fund fee split and pension payout fees are modeled.
- Paid-up/surrender scenario exists separately from the baseline.

Remaining gaps / explicit simplifications:

- P2: Voluntary-GKV treatment for private insurance is approximate and uses the product-level `kvdrMember` assumption carried from bAV assumptions.
- P2: Mixed subsidized/non-subsidized or old-law edge cases are simplified.
- P3: Church tax, Sparer-Pauschbetrag use, loss offsets, and exact insurer withholding mechanics are not modeled.
- P3: Inheritance/survivor options are qualitative rather than numerically modeled.

## Basisrente / Ruerup

Aligned:

- `calculateBasisrenteFunding` computes remaining Schicht-1 cap after GRV/Versorgungswerk-style pension contributions.
- `rules.basisrente.schicht1CapSingle = 30_826` and `deductibleFraction = 1.0` match the 2026 single-filer assumption.
- `buildContext` passes pension-system context into the Basisrente funding calculation.
- `afterTaxLumpSum` is always `null`.
- Income-tax payout route uses `statutoryPensionAnnual` in `calculateRetirementTax`, so the Sec. 22 cohort table is used.

Remaining gaps:

- P1: `src/engine/products/basisrente.validation.ts` allows `['leibrente', 'zeitrente']`; research indicates old-age Basisrente should be a monthly lifelong annuity.
- P1: `netBasisrentePayout` applies freiwillig-style KV/PV whenever `profile.publicHealthInsurance` is true. For KVdR / compulsory statutory retirees, Basisrente normally should not be a contribution base. The app needs an explicit retirement health-insurance status.
- P2: Retirement age below 62 is not enforced for Basisrente.
- P2: Joint assessment is not modeled for the Schicht-1 cap or tax saving.
- P3: A full retirement cashflow schedule should lock the tax-free euro pension amount rather than reapplying the cohort percentage forever.

## Altersvorsorgedepot 2027

Aligned to the working draft:

- AVD is separate from ETF and Riester.
- Rules/constants are centralized under `de2026Rules.altersvorsorgedepot`.
- Allowance engine models tiered basic allowance, child/career-starter mechanics, Guenstigerpruefung, partial capital, payout age, and transfer-cost inputs.
- Standarddepot glidepath and Sec. 22 Nr. 5 payout taxation are modeled.

Status caveat:

- As of 2026-04-28, the AVD implementation is based on the Bundestag-adopted / Bundesrat-pending text. Bundesrat Drucksache 206/26 shows the 2026-05-08 consent/deadline step. Re-check the promulgated BGBl. version before treating the constants as final law.

Remaining gaps / explicit simplifications:

- P1: Add an in-app "pending final law" warning until Bundesrat/BGBl. status is confirmed.
- P2: Eligibility is simplified; professional-pension-scheme members, data-consent conditions, self-employed/freelancer rules, and indirect spouse cases need more explicit input structure.
- P2: Child allowance and career-starter bonus are steady-state simplifications.
- P3: Voluntary-GKV / KVdR handling should be revisited after final product law and tax guidance.

## Riester Altvertrag

Aligned:

- Product is separate from AVD and ordinary ETF/private insurance.
- Constants for Grundzulage, Kinderzulage, career-starter bonus, Sockelbetrag, 4% factor, and 2,100 EUR cap are represented.
- Child allowance birth-year split is implemented.
- Allowances are prorated when contributions fall short.
- Sec. 10a deduction and Guenstigerpruefung are modeled as an extra tax refund above allowances.
- Payout and partial lump sum route through Sec. 22 Nr. 5-style ordinary income.
- Partial capital is capped at 30%.

Fixed:

- Mindesteigenbeitrag now uses the statutory 2,100 EUR cap before subtracting allowances.

Remaining gaps / explicit simplifications:

- P2: Career-starter bonus is computed once and can be annualized through accumulation if `careerStarterBonusUsed` is false and the age condition passes.
- P2: Relevant income is current modeled gross salary capped at BBG, not prior-year income with eligibility-group-specific definitions.
- P2: Direct eligibility is a boolean; indirect spouse eligibility and special groups are absent.
- P2: Child allowance attribution uses all profile child birth years, not Kindergeld recipient / parent assignment.
- P3: Payout assumes fully subsidized capital; mixed subsidized/unsubsidized existing capital is not separated.
- P3: Below-60-EUR own contributions are zeroed rather than using any more nuanced administrative proration; keep as a conservative simplification unless ZfA guidance is modeled.

## GRV

Aligned:

- EP estimate uses salary capped by RV BBG divided by Durchschnittsentgelt.
- Manual gross pension override exists.
- Rentenwert growth and salary growth are explicit assumptions.
- 2026 preliminary Durchschnittsentgelt, RV BBG, and post-July Rentenwert are represented.
- Income tax routes through Sec. 22 cohort taxation.
- Core KVdR case uses half health rate on statutory pension and full PV.
- bAV GRV reduction estimates the hidden reduction from SV-free salary conversion.

Remaining gaps / explicit simplifications:

- P2: `projectStatutoryPension` assumes Rentenartfaktor and Zugangsfaktor 1.0; early/late claim adjustments are absent.
- P2: `aktuellerRentenwert` uses the 2026-07-01 value for all of rule year 2026. That is a forward-projection choice, but on 2026-04-28 the legal amount still differs until 2026-06-30.
- P2: Salary growth does not also grow Durchschnittsentgelt or BBG, which can overstate future EP.
- P2: Manual override plus positive Rentenwert growth can double-count if the user enters a projected Renteninformation amount.
- P2: GRV health treatment is hardcoded as KVdR half-rate for the GRV baseline; voluntary GKV, PKV, and Sec. 106 subsidy are not modeled.
- P3: No year-by-year retirement tax schedule that locks a euro Rentenfreibetrag after pension start.

## Recommended Follow-Up Order

1. Basisrente compliance cleanup: remove/disable `zeitrente`, enforce or warn age 62+, add retirement health status (`kvdr`, `freiwillig_gkv`, `pkv`) and make KVdR Basisrente pay no KV/PV.
2. PKV payroll cleanup: split Sec. 257 health and Sec. 61 private Pflege subsidies, include average Zusatzbeitrag cap, reduce PKV Vorsorgepauschale by tax-free employer subsidy, round Vorsorgepauschale up to whole euros.
3. AVD final-law pass after 2026-05-08 / BGBl.: re-check constants, eligibility, warnings, and source links.
4. Riester annualization pass: one-time career-starter bonus, prior-year income, child attribution, indirect spouse.
5. GRV health/status pass: voluntary GKV / PKV and Sec. 106 subsidy, plus manual override wording.
6. ETF tax precision pass: FIFO lot model or explicit average-cost disclosure, available Sparer-Pauschbetrag input, distributions, and external cash handling for Vorabpauschale tax.

## Verification

Focused tests run after the code fixes:

```bash
npx vitest run src/engine/products/riester.test.ts src/engine/products/bav.test.ts src/engine/retirementKvPv.test.ts
```

Result: 3 test files passed, 105 tests passed.

Full repository verification was run after the audit pass:

```bash
npm run verify
```

Result: lint passed, 15 test files passed / 427 tests passed, production build passed. Vite emitted the existing large-chunk warning.

## Key Source Links

- BetrAVG Sec. 1a, bAV salary conversion and statutory subsidy: https://www.gesetze-im-internet.de/betravg/__1a.html
- EStG Sec. 3, including Sec. 3 Nr. 63 bAV tax-free contributions: https://www.gesetze-im-internet.de/estg/__3.html
- EStG Sec. 10, Schicht-1 / Basisrente contribution framework: https://www.gesetze-im-internet.de/estg/__10.html
- EStG Sec. 10a, Riester / Altersvorsorge special-expense deduction: https://www.gesetze-im-internet.de/estg/__10a.html
- EStG Sec. 20, capital income and Sparer-Pauschbetrag: https://www.gesetze-im-internet.de/estg/__20.html
- EStG Sec. 22, retirement income and Sec. 22 Nr. 5 pension-product taxation: https://www.gesetze-im-internet.de/estg/__22.html
- EStG Sec. 32a, 2026 income-tax tariff: https://www.gesetze-im-internet.de/estg/__32a.html
- EStG Sec. 32d, capital-gains tax tariff: https://www.gesetze-im-internet.de/estg/__32d.html
- EStG Sec. 84, Riester Grundzulage / career-starter bonus: https://www.gesetze-im-internet.de/estg/__84.html
- EStG Sec. 85, Riester child allowance: https://www.gesetze-im-internet.de/estg/__85.html
- EStG Sec. 86, Riester Mindesteigenbeitrag: https://www.gesetze-im-internet.de/estg/__86.html
- SGB V Sec. 226, KV contribution base and Versorgungsbezug Freibetrag: https://www.gesetze-im-internet.de/sgb_5/__226.html
- SGB V Sec. 229, Versorgungsbezuege and 1/120 bAV capital spreading: https://www.gesetze-im-internet.de/sgb_5/__229.html
- SGB V Sec. 240, voluntary statutory health member contribution base: https://www.gesetze-im-internet.de/sgb_5/__240.html
- SGB V Sec. 249a, GRV health contribution bearing for compulsory pensioners: https://www.gesetze-im-internet.de/sgb_5/__249a.html
- SGB V Sec. 257, employer subsidy for private health insurance: https://www.gesetze-im-internet.de/sgb_5/__257.html
- SGB XI Sec. 55, Pflege rates and child discounts: https://www.gesetze-im-internet.de/sgb_11/__55.html
- SGB XI Sec. 57, Pflege contribution rules for pensioners / Versorgungsbezuege: https://www.gesetze-im-internet.de/sgb_11/__57.html
- SGB XI Sec. 61, employer subsidy for private Pflege-Pflichtversicherung: https://www.gesetze-im-internet.de/sgb_11/__61.html
- InvStG Sec. 18, Vorabpauschale: https://www.gesetze-im-internet.de/invstg_2018/__18.html
- InvStG Sec. 19, sale gains and prior Vorabpauschalen: https://www.gesetze-im-internet.de/invstg_2018/__19.html
- InvStG Sec. 20, investment-fund partial exemptions: https://www.gesetze-im-internet.de/invstg_2018/__20.html
- BMF 2026 Vorsorgepauschale guidance, 2025-08-14: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Lohnsteuer/2025-08-14-vorsorgepau-lohnsteuerabzugsverfahren.pdf
- BMF 2026 Basiszins for Vorabpauschale, 2026-01-13: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html
- SVBezGrV 2026, official 2026 social-security values: https://www.gesetze-im-internet.de/svbezgrv_2026/BJNR1160A0025.html
- Bundesrat Drucksache 206/26, Altersvorsorgereformgesetz working text / 2026-05-08 step: https://dserver.bundestag.de/brd/2026/0206-26.pdf
