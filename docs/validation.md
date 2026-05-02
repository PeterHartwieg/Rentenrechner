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
