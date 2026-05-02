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
| Income tax tariff | [BMF LStH 2026 §32a](https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32a/inhalt.html) | Golden tests for tariff zones |
| Payroll / Lohnsteuer | [BMF Lohnsteuerrechner 2026](https://www.bmf-steuerrechner.de/bl/bl2026/eingabeformbl2026.xhtml) | Golden tests for Steuerklasse I, GKV 2.9%, no church tax |
| Social-security constants | [BMAS SV-Rechengroessen 2026](https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/sozialversicherungs-rechengroessenverordnung-2026.html) | Golden tests for BBG, Bezugsgröße, Durchschnittsentgelt |
| ETF Vorabpauschale basis rate | [BMF Basiszins letter 2026](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html) | Golden test for 3.20% basis rate |
| Riester allowances | [EStG §86](https://www.gesetze-im-internet.de/estg/__86.html), [EStG §84](https://www.gesetze-im-internet.de/estg/__84.html), [EStG §85](https://www.gesetze-im-internet.de/estg/__85.html), [DRV/ZfA Riester-Rechner](https://riester.deutsche-rentenversicherung.de/DE/Riester-Rechner/riester-rechner_themen-einstieg) | Seed statutory golden tests; ZfA calculator screenshots still to capture |
| Statutory pension estimate | [DRV Rentenschaetzer](https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/Online-Rechner/Rentenschaetzer/rentenschaetzer_node.html) | Not yet captured |
| Retirement taxation | [Bavarian tax office Alterseinkuenfte-Rechner](https://www.finanzamt.bayern.de/Informationen/Steuerinfos/Steuerberechnung/Alterseinkuenfte-Rechner/) | Not yet captured |
| Real entitlement data | [Digitale Rentenuebersicht](https://www.rentenuebersicht.de/DE/02_funktionsweise/wie_funktioniert_es_node.html) | Manual user-data cross-check only |

## Tolerances

Use tight tolerances when the official reference is a formula or published table.

| Calculation type | Default tolerance |
|------------------|-------------------|
| Published statutory constants | exact |
| §32a income tax formula | exact EUR |
| Capital-gains flat tax helper | <= 0.01 EUR unless rounded by source |
| Payroll / Lohnsteuer calculator output | <= 1 EUR/year |
| Riester allowances / Mindesteigenbeitrag | <= 0.01 EUR |
| Retirement-tax calculator output | <= 1 EUR/year |
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

1. Add DRV Rentenschaetzer cases for Entgeltpunkte, Zugangsfaktor, and
   aktueller Rentenwert handling in `src/engine/grv.ts`.

2. Add Alterseinkuenfte-Rechner cases for:
   GRV-only retirement income, bAV Versorgungsbezug with
   Versorgungsfreibetrag, and combined GRV + bAV + private annuity income.

3. Add bAV boundary fixtures for 4% and 8% BBG salary conversion limits.
   Official calculators are scarce here, so use published statutory values plus
   intermediate calculations.

4. Add ETF Vorabpauschale scenarios for opening balance, monthly purchases,
   partial exemption, and gain cap behavior.

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
