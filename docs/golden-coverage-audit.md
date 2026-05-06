# Golden coverage audit

**Status.** Historical reference. Originally written as a pre-flight audit so that the
singleton-to-instance schema migration (`schemaVersion: 1 → 2`) had a known, complete safety
net. The migration shipped; this document remains authoritative for what each oracle pins
and which behaviours are anchored externally vs. by snapshot.

**Use this when** you're about to change anything that could affect tax / payroll / payout /
funding numbers, or when you want to understand which tests would catch a regression. Do
not "tidy" the goldens — they are our externally-verified anchor.

**Sources read.**

- [`src/engine/externalGolden.test.ts`](../src/engine/externalGolden.test.ts) — drives every external-source fixture
- [`src/test/externalGoldenFixtures.ts`](../src/test/externalGoldenFixtures.ts) — fixtures + `validationSources` registry
- [`src/engine/simulate.integration.test.ts`](../src/engine/simulate.integration.test.ts) — internal end-to-end goldens, structural invariants, default-profile snapshots
- [`src/engine/__snapshots__/simulate.integration.test.ts.snap`](../src/engine/__snapshots__/simulate.integration.test.ts.snap) — committed Vitest snapshot file

## What each oracle pins

| Oracle (sourceId) | Kind | Pins |
|---|---|---|
| `bmf-est-2026-tariff` | statutory formula | §32a EStG income-tax tariff. 5 cases across the tariff curve (Grundfreibetrag boundary, Zone B mid, Zone C, 42 % zone, top tax). |
| `bmf-einkommensteuerrechner-2026` | official BMF calculator | BMF Einkommensteuer-Rechner output. 8 cases incl. Zone B/C/D boundaries, 150 k mid + 300 k Reichensteuer (Soli verified). |
| `bmf-lohnsteuerrechner-2026` | official BMF calculator | End-to-end working-phase salary engine: gross → zvE → ESt + Soli for Steuerklasse I single. 6 cases: 50/75/100/150 k GKV + child PV discount + PKV with §257 subsidy. |
| `bmas-sv-rechengroessen-2026` | official table | 2026 statutory constants: pensionCapYear, healthCareCapYear, healthAndCareCapMonth, bezugsgroesseMonthly, durchschnittsentgelt. |
| `bmas-rentenwert-2026` | official table | Aktueller Rentenwert 42.52 EUR (post 2026-07-01). |
| `drv-rentenschaetzer-current-2026` | official calculator | Pre-step 40.79 EUR Rentenwert. Used by one statutory-pension fixture row. |
| `sgb-vi-rentenformel` | statutory formula | §64 SGB VI monthly pension formula. 3 cases incl. BBG-capped EP accrual. |
| `estg-retirement-cohort-tables` | statutory formula | §22 EStG Besteuerungsanteil cohort table (3 anchors), §19 EStG Versorgungsfreibetrag cohort table (3 anchors), `calculateRetirementTax` pipeline (3 combined cases incl. Halbeinkünfte). |
| `bayern-alterseinkuenfte-rechner-2026` | official calculator (BY LfSt) | End-to-end retirement-tax pipeline against the Bayerisches LfSt Alterseinkünfte-Rechner. 6 cases: GRV-only single, bAV-only Versorgungsbezug, GRV+bAV combined, GRV+private Leibrente Ertragsanteil, married GRV-only, married GRV+bAV. Exercises §22, §19, §9a, §10c, §32a (Grund- and Splittingtarif). |
| `estg-bav-contribution-limits` | statutory formula | §3 Nr. 63 EStG (8 % BBG) and §1 SvEV (4 % BBG) bAV caps. 4 limit constants + 8 funding boundary cases (incl. PKV path, §1a Abs. 1a cap-by-employer-SV-saving, statutory subsidy disabled). |
| `bmf-vorabpauschale-basiszins-2026` | official BMF table | Basiszins 0.032 (2026). Plus 3 ETF Vorabpauschale accrual cases (gain-cap, prorated monthly purchases, opening balance) and 2 ETF exit-tax cases (with/without Vorabpauschale carryover). |
| `estg-riester-allowance-rules` | statutory formula | Riester Mindesteigenbeitrag and allowance amounts (§§ 84–86 EStG). 2 cases. |
| `drv-zfa-riester-rechner` | official calculator | DRV / ZfA Riester-Rechner. 7 cases incl. mittelbar (no own income), career-starter bonus, pre-2008 + post-2007 child mix, married direct without children. |

## What the integration test pins

`simulate.integration.test.ts` is the **internal** safety net. It drives
`simulateRetirementComparison` end-to-end with the default profile and the
default three return scenarios.

| Block | What it locks |
|---|---|
| Structure | 6 products × 3 scenarios = 18 results; product-id and scenario-id sets. |
| Fair-comparison invariant | ETF/insurance always invest the same monthly net cost as bAV; `syncMonthlyContributions` propagates a single anchor across all six products. |
| Product invariants | Basisrente `afterTaxLumpSum === null`; positive net payouts; capital strictly monotonic in return (konservativ < basis < optimistisch); `netMonthlyPayout ≤ grossMonthlyPayout`. |
| Snapshot block (basis 5 %) | `capitalAtRetirement`, `afterTaxLumpSum`, `netMonthlyPayout` for ETF, bAV, private insurance, Basisrente, AVD, Riester. Stored in `simulate.integration.test.ts.snap` (committed). |
| Snapshot block (konservativ 3 %) | ETF and bAV. |
| Default-profile end-to-end (literal numbers) | ETF, bAV, private insurance — three scenarios each. |
| `projectStatutoryPension` | Identity formula (gross = EP × Rentenwert), EP projection, manual override, balance identity (gross ≈ net + tax + KV/PV), GRV reduction, BBG cap, salary growth (zero-baseline + monotone + manual sum), Rentenwert growth (EP and manual paths). |
| Wave 15 baseline variants | Versorgungswerk (gross identical to GRV; KV/PV differs; cap reduction by VW contribs; bAV reduction = 0). Beamtenpension (gross from manual; § 19 EStG routing differs from § 22; PKV → 0 KV/PV; cap unaffected). `none` (all zeros). |

## Real coverage gaps?

> **Conclusion: none that warranted adding a black-box case before the schema migration, and none that warrant adding one now.**

Below is the conservative reasoning, item by item, against the temptation to
"top up" the goldens prophylactically.

| Candidate gap | Decision | Reasoning |
|---|---|---|
| Literal numbers for Basisrente / AVD / Riester in the default-profile end-to-end block | **Skip.** | Already locked in `simulate.integration.test.ts.snap` (committed). A drift would surface as a snapshot diff in the PR. Adding literal duplicates would be cosmetic and counts as "tidying" — out of scope. |
| Other bAV `Durchführungsweg` branches (`direktzusage`, `unterstuetzungskasse`, `40b_alt`, `pensionskasse_3_63`, `pensionsfonds_3_63`) | **Skip.** | `deriveBavLumpSumTaxMode` is unit-tested per branch in `bav.test.ts`. End-to-end coverage uses `direktversicherung_3_63` (the default). Adding new branches as oracles requires a calculator that distinguishes routes (Bayerisches LfSt does not). The unit-test net is sufficient. |
| `calculateRetirementKvPv` against an external KV/PV calculator | **Skip.** | No widely-available oracle covers multi-source retirement-phase KV/PV with BBG-proportional scaling. The proportional apportionment is a documented modeling choice (see `LEGAL_REVIEW.md`); unit tests exercise the branches. An "oracle" here would have to be a homegrown spreadsheet, which would not add information. |
| AVD / Riester payout (§22 Nr. 5 EStG) against an external oracle | **Skip.** | No public calculator exposes §22 Nr. 5 routing for AVD or Riester payouts cleanly. Funding-side coverage is strong (ZfA-Rechner). Payout side is unit-tested and locked end-to-end via the snapshot file. |
| Working-phase Splittingtarif (married Steuerklasse III) | **Skip.** | The salary engine models Steuerklasse I (single). Splittingtarif is exercised end-to-end at retirement only, where it is covered (Bayerisches LfSt rows). |
| Below-Sockelbetrag Riester proration | **Skip.** | The ZfA-Rechner does not accept inputs that fail the Sockelbetrag, so an external oracle is not available. Documented as a modeling choice and unit-tested. |
| Pre-2005 private insurance lump-sum tax-free path | **Skip.** | Branching is unit-tested (`insurance.test.ts`). End-to-end is locked via integration snapshots when the contract-vintage flag is set. The Bayern oracle covers Ertragsanteil, which is the more impactful branch. |
| Negative-return ETF payout schedule (#45 fix) | **Skip.** | Unit-tested in `etfPayout.test.ts`. Integration snapshots cover positive-return scenarios; negative-return is a guard, not a default. |
| Per-product `valueMultipleOnUserCost` | **Skip.** | Not pinned in literal numbers, but trivially derivable from the locked numerator/denominator. Adding a separate oracle line would be circular. |

## Why this still matters after the schema migration

The singleton-to-instance migration (`schemaVersion: 1 → 2`) touched:

1. **Schema and persistence** (`storage.ts`, `scenarioSchema.ts`, share-URL).
2. **Iteration over multiple instances per product type** (simulators).
3. **Result aggregation across instances** (UI, charts, tables).

It did **not** touch the math underlying tax, KV/PV, payroll, payout, cohort
tables, or fee modeling. The goldens listed above lock all of those and the
default-profile end-to-end behavior. The first instance-array adapter
reproduced the singleton path byte-identically and the integration snapshots
stayed green — that is the gate the next math-touching change should pass too.

**Standing rules** (apply to any change that runs through these surfaces):

- New per-instance schema fields must be additive via `mergeDeep`; legacy
  saved states must round-trip.
- Any change in default-profile output requires explicit test updates and a
  one-line comment in the test diff explaining the magnitude and reason
  (existing convention).
- Compare-mode singleton oracle goldens must remain byte-identical when only
  combine-mode behaviour changes — the byte-identical invariant is what makes
  this audit meaningful for future refactors.
