# Legal And Rules Review

This document tracks legal/rules research for the German retirement calculator. It is intentionally source-heavy and separate from `BACKLOG.md`, which should stay focused on actionable implementation work.

Last structured review: 2026-04-27.

## Purpose

Use this file to track:

- verified legal/rate values
- source links
- per-value source mapping for future UI display
- interpretation notes
- unresolved legal modeling questions
- rule changes that require implementation updates

## Current Rule Year

The app currently ships with `DE-2026` rule values in:

```text
src/rules/de2026.ts
```

## 2026 Baseline Values

| Area | 2026 value / rule | Implementation status |
|---|---:|---|
| Grundfreibetrag | 12,348 EUR | implemented |
| First progression end | 17,799 EUR | implemented |
| Second progression end | 69,878 EUR | implemented |
| Top tax zone starts | 277,826 EUR | implemented |
| Soli Freigrenze on income tax | 20,350 EUR | implemented |
| RV/AV BBG | 101,400 EUR/year | implemented |
| KV/PV BBG | 69,750 EUR/year | implemented |
| RV employee/employer | 9.3% / 9.3% | implemented |
| AV employee/employer | 1.3% / 1.3% | implemented |
| General GKV rate | 14.6% | implemented |
| Reduced GKV rate | 14.0% | implemented where PAP helper needs it |
| Avg Zusatzbeitrag | 2.9% | default profile updated |
| PV employee, childless | 2.4% | implemented |
| PV employee, one child | 1.8% | implemented |
| PV child discount | 0.25 pp for children 2-5 | implemented helper |
| PV employer | 1.8% | implemented |
| Retiree PV childless | 4.2% | implemented |
| bAV tax-free limit | 8% RV BBG | implemented |
| bAV SV-free limit | 4% RV BBG | implemented |
| Statutory bAV employer subsidy | 15%, capped by employer SV savings | implemented |
| Sparerpauschbetrag | 1,000 EUR | implemented in ETF model |
| Abgeltungsteuer | 25% + Soli | implemented |
| 2026 InvStG Basiszins | 3.20% | implemented |
| KV Freibetrag Versorgungsbezüge | 197.75 EUR/month | implemented |
| PV treatment for Versorgungsbezüge | Freigrenze, not Freibetrag | implemented |

## Source Links

Primary sources used during the April 2026 review:

- BMF Programmablaufplan / wage tax:
  https://www.bundesfinanzministerium.de/Datenportal/Daten/frei-nutzbare-produkte/Anwendungen/Programmablaufplan-2026/Programmablaufplan-2026.html
- BMF Vorsorgepauschale / Lohnsteuerabzug:
  https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Lohnsteuer/2025-08-14-vorsorgepau-lohnsteuerabzugsverfahren.html
- EStG §32a:
  https://www.gesetze-im-internet.de/estg/__32a.html
- EStG §39b:
  https://www.gesetze-im-internet.de/estg/__39b.html
- EStG §3:
  https://www.gesetze-im-internet.de/estg/__3.html
- EStG §20:
  https://www.gesetze-im-internet.de/estg/__20.html
- EStG §52:
  https://www.gesetze-im-internet.de/estg/__52.html
- BetrAVG §1a:
  https://www.gesetze-im-internet.de/betravg/__1a.html
- BetrAVG §17:
  https://www.gesetze-im-internet.de/betravg/__17.html
- BetrAVG §20:
  https://www.gesetze-im-internet.de/betravg/__20.html
- SGB V §226:
  https://www.gesetze-im-internet.de/sgb_5/__226.html
- SGB V §229:
  https://www.gesetze-im-internet.de/sgb_5/__229.html
- SGB XI §57:
  https://www.gesetze-im-internet.de/sgb_11/__57.html
- InvStG §18:
  https://www.gesetze-im-internet.de/invstg_2018/__18.html
- InvStG §19:
  https://www.gesetze-im-internet.de/invstg_2018/__19.html
- InvStG §20:
  https://www.gesetze-im-internet.de/invstg_2018/__20.html
- BMF 2026 Basiszins for Vorabpauschale:
  https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html
- BMG GKV contributions:
  https://www.bundesgesundheitsministerium.de/beitraege
- Bundesregierung 2026 social-security thresholds:
  https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514
- BMG Pflegeversicherung financing:
  https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung

## Important Interpretation Notes

### bAV Employer Subsidy

The default statutory employer subsidy is modeled as 15% of salary conversion, capped by actual employer social-security savings. This avoids treating the 15% as an unconditional extra contribution.

### bAV Tax And SV Limits

The app tracks total bAV contribution context, including:

- employee salary conversion
- statutory employer subsidy
- extra employer subsidy
- tax-free portion under EStG §3 Nr. 63
- SV-free portion under SvEV
- taxable overflow
- SV-liable overflow

### KV/PV In Retirement

For Versorgungsbezüge:

- KV uses the monthly Freibetrag under SGB V §226.
- PV uses a Freigrenze logic through SGB XI, not the same deduction base.

This distinction has already caused implementation mistakes, so keep it visible here.

### bAV Lump Sum

bAV lump-sum after-tax capital is currently intentionally hidden in the app. It should remain hidden until 1/120 spreading under SGB V §229 is implemented.

### ETF Vorabpauschale

The app currently uses the 2026 Basiszins across the projection unless future-year rules are added. This is a modeling assumption, not a forecast of future Basiszins values.

### Private Insurance Tax

The current pAV model still needs a law-based contract mode. Important branches:

- pre-2005 potentially tax-free contracts
- post-2004 EStG §20 treatment
- age-62 / 12-year half-income method
- fund-linked insurance special treatment

See `BACKLOG.md` item `#38`.

## Open Legal Modeling Questions

### Statutory Pension Reduction From bAV

Need a precise but understandable method for estimating lost Rentenpunkte from reduced pension-insurance contributions.

Tracked in `BACKLOG.md` item `#5`.

### bAV Retirement Income Context

Need a configurable retirement-income model:

- statutory pension
- other taxable income
- KVdR vs voluntary GKV
- lump-sum vs pension payout

Tracked in `BACKLOG.md` item `#6`.

### Private Insurance Tax Modes

Need to convert simplified pAV taxation into contract-field driven logic.

Tracked in `BACKLOG.md` item `#38`.

## Review Checklist For Future Rule Years

When creating `DE-2027` or later:

1. Update income-tax tariff values.
2. Update Soli threshold if changed.
3. Update RV/AV and KV/PV contribution ceilings.
4. Update social-security contribution rates.
5. Update average GKV Zusatzbeitrag default.
6. Update Pflegeversicherung rates and child discounts if changed.
7. Update Bezugsgröße and derived KV/PV thresholds.
8. Update bAV tax/SV limits from BBG.
9. Update InvStG Basiszins.
10. Add tests comparing old and new rule years.
11. Check whether Besteuerungsanteil progression has changed (Wachstumschancengesetz amended this).
12. Check whether Versorgungsfreibetrag progression has changed (same amendment).

---

## Retirement Tax Pipeline (#46)

Added in #46 (`src/engine/retirementTax.ts`). Implements the full retirement-phase taxable-income
pipeline used by `netBavPayout`, `afterTaxBavLumpSum`, `netInsurancePayout`, and `afterTaxInsuranceLumpSum`.

### Besteuerungsanteil (§22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe aa EStG)

Fraction of statutory GRV pension that is taxable. The remainder is the Rentenfreibetrag, which
locks in at the first full year of pension receipt and does not change in subsequent years.

**Statutory basis:**
- §22 Nr. 1 Satz 3 Buchstabe a aa EStG (primary)
- Amended by Wachstumschancengesetz (BGBl. 2024 I Nr. 101, in force 28 March 2024), which slowed
  the progression to 0.5 percentage points per year (down from up to 2 pp/year in the original 2005 schedule)
- §52 Abs. 34 EStG (transition table)
- https://www.gesetze-im-internet.de/estg/__22.html

**Schedule implemented:**

| Retirement year | Besteuerungsanteil |
|---|---|
| ≤ 2005 | 50.0 % |
| 2006–2020 | 50 % + (year − 2005) × 2 pp |
| 2021–2022 | 80 % + (year − 2020) × 1 pp |
| 2023 | 82.5 % (anchor — Wachstumschancengesetz start) |
| 2024–2057 | 82.5 % + (year − 2023) × 0.5 pp |
| ≥ 2058 | 100 % |

The 2023 anchor value of 82.5 % is the last value set by the old schedule (pre-Wachstumschancengesetz
2022: 82 %, then +0.5 pp → 82.5 % for 2023 under the new pace).

### Versorgungsfreibetrag (§19 Abs. 2 EStG)

For bAV-Renten (Direktzusage, Pensionskasse, Direktversicherung) and other Versorgungsbezüge.
The Freibetrag locks in at the retirement year (§19 Abs. 2 Satz 7 EStG: "maßgeblicher
Versorgungsbeginn") and does not change in subsequent years.

Two components:
1. **Prozentbetrag**: `prozent × gross`, capped at `hoechstbetrag`
2. **Zuschlag**: unconditional fixed addition (not capped by hoechstbetrag)

**Statutory basis:**
- §19 Abs. 2 EStG (primary)
- Amended by Wachstumschancengesetz (BGBl. 2024 I Nr. 101) to slow progression to zero by 2058
  (original table would have reached 0 by 2040)
- https://www.gesetze-im-internet.de/estg/__19.html

**Schedule implemented (post-Wachstumschancengesetz, 2023–2058):**

| Retirement year | prozent | hoechstbetrag | zuschlag |
|---|---|---|---|
| 2023 | 14.0 % | 1,050 EUR | 315 EUR |
| 2024 | 13.6 % | 1,020 EUR | 306 EUR |
| 2025 | 13.2 % |   990 EUR | 297 EUR |
| 2026 | 12.8 % |   960 EUR | 288 EUR |
| 2030 | 11.2 % |   840 EUR | 252 EUR |
| 2040 |  7.2 % |   540 EUR | 162 EUR |
| 2058 |  0.0 % |     0 EUR |   0 EUR |
| ≥ 2058 | 0 % |   0 EUR |   0 EUR |

Pre-Wachstumschancengesetz years (2005–2022) use the original faster schedule (−1.6 pp/year,
−120 EUR/year, −36 EUR/year from 2005: 40 %/3,000/900). Years before 2005 return the 2005 anchor.

**Not applied to lump-sum payouts**: §19 Abs. 2 EStG Satz 1 refers to "laufende Bezüge" (ongoing
pension payments). A one-time capital payout is not a laufender Versorgungsbezug. The pipeline
implements this via the `bavIsLumpSum` flag on `RetirementIncomeComponents`, which suppresses the
Versorgungsfreibetrag entirely for the lump-sum tax context (used in `afterTaxBavLumpSum` /
Fünftelregelung calculation).

### Pauschbeträge

| Pauschbetrag | Amount | Statutory basis |
|---|---|---|
| Werbungskosten für Versorgungsbezüge | 102 EUR/year | §9a Satz 1 Nr. 1b EStG |
| Werbungskosten für Renten (sonstige Einkünfte) | 102 EUR/year | §9a Satz 1 Nr. 3 EStG |
| Sonderausgaben-Pauschbetrag (single) | 36 EUR/year | §10c EStG |
| Sonderausgaben-Pauschbetrag (married) | 72 EUR/year | §10c EStG |

Sources:
- §9a EStG: https://www.gesetze-im-internet.de/estg/__9a.html
- §10c EStG: https://www.gesetze-im-internet.de/estg/__10c.html

Cap rules: each Werbungskosten-Pauschbetrag is capped at the corresponding gross income from
that source (cannot deduct more than earned). Werbungskosten Versorgung is capped at `bavPensionAnnual`;
Werbungskosten Renten is capped at `statutoryPensionTaxable` (after Rentenfreibetrag). Sonderausgaben
is applied once to the total zvE without a per-source cap.

### Private-Insurance Tax-Mode Routing

| Mode | Routing | Basis |
|---|---|---|
| `pre2005` | Entirely tax-free; no addition to any base | §52 Abs. 28 EStG a.F. |
| `halbeinkuenfte` | Half the gain enters personal income-tax base (marginal rate) | §20 Abs. 1 Nr. 6 EStG |
| `abgeltungsteuer` | Full gain taxed at flat 25 % + Soli; removed from personal base | §20 Abs. 2 EStG |

For `halbeinkuenfte`: `privateInsuranceTaxableAnnual / 2` is added to the personal base along
with bAV and statutory pension. The marginal tax on the insurance gain is computed as
`totalTax(baseWithGain) − totalTax(baseWithoutGain)`.

For `abgeltungsteuer`: the flat tax is `gain × 25 % × (1 + 5.5 %)`. The gain is not included
in the personal base at all. If both ordinary income and abgeltungsteuer income exist in the
same pipeline call, the personal base and flat base are separate.

### Versorgungsfreibetrag-Not-On-Lump-Sum Convention

The Versorgungsfreibetrag in §19 Abs. 2 EStG applies only to "laufende Versorgungsbezüge"
(recurring pension payments). A one-time bAV capital payout does not qualify because it is
not "laufend". The `bavIsLumpSum = true` flag suppresses the allowance for the Fünftelregelung
calculation in `afterTaxBavLumpSum`, where the lump sum / 5 is passed as a hypothetical annual
income. This prevents over-deducting a recurring allowance from a one-time spike.

### Non-Modeling Notes

- **Ehegattensplitting**: only `filingStatus = 'single'` is implemented. Calling with `'married'`
  throws an error. Joint assessment (Ehegattensplitting, double allowances, half-income tariff)
  is tracked in a future backlog item.
- **Außerordentliche Einkünfte**: only the Fünftelregelung for bAV lump sums is modeled.
  Other extraordinary income forms (§34 Abs. 1 EStG) are not implemented.
- **Kirchensteuer**: not modeled anywhere in the pipeline.
- **Sparerpauschbetrag for private insurance**: callers are responsible for passing the gain
  net of any Sparerpauschbetrag (relevant for abgeltungsteuer mode). The pipeline does not
  deduct it internally to avoid double-counting with ETF usage.
- **KV/PV deductions from zvE**: KV/PV contributions in retirement can in theory be deducted
  as Sonderausgaben under §10 EStG. This is not modeled; the pipeline focuses on gross income
  decomposition and statutory Pauschbeträge only. Tracked as #47.
