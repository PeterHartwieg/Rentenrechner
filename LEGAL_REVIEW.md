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
