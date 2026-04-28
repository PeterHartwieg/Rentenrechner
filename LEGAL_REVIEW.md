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
| PV employee, childless | 2.4% standard / 2.9% Saxony | standard implemented; Saxony not modeled |
| PV employee, one child | 1.8% standard / 2.3% Saxony | standard implemented; Saxony not modeled |
| PV child discount | 0.25 pp for children 2-5 | implemented helper |
| PV employer | 1.8% standard / 1.3% Saxony | standard implemented; Saxony not modeled |
| Retiree PV childless | 4.2% | implemented |
| bAV tax-free limit | 8% RV BBG | implemented |
| bAV SV-free limit | 4% RV BBG | implemented |
| Statutory bAV employer subsidy | 15%, capped by employer SV savings | implemented |
| Sparerpauschbetrag | 1,000 EUR | implemented in ETF model |
| Abgeltungsteuer | 25% + Soli | implemented |
| 2026 InvStG Basiszins | 3.20% | implemented |
| KV Freibetrag Versorgungsbezüge | 197.75 EUR/month | implemented |
| PV treatment for Versorgungsbezüge | Freigrenze, not Freibetrag | implemented |

## April 2026 Official Source Recheck

Checked against official sources on 2026-04-27:

- Confirmed: 2026 income-tax tariff thresholds, Soli Freigrenze, social-security ceilings, GKV/PV rates, average Zusatzbeitrag, bAV limits, Sparerpauschbetrag, Abgeltungsteuer, 2026 InvStG Basiszins, and KV/PV treatment for Versorgungsbezüge.
- Clarified: the implemented PV employee/employer split is the standard non-Saxony split. Saxony has a different split (employee +0.5 pp, employer -0.5 pp) and is not modeled.
- Corrected citation: Wachstumschancengesetz is BGBl. 2024 I Nr. 108, not Nr. 101.
- Corrected citation: Sozialversicherungsrechengrößen-Verordnung 2026 is BGBl. 2025 I Nr. 278; the KV/PV 69,750 EUR/year figure is in §2 Abs. 2, and the RV 101,400 EUR/year figure is in §4 Abs. 1.
- Extra checked value not yet in the baseline table: the official preliminary Durchschnittsentgelt 2026 is 51,944 EUR under SVBezGrV 2026 §3 Abs. 2. `src/rules/de2026.ts` currently has `durchschnittsentgelt: 45_358`, which is stale if used for 2026 Entgeltpunkte estimates.
- Extra checked value not yet in the baseline table: the current Rentenwert is 40.79 EUR/EP through 2026-06-30 and rises to 42.52 EUR/EP from 2026-07-01 per Deutsche Rentenversicherung. `src/rules/de2026.ts` currently has `aktuellerRentenwert: 39.32`, which is stale for April 2026 unless intentionally modeling the pre-2025-07 value.

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
- EStG §32d:
  https://www.gesetze-im-internet.de/estg/__32d.html
- EStG §52:
  https://www.gesetze-im-internet.de/estg/__52.html
- EStG §19:
  https://www.gesetze-im-internet.de/estg/__19.html
- EStG §22:
  https://www.gesetze-im-internet.de/estg/__22.html
- EStG §34:
  https://www.gesetze-im-internet.de/estg/__34.html
- EStG §9a:
  https://www.gesetze-im-internet.de/estg/__9a.html
- EStG §10c:
  https://www.gesetze-im-internet.de/estg/__10c.html
- SolzG 1995 §3:
  https://www.gesetze-im-internet.de/solzg_1995/__3.html
- BetrAVG §1a:
  https://www.gesetze-im-internet.de/betravg/__1a.html
- BetrAVG §17:
  https://www.gesetze-im-internet.de/betravg/__17.html
- BetrAVG §20:
  https://www.gesetze-im-internet.de/betravg/__20.html
- SvEV §1:
  https://www.gesetze-im-internet.de/svev/__1.html
- SGB V §226:
  https://www.gesetze-im-internet.de/sgb_5/__226.html
- SGB V §229:
  https://www.gesetze-im-internet.de/sgb_5/__229.html
- SGB V §241:
  https://www.gesetze-im-internet.de/sgb_5/__241.html
- SGB V §243:
  https://www.gesetze-im-internet.de/sgb_5/__243.html
- SGB V §240:
  https://www.gesetze-im-internet.de/sgb_5/__240.html
- SGB V §248:
  https://www.gesetze-im-internet.de/sgb_5/__248.html
- SGB V §249a:
  https://www.gesetze-im-internet.de/sgb_5/__249a.html
- SGB V §250:
  https://www.gesetze-im-internet.de/sgb_5/__250.html
- SGB VI §106:
  https://www.gesetze-im-internet.de/sgb_6/__106.html
- SGB III §341:
  https://www.gesetze-im-internet.de/sgb_3/__341.html
- SGB XI §55:
  https://www.gesetze-im-internet.de/sgb_11/__55.html
- SGB XI §57:
  https://www.gesetze-im-internet.de/sgb_11/__57.html
- SVBezGrV 2026:
  https://www.gesetze-im-internet.de/svbezgrv_2026/
- RVBeitrSBek 2026:
  https://www.gesetze-im-internet.de/rvbeitrsbek_2026/BJNR1230A0025.html
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
- Deutsche Rentenversicherung 2026 Rentenanpassung:
  https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2026/260305-rentenanpassung-2026.html
- BFH X R 25/23, 2025-10-30, bAV capital payout / no reduced rate where free capital option:
  https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE202620036/
- Bundesgesetzblatt Wachstumschancengesetz:
  https://www.recht.bund.de/bgbl/1/2024/108/VO.html

## Important Interpretation Notes

### bAV Employer Subsidy

The default statutory employer subsidy is modeled as 15% of salary conversion, capped by actual employer social-security savings. This avoids treating the 15% as an unconditional extra contribution.

`#51`: statutory and contractual employer contributions are modeled as **two distinct concepts** that **stack**. The statutory part (§1a Abs. 1a BetrAVG) is a *minimum* — 15 % of the SV-free conversion, capped by actual employer SV savings — and is toggleable via `statutoryMinimumSubsidyEnabled` (e.g. when fully waived under a collective agreement). The contractual part (`contractualMatchPercent`, `contractualFixedMonthly`) is the uncapped match the employer actually promised on top. The effective employer contribution paid into the bAV is the sum.

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

bAV lump-sum after-tax capital is no longer hidden: #47/#48 implemented the §229 SGB V 1/120 KV/PV spreading and tax-mode routing by Durchführungsweg. Keep this section visible because a future refactor must preserve the distinction between income-tax routing and KV/PV routing.

### ETF Vorabpauschale

The app currently uses the 2026 Basiszins across the projection unless future-year rules are added. This is a modeling assumption, not a forecast of future Basiszins values.

### Private Insurance Tax

The pAV model now routes by law-based tax mode (`pre2005`, `halbeinkuenfte`, `abgeltungsteuer`).
Important branches:

- pre-2005 potentially tax-free contracts
- post-2004 EStG §20 treatment
- age-62 / 12-year half-income method
- fund-linked insurance special treatment

Remaining known issue: `BACKLOG.md` item `#44` tracks deriving contract runtime from calendar
years instead of using only `retirementAge - age`.

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

### Private Insurance Tax Runtime

Need to derive pAV contract runtime from `contractStartYear` and payout year so old and
post-2004 contracts are classified correctly.

Tracked in `BACKLOG.md` item `#44`.

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
- Amended by Wachstumschancengesetz (BGBl. 2024 I Nr. 108, in force 28 March 2024), which slowed
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
- Amended by Wachstumschancengesetz (BGBl. 2024 I Nr. 108) to slow progression to zero by 2058
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
  decomposition and statutory Pauschbeträge only.

---

## Retirement KV/PV (#47)

Implemented in `src/engine/retirementTax.ts` (`calculateRetirementKvPv`) and wired into
`netBavPayout`, `afterTaxBavLumpSum`, `netInsurancePayout`, and `afterTaxInsuranceLumpSum`
in `src/engine/projections.ts`.

### §226 Abs. 2 SGB V — KV-Freibetrag for Versorgungsbezüge

The monthly KV-Freibetrag (197.75 EUR/month in 2026, = 1/20 of monthly Bezugsgröße West 3,955 EUR)
is granted **once per month on the aggregate** of all Versorgungsbezüge, not once per source.
Implementation: sum all Versorgungsbezüge sources first, deduct one Freibetrag from the total,
then split the KV-relevant excess proportionally back to each source.

**Important:** §226 Abs. 2 SGB V applies only to KVdR-Pflichtversicherte (§5 Abs. 1 Nr. 11 SGB V).
For freiwillig Versicherte under §240 SGB V, the FULL Versorgungsbezüge amount is the KV base
(no Freibetrag). The implementation conditions the Freibetrag deduction on `!isFreiwilligVersichert`.

Source: §226 Abs. 2 SGB V — https://www.gesetze-im-internet.de/sgb_5/__226.html

### §229 SGB V — Versorgungsbezüge definition

§229 Abs. 1 SGB V defines which income categories count as Versorgungsbezüge for KV purposes:
bAV Renten (Direktzusage, Pensionskasse, Direktversicherung, Pensionsfonds), Beamtenpensionen,
and similar occupational pensions. Private life-insurance/annuity payouts are explicitly
NOT Versorgungsbezüge — they are private capital income.

Source: §229 SGB V — https://www.gesetze-im-internet.de/sgb_5/__229.html

### §240 SGB V — Beitragsrecht für freiwillig Versicherte

For freiwillig Versicherte, the full income up to the monthly BBG is the contribution base
(§240 Abs. 1 SGB V). This includes:
- Statutory pension (GRV-Rente)
- Versorgungsbezüge (bAV pensions, etc.)
- Private insurance income (NOT categorized as Versorgungsbezüge, but still counted under §240)
- Rental income, dividends, etc.

Implementation: private insurance income flows through `freiwilligOtherMonthlyIncome` in
`RetirementKvPvContext` and is only assessed for freiwillig Versicherte.

For KVdR-Pflichtversicherte, private insurance income does NOT trigger KV/PV — consistent
with §226 SGB V (which does not list private life insurance as Versorgungsbezug and limits
the KVdR base to specific categories).

Source: §240 SGB V — https://www.gesetze-im-internet.de/sgb_5/__240.html

### §§248, 249a, 250 SGB V — KV rates and contribution bearing

For Versorgungsbezüge (e.g. bAV pension), the retiree pays the **full healthRate** (both
the employee and employer halves). The Versorgungsträger (e.g. employer, Pensionskasse) does
not pay a KV employer share. The statutory basis is §248 SGB V (general contribution rate
for Versorgungsbezüge) plus §250 Abs. 1 SGB V (member bears these contributions alone),
not §249a SGB V. The healthRate passed to `calculateRetirementKvPv` must be the combined
rate (e.g. 14.6 % + Zusatzbeitrag 2.9 % = 17.5 % in the default profile).

For statutory GRV pension: the Rentenversicherungsträger pays half the healthRate as
Beitragszuschuss zur Krankenversicherung der Rentner (§249a SGB V). The retiree only pays
`healthRate / 2` on the GRV pension (KVdR members). For freiwillig Versicherte, the
pension is assessed under §240 SGB V; voluntary GKV retirees can also receive a statutory
health-insurance subsidy from the pension insurance carrier under §106 SGB VI. This is
not the same mechanism as the §249a direct KVdR split, so a full total-retirement-net model
must represent the subsidy explicitly instead of assuming the pension has no half-rate relief.

Sources:
- §248 SGB V — https://www.gesetze-im-internet.de/sgb_5/__248.html
- §249a SGB V — https://www.gesetze-im-internet.de/sgb_5/__249a.html
- §250 SGB V — https://www.gesetze-im-internet.de/sgb_5/__250.html
- §106 SGB VI — https://www.gesetze-im-internet.de/sgb_6/__106.html

### §57 Abs. 1 SGB XI — PV-Freigrenze for Versorgungsbezüge

The PV Freigrenze (197.75 EUR/month = same value as KV-Freibetrag) is **all-or-nothing**:
below the Freigrenze, zero PV on Versorgungsbezüge; above, the full aggregate amount at
the full careRate. No deduction (unlike the KV Freibetrag, which IS a deduction).

The Freigrenze applies to the **aggregate** of all Versorgungsbezüge per month, not per source.
Per-source PV is split proportionally after the Freigrenze check on the aggregate.

Source: §57 Abs. 1 SGB XI — https://www.gesetze-im-internet.de/sgb_11/__57.html

### KV/PV Beitragsbemessungsgrenze in retirement

The monthly KV/PV BBG in 2026 is **5,812.50 EUR/month** (= 69,750 EUR/year ÷ 12).
Source: Verordnung über maßgebende Rechengrößen der Sozialversicherung für 2026
(SVBezGrV 2026, BGBl. 2025 I Nr. 278, §2 Abs. 2).
https://www.bundesgesundheitsministerium.de/beitraege

The BBG caps the **aggregate KV/PV assessment base** across all income sources in a given month.
The cap is evaluated on the underlying assessment bases (before applying rates), not on the
contribution amounts directly. This correctly handles the mixed-rate situation where GRV pension
uses healthRate/2 for KV (KVdR) while Versorgungsbezüge use the full rate.

### Apportionment rule for over-BBG aggregates

When the aggregate assessment base exceeds the monthly BBG, per-source amounts are scaled
down **proportionally** so the total aggregate base equals BBG. The scale factor is:
`min(1, BBG / aggregate_base)` applied uniformly to all sources.

**Rationale for proportional scaling**: proportional apportionment is administratively
consistent with multi-employer apportionment under §22 Abs. 1 SGB IV and §6 Abs. 7 SGB V.
It avoids creating artificial priority rules between income sources and produces a
predictable, defensible result. The legal alternative (sequential reduction by priority)
is not prescribed by statute for the single-member case and would require judgment calls
about source ordering.

**KV and PV are capped separately**: the KV aggregate base and PV aggregate base may differ
(PV uses the Freigrenze path, which can differ from the KV Freibetrag path), so the scale
factors for KV and PV are computed independently.

### Beitragszuschuss / KV split for statutory pension

For KVdR members, Deutsche Rentenversicherung and the retiree each bear half the healthRate
on the statutory GRV pension (§249a SGB V). The implementation models the pensioner's share
only (`healthRate / 2` for GRV pension, KVdR path), which is correct when computing the
pensioner's own deduction.

For freiwillig Versicherte, statutory pension is part of the §240 SGB V assessment base.
However, §106 SGB VI provides a health-insurance subsidy from the pension insurance carrier
for eligible voluntary or private-health-insured pensioners. The current calculator mostly
uses `monthlyOtherRetirementIncome` as GRV context for BBG apportionment and subtracts only
the bAV/private-insurance KV/PV burden from the product under comparison. If the app later
shows a full "total retirement net income" figure, it should model the §106 SGB VI subsidy.

### otherMonthlyIncome = monthlyStatutoryPension — simplification

`BavAssumptions.monthlyOtherRetirementIncome` (a single number) is treated as GRV statutory
pension for the KV/PV assessment in `calculateRetirementKvPv`. This matches the most common
scenario (retirees with a GRV pension as their main "other income"), and is more defensible
than ignoring the income context entirely (the previous approach). If the user's other income
includes non-GRV sources (rental, etc.), the KV/PV computation is slightly over-stated for
KVdR members (GRV gets half-rate; non-GRV would get full rate) and slightly under-stated for
freiwillig Versicherte. A future improvement would split `monthlyOtherRetirementIncome` into
named sub-fields; this is tracked in the backlog.

### Mindestbeitrag for freiwillig Versicherte — known simplification

The Mindestbeitrag (minimum contribution, §240 Abs. 4 SGB V) for freiwillig Versicherte
is not modeled. For very low retirement incomes, the actual KV/PV contribution would be
floored at the Mindestbeitrag, which this calculator may understate. This simplification
is acceptable for normal retirement scenarios where income exceeds the minimum threshold.

### Private insurance lump sum — freiwillig KV/PV simplification

For freiwillig Versicherte receiving a private insurance lump sum, there is no statutory
1/120 spreading rule (that rule applies specifically to bAV lump sums under §229 Abs. 1 Satz 3
SGB V). The implementation applies the monthly BBG cap assuming the lump sum is received
in one month. In practice, insurance companies may structure payouts differently, and
the actual KV/PV treatment may differ. This is a known simplification.

---

## bAV Lump-Sum Tax Routing (#48)

Implemented in `src/engine/projections.ts` (`deriveBavLumpSumTaxMode`, `afterTaxBavLumpSum`)
and wired through `src/engine/simulate.ts` and `src/App.tsx`.

The income-tax treatment of a bAV capital payout (Kapitalabfindung) depends on the
Durchführungsweg. The `deriveBavLumpSumTaxMode` function maps each Durchführungsweg to
one of three routing modes: `voll_versorgungsbezug`, `fuenftelregelung`, or `pre2005_steuerfrei`.

### §22 Nr. 5 EStG — §3 Nr. 63 Durchführungswege (Direktversicherung, Pensionskasse, Pensionsfonds)

Capital payouts from §3 Nr. 63 EStG contracts are taxable at the full personal marginal
rate as Versorgungsbezüge under §22 Nr. 5 Satz 1 EStG. §34 EStG Fünftelregelung does NOT
apply: §22 Nr. 5 Satz 2 EStG subjects the payout to the same tax treatment as laufende
bAV-Renten, and §34 Abs. 2 Nr. 4 EStG applies only to "Vergütungen für mehrjährige
Tätigkeit" in the §19 EStG context (Direktzusage, Unterstützungskasse). For §3 Nr. 63
contracts, the capital payment represents the tax-privileged accumulation being accessed
at once — it does not meet the "Vergütung für mehrjährige Tätigkeit" threshold for §34.

Statutory basis:
- §22 Nr. 5 Satz 1 EStG (primary: Leistungen aus Altersvorsorgevertrag / bAV)
- §22 Nr. 5 Satz 2 EStG (§3 Nr. 63 contracts: taxation as laufende Versorgungsbezüge applies)
- §34 Abs. 2 Nr. 4 EStG (Fünftelregelung only for "Vergütung für mehrjährige Tätigkeit" — does not reach §3 Nr. 63 capital payouts under current tax authority practice)
- https://www.gesetze-im-internet.de/estg/__22.html
- https://www.gesetze-im-internet.de/estg/__34.html
- BFH X R 25/23 (2025-10-30): https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE202620036/

Note on case law: The proposition that §34 Fünftelregelung does not apply to normal capital
payouts from §3 Nr. 63 external Durchführungswege is now supported by BFH X R 25/23
(2025-10-30) where the beneficiary had a contractual capital option. The Fünftelregelung has
historically been applied to Direktzusage/Unterstützungskasse capital payments (§19 EStG
context), where the legal basis in §34 Abs. 2 Nr. 4 EStG is well-established. For §3 Nr. 63
contracts, the routing through §22 Nr. 5 EStG rather than §19 EStG means the §34 route is
not available. The calculator applies this interpretation conservatively (no Fünftelregelung
for §3 Nr. 63) — which matches the statutory language and is the more cautious assumption
for tax planning. If a taxpayer believes their specific contract qualifies under §34, they
should use the Direktzusage route or consult a Steuerberater.

### §52 Abs. 28 EStG a.F. — §40b EStG a.F. Pre-2005 contracts (direktversicherung_40b_alt)

Pre-2005 Direktversicherungen taxed under §40b EStG a.F. (pauschalbesteuert) may qualify
for a steuerfrei capital payout under §52 Abs. 28 EStG a.F. if all of the following
conditions are met:
1. Contract started before 1 January 2005
2. Runtime of at least 12 years
3. At least 5 annual premium payments
4. Payout as capital lump sum (not annuity)
5. Pauschalbesteuerung under §40b EStG a.F. was actually applied

When these conditions are met (`pre2005EligibleTaxFree = true`), the income-tax leg returns
zero. If conditions are not met (`pre2005EligibleTaxFree = false`), the full marginal rate
applies (`voll_versorgungsbezug`).

Statutory basis:
- §52 Abs. 28 EStG (transition provision for pre-2005 contracts)
- §40b EStG a.F. (pauschalbesteuerung of employer-funded Direktversicherung)
- https://www.gesetze-im-internet.de/estg/__52.html

### §19 EStG — Direktzusage and Unterstützungskasse (fuenftelregelung)

Capital payments from Direktzusage and Unterstützungskasse are Versorgungsbezüge under
§19 Abs. 1 Nr. 2 EStG. The payment constitutes "Vergütung für mehrjährige Tätigkeit"
within the meaning of §34 Abs. 2 Nr. 4 EStG when it is paid in lieu of a multi-year
employer pension promise — which is typically the case for these Durchführungswege.
The Fünftelregelung (§34 Abs. 1 EStG) then applies: 5 × (T(other + lumpSum/5) − T(other)).

Statutory basis:
- §19 Abs. 1 Nr. 2 EStG (Versorgungsbezüge from employer)
- §34 Abs. 1 EStG (Fünftelregelung)
- §34 Abs. 2 Nr. 4 EStG (qualifying criterion: "Vergütung für mehrjährige Tätigkeit")
- https://www.gesetze-im-internet.de/estg/__19.html
- https://www.gesetze-im-internet.de/estg/__34.html

### §229 Abs. 1 Satz 1 Nr. 5 SGB V — KV/PV status for §40b contracts

All bAV Durchführungswege — including §40b EStG a.F. Direktversicherungen — qualify as
Versorgungsbezüge under §229 Abs. 1 Satz 1 Nr. 5 SGB V for health and care insurance
purposes. This means the §229 Abs. 1 Satz 3 SGB V 1/120 spreading rule applies to capital
payouts from §40b contracts, and KV/PV is assessed even when the income-tax leg is zero
(`pre2005_steuerfrei` mode). The EStG and SGB V assessments are legally independent.

Statutory basis:
- §229 Abs. 1 Satz 1 Nr. 5 SGB V (bAV payouts as Versorgungsbezüge for KV purposes)
- §229 Abs. 1 Satz 3 SGB V (1/120 spreading for lump sums)
- https://www.gesetze-im-internet.de/sgb_5/__229.html

### Versorgungsfreibetrag suppression for all lump-sum modes

The Versorgungsfreibetrag (§19 Abs. 2 EStG) applies only to "laufende Versorgungsbezüge"
(recurring pension payments). All three lump-sum tax modes pass `bavIsLumpSum=true` to
`calculateRetirementTax`, which suppresses the Versorgungsfreibetrag. This is consistent
with the `LEGAL_REVIEW.md §"Versorgungsfreibetrag-Not-On-Lump-Sum Convention"` established
in #46.

### Durchführungsweg truth table

| Durchführungsweg | pre2005EligibleTaxFree | BavLumpSumTaxMode |
|---|---|---|
| direktversicherung_3_63 | any | voll_versorgungsbezug |
| pensionskasse_3_63 | any | voll_versorgungsbezug |
| pensionsfonds_3_63 | any | voll_versorgungsbezug |
| direktversicherung_40b_alt | true | pre2005_steuerfrei |
| direktversicherung_40b_alt | false | voll_versorgungsbezug |
| direktzusage | any | fuenftelregelung |
| unterstuetzungskasse | any | fuenftelregelung |

## Payout Form: Leibrente / Zeitrente / Kapitalverzehr (#54)

bAV and private-insurance retirement payouts were previously modelled as a self-managed
capital-drawdown over `retirementEndAge − retirementAge` for all three products. That is
correct for ETF (the user controls the drawdown horizon) but materially wrong for bAV and
pAV, which pay an actuarially-priced annuity defined by the contract.

### §1 Abs. 1 Satz 1 BetrAVG — Versorgungsleistungen

Source: https://www.gesetze-im-internet.de/betravg/__1.html

> Werden einem Arbeitnehmer Leistungen der Alters-, Invaliditäts- oder Hinterbliebenen-
> versorgung aus Anlass seines Arbeitsverhältnisses vom Arbeitgeber zugesagt
> (betriebliche Altersversorgung), gelten die Vorschriften dieses Gesetzes.

The classical bAV Leistungsformen are Leibrente (lifelong), Kapitalleistung (single sum),
and Auszahlungsplan / Zeitrente (fixed-term). §1b BetrAVG governs Anwartschaften
(unverfallbar). §3 BetrAVG governs the limited Abfindung options. The calculator does
not model invalidity / survivor benefits.

### Rentenfaktor in Versicherungsbedingungen

The Rentenfaktor is the contractual quotient that converts accumulated capital into a
guaranteed monthly annuity:

```
gross_monthly_payout = capital / 10 000 EUR × Rentenfaktor
```

A Garantierter Mindestrentenfaktor is typically named alongside the planned/projected
Rentenfaktor in the Versicherungsbedingungen. Typical 2026 unisex values for age-67
starts cluster between 25 and 35 EUR per 10 000 EUR Kapital per month, depending on
provider, cost class, and guarantee duration. The calculator's defaults (bAV: 30,
pAV: 28) sit inside this band. The user can override the Rentenfaktor for both products.

### Modeling Choices

- `payoutMode === 'leibrente'`: gross monthly payout is rentenfaktor-driven, independent
  of `retirementEndAge`. Payments continue past `retirementEndAge`; the calculator does
  not model death timing or actuarial mortality. Net is computed by passing the gross
  through the existing tax / KV / PV pipeline (§19 EStG laufende Versorgungsbezüge,
  §229 Abs. 1 Satz 1 Nr. 5 SGB V Versorgungsbezüge for KV/PV).
- `payoutMode === 'zeitrente'`: gross monthly payout uses the existing depletion-annuity
  formula over the contractual `zeitrenteYears`, independent of `retirementEndAge`. After
  the term, payouts stop.
- `payoutMode === 'kapitalverzehr'`: previous behavior — gross uses the depletion-annuity
  formula over `retirementEndAge − retirementAge`. Models a self-managed withdrawal,
  appropriate for ETF and for bAV/pAV products that offer Wahlrecht and the user has
  chosen Kapital plus self-managed drawdown.

ETF always uses `kapitalverzehr` semantics internally (no contractual Rentenfaktor).

### Tax / SV Implications Unchanged

The income-tax and KV/PV routing for laufende bAV-Renten and pAV-Renten continues to use
the existing `netBavPayout` / `netInsurancePayout` paths. Only the gross monthly figure
that enters those helpers changes. Lump-sum (Kapitalabfindung) tax routing — driven by
`Durchführungsweg` for bAV and `InsuranceTaxMode` for pAV — is untouched by #54.
