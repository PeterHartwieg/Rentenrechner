# Calculation Validation

This project should be validated against outside references in layers. There is no
single official calculator that covers ETF, bAV, private insurance, Basisrente,
Altersvorsorgedepot, Riester, retirement taxation, social security, and payout
math end to end.

The validation goal is therefore:

1. Test statutory sub-calculations against official formulas, tables, or calculators.
2. Test product-specific flows against legally decomposed intermediate values.
3. Keep full-simulation snapshots for regression protection, not as the primary
   proof of legal correctness.

## Source freshness and review routing

The "Official References" table below is mirrored into a machine-readable
source-review catalog with per-source capture and review dates:

```bash
npm run review:sources    # deterministic freshness report (-- --json / -- --fail-on-stale)
```

The catalog reuses the `validationSources` ids from
`src/test/externalGoldenFixtures.ts` plus the root research docs; unknown
review dates are shown as null, never guessed. The monthly audit procedure
and the local pre-merge calculation review toolchain are documented in
[`docs/automation/calculation-review-toolchain.md`](automation/calculation-review-toolchain.md)
(issue #382).

## Current External Golden Suite

External golden fixtures live in `src/test/externalGoldenFixtures.ts`.
The test runner is `src/engine/externalGolden.test.ts`.

The fixture file intentionally stores captured expected values as constants. Do
not derive expected values from engine helpers in that file; otherwise the test
only compares the engine with itself.

Run the suite with:

```bash
npx vitest run src/engine/externalGolden.test.ts
```

The full project verification remains:

```bash
npm run verify
```

## Official References

| Area | Use this reference | Current usage |
|------|--------------------|---------------|
| Income tax tariff | [BMF LStH 2026 §32a](https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32a/inhalt.html), [BMF Einkommensteuerrechner 2026](https://www.bmf-steuerrechner.de/ekst/eingabeformekst.xhtml) | Golden tests for tariff zones plus calculator-backed ESt + Soli captures across all four §32a zones |
| Payroll / Lohnsteuer | [BMF Lohnsteuerrechner 2026](https://www.bmf-steuerrechner.de/bl/bl2026/eingabeformbl2026.xhtml) | Golden tests for Steuerklasse I, no church tax, GKV 2.9%, PV childless surcharge/child discount, salary above BBG, and PKV with employer subsidy |
| Social-security constants | [BMAS SV-Rechengroessen 2026](https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/sozialversicherungs-rechengroessenverordnung-2026.html) | Golden tests for BBG, Bezugsgröße, Durchschnittsentgelt |
| Current pension value | [BMAS Rentenwertbestimmungsverordnung 2026](https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/rentenwertbestimmungsverordnung-2026.html) | Golden test for 42.52 EUR post-July 2026 Rentenwert |
| GRV gross pension formula | [SGB VI §64](https://www.gesetze-im-internet.de/sgb_6/__64.html) | Golden tests for EP × Rentenwert gross pension projection |
| Retirement tax pipeline | [EStG §22](https://www.gesetze-im-internet.de/estg/__22.html), [EStG §19](https://www.gesetze-im-internet.de/estg/__19.html), [EStG §9a](https://www.gesetze-im-internet.de/estg/__9a.html), [EStG §10c](https://www.gesetze-im-internet.de/estg/__10c.html) | Golden tests for Besteuerungsanteil, Versorgungsfreibetrag, Pauschbeträge, and combined taxable income |
| bAV contribution limits | [EStG §3 Nr. 63](https://www.gesetze-im-internet.de/estg/__3.html), [SvEV §1](https://www.gesetze-im-internet.de/svev/__1.html), [BetrAVG §1a Abs. 1a](https://www.gesetze-im-internet.de/betravg/__1a.html) | Golden tests for 8% tax-free and 4% SV-free 2026 BBG limits, funding outputs at the boundaries, high-match overflow, over-cap conversion, PKV employer SV saving, salary above all BBGs, fixed contractual subsidy, and disabled statutory subsidy |
| ETF Vorabpauschale / exit tax | [BMF Basiszins letter 2026](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html), [InvStG §18](https://www.gesetze-im-internet.de/invstg_2018/__18.html), [InvStG §19](https://www.gesetze-im-internet.de/invstg_2018/__19.html) | Golden tests for 3.20% basis rate, monthly purchase proration, opening-balance accrual, gain cap, and exit cost-basis carryover |
| Riester allowances | [EStG §86](https://www.gesetze-im-internet.de/estg/__86.html), [EStG §84](https://www.gesetze-im-internet.de/estg/__84.html), [EStG §85](https://www.gesetze-im-internet.de/estg/__85.html), [DRV/ZfA Riester-Rechner](https://riester.deutsche-rentenversicherung.de/DE/Riester-Rechner/riester-rechner_node) | Statutory golden tests plus captured official calculator endpoint cases for single direct eligibility, married direct/indirect eligibility, pre/post-2008 child mixes, and career-starter bonus |
| Statutory pension estimate | [DRV Rentenschaetzer](https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/Online-Rechner/Rentenschaetzer/rentenschaetzer_node.html) | Captured 2026-05-02: page still shows 40.79 EUR/EP; external golden suite includes a temporary DRV-compatible fixture while app defaults stay on announced 42.52 EUR/EP from 2026-07-01 |
| Retirement taxation calculator | [Bayerisches LfSt Alterseinkuenfte-Rechner 2026](https://www.steuerberechnung.bayern.de/Alterseinkuenfte-Rechner/2026/aekr_formular.asp?VLG=1) | Calculator-backed end-to-end captures for GRV-only, bAV-Versorgungsbezug-only, GRV+bAV combined, GRV+private-Leibrente Ertragsanteil routing, and married/Splitting GRV+bAV cases |
| Real entitlement data | [Digitale Rentenuebersicht](https://www.rentenuebersicht.de/DE/02_funktionsweise/wie_funktioniert_es_node.html) | Manual user-data cross-check only |

## Return Scenarios (Modelling Assumptions, Not Externally Validated)

The three return scenarios in `defaultAssumptions.returnScenarios`
(`src/data/defaultScenario.ts`) are **not** externally validated. They are
modelling assumptions chosen by the maintainer:

| Id | Label | Nominal return p. a. |
|----|-------|----------------------|
| `konservativ` | Konservativ | 3 % |
| `basis` | Basis | 5 % |
| `optimistisch` | Optimistisch | 7 % |

A fourth id, `custom`, is not part of the defaults. The scenario toolbar adds
it when the user creates an own scenario ("+ Eigenes Szenario", labelled
`Eigenes`, default 6 %) and edits its rate.

These rates are nominal, before inflation. The engine applies inflation
separately through `inflationRate` on `ScenarioAssumptions`: the stored default
is `0` (inflation modelling off), and enabling the inflation toggle pre-fills
2 % (`DEFAULT_EXPERT_INFLATION_RATE` in `src/data/defaultScenario.ts`). Real
values are derived afterwards as `capital / (1 + inflationRate) ** years`
(`src/engine/accumulation.ts`, `src/engine/buildResult.ts`); the nominal
return path itself is never deflated.

The band is oriented on long-run historical MSCI World returns: that is what
the `/eingaben` Annahmen section tells users ("Renditeannahmen orientieren sich
an historischen MSCI-World-Renditen"). The print report's Methode section
(`src/features/results/printReportRows.ts`) now states the same nominal,
not-externally-validated framing. No dataset, period, or publication behind
the three rates is recorded in this repository, so their derivation is not
citable. They are therefore absent from `validationSources` in
`src/test/externalGoldenFixtures.ts` and are not covered by the external-oracle
golden tests. Internal regression snapshots (`simulate.integration.test.ts`,
`src/test/scenarioReports/`) do pin their current values as regression anchors,
not as validation. Do not add a fixture entry for them — that array is reserved
for official sources with URLs and capture dates. If the MSCI World orientation
is ever pinned to a specific series, record it here first and source the
print-report wording in the same change.

All products in a comparison share the same scenario per run, so the rate is a
market assumption, not a product property. Compare mode keeps every product on
the selected scenario (see CLAUDE.md → "Fair-comparison invariant"), and the
Monte Carlo panel gives all visible products the same market path per run
while product fees, taxes, and payout modes diverge normally.

Users see the scenarios in these places:

- `/eingaben`, Annahmen section (`src/features/inputs/sections/AngabenAnnahmenSection.tsx`):
  all three default rates plus the MSCI World orientation sentence
- `/methode`, § 1 "Renditeannahmen" (`src/features/methode/MethodePage.tsx`)
- compare mode: the Rendite strip on `/vergleich`
  (`src/features/vergleich/VergleichRenditeStrip.tsx`) selects among the defaults
- combine mode: the scenario toolbar above the results
  (`src/features/workspace/ScenarioToolbar.tsx`, mounted only in the combine
  branch of `Calculator.tsx`), which also hosts the `custom` scenario
- the print report's Methode section (`src/features/results/printReportRows.ts`)

## Tolerances

Use tight tolerances when the official reference is a formula or published table.

| Calculation type | Default tolerance |
|------------------|-------------------|
| Published statutory constants and bAV limits | exact |
| §32a income tax formula | exact EUR |
| Capital-gains flat tax helper / Vorabpauschale | <= 0.01 EUR unless rounded by source |
| Payroll / Lohnsteuer calculator output | <= 1 EUR/year |
| Riester allowances / Mindesteigenbeitrag | <= 0.01 EUR |
| Retirement-tax formula pipeline | <= 0.01 EUR/year |
| Retirement-tax calculator output | <= 1 EUR/year |
| GRV gross pension formula | <= 0.01 EUR/month |
| Full product projection | scenario-specific; document the reason |

If a larger tolerance is needed, write the reason in the fixture `notes` or in a
test comment. Most larger tolerances should come from rounding periods
(monthly-vs-yearly) or source limitations, not from unknown implementation drift.

## Adding A Golden Case

1. Capture the official source output.
   Save the source URL, calculator settings, capture date, and the visible result.

2. Add or reuse a `validationSources` entry in
   `src/test/externalGoldenFixtures.ts`.

3. Add the fixture value to the relevant exported array.
   Use explicit expected numbers, not formulas that call engine functions.

4. Add the assertion in `src/engine/externalGolden.test.ts` if the fixture uses a
   new area of the engine.

5. Run:

```bash
npx vitest run src/engine/externalGolden.test.ts
npm run verify
```

## Priority Backlog

1. Add DRV Rentenschaetzer screenshots/outputs for Entgeltpunkte, Zugangsfaktor,
   and official projected gross pension handling in `src/engine/grv.ts`. A
   temporary 40.79 EUR/EP DRV-compatible fixture exists; replace or complement it
   once the DRV page switches to the 42.52 EUR/EP post-July value.

2. Extend the BMF payroll suite with Steuerklasse III/V/VI, church tax, and
   Freibetrag/Hinzurechnungsbetrag captures. Current coverage is Steuerklasse I,
   no church tax, GKV/PKV, PV child rates, and salary above BBG.

3. Add ETF payout-schedule annual tax fixtures. Gross opening-balance,
   monthly-purchase accrual, gain-cap behavior, and exit-basis carryover are covered.

4. Add Alterseinkuenfte-Rechner captures for two-spouse income allocation once
   the retirement-tax engine models per-spouse Werbungskosten-Pauschbeträge.
   Current coverage includes single-filer cases and one-earner married/Splitting
   cases.

5. Re-check Altersvorsorgedepot constants after final Bundesgesetzblatt
   publication before relying on them as official golden values.

## What Golden Tests Do Not Prove

Passing golden tests does not prove the whole calculator is legally complete.
It proves the covered slices match their outside references. Product comparisons
still rely on modeling choices such as future returns, fees, payout mode,
insurance rent factors, inflation, health-insurance status, and user-provided
entitlement data.

For release confidence, combine:

- external golden tests,
- focused unit tests for edge cases,
- end-to-end product snapshots,
- manual review of assumptions displayed in the UI,
- and a yearly statutory-value update audit.

## Scenario Report Suite (Issue #377)

Between the external golden layer and the release audits sits a local
**scenario-report suite**: 26 frozen synthetic scenarios (compare mode, combine
mode, seeded Monte Carlo) replayed through the existing engine entry points and
compared stage-by-stage against baselines captured once at a recorded engine
revision. It detects unintended numeric drift, not legal correctness — all
captured values are labelled INTERNAL REGRESSION.

See [`docs/scenario-reports.md`](scenario-reports.md) for commands, the
clean-source capture workflow, the rules-identity gate (year rules + cohort
fingerprint), and the rule-change vs model-change workflow. Run it with
`npm run scenario:report`; it also fails `npm test` on unexpected divergence.
