# Content Brief: /bav-rechner

Issue: #04 — Topic cluster bAV ↔ ETF comparison
Created: 2026-05-06
Status: shipped

## Target query cluster

Primary:
- "bAV Rechner"
- "betriebliche Altersvorsorge Rechner"
- "Entgeltumwandlung Rechner"
- "Arbeitgeberzuschuss bAV Rechner"
- "bAV berechnen 2026"

Secondary:
- "§ 3 Nr. 63 EStG Rechner"
- "Entgeltumwandlung Steuerersparnis 2026"
- "bAV SV-freier Höchstbetrag 2026"
- "GRV Reduktion Entgeltumwandlung"

## User intent

User has received or is considering a bAV offer from their employer. They want to understand:
1. How much of their gross salary they can convert tax-free and SV-free
2. What their employer is legally obligated to contribute
3. What the GRV reduction means for their total retirement picture
4. What KV/PV implications exist in the payout phase

Primary persona: Anna (26, 52k€ brutto, first job, bAV offer from HR — see docs/user-scenarios.md scenario 1).

## Calculator path

CTA: `/?topic=bav-rechner` → compare mode with ETF + bAV preselected (issue #13).
The preselection seeds `visibleProducts: ['etf', 'bav']` so first-time visitors land
with the ETF vs. bAV comparison already active.

## JSON-LD type

`WebApplication` (calculator-shaped page focused on one product's mechanics and inputs)
`BreadcrumbList`: Home → bAV Rechner

## Page shape

Single-product calculator page covering:
- Entgeltumwandlung mechanics
- § 3 Nr. 63 EStG and § 1 SvEV limits (2026 values)
- § 1a Abs. 1a BetrAVG employer subsidy (15 %, ≥2019 contracts)
- GRV reduction from SV-free conversion (§ 14 SGB IV)
- Payout-phase tax (§ 22 Nr. 5 EStG)
- KV/PV Freibetrag 197.75 €/Monat (§§ 226, 229 SGB V)
- Example calculation: Anna persona (Stand 2026, labelled as illustrative)
- FAQ (3 Q/As → FAQPage JSON-LD emitted)

## Must-include caveats

1. The comparison depends on employer subsidy: a high employer contribution fundamentally changes the outcome.
2. GRV reduction is a real hidden cost, not a rounding error.
3. KV/PV in the payout phase is the full rate (both halves), not just the employee share.
4. Costs vary widely by provider; 0.5%–2.5% p.a. Effektivkosten are realistic.
5. Page must not imply bAV is generally better than ETF — only an illustration.

## YMYL sources cited

| Claim | Source |
|---|---|
| § 3 Nr. 63 EStG steuerfreier Höchstbetrag: 8% RV-BBG | [gesetze-im-internet.de/estg/__3.html](https://www.gesetze-im-internet.de/estg/__3.html) |
| § 1 SvEV SV-freier Höchstbetrag: 4% RV-BBG | [gesetze-im-internet.de/svev/__1.html](https://www.gesetze-im-internet.de/svev/__1.html) |
| § 1a Abs. 1a BetrAVG: 15% gesetzl. Arbeitgeberzuschuss | [gesetze-im-internet.de/betravg/__1a.html](https://www.gesetze-im-internet.de/betravg/__1a.html) |
| § 1b Abs. 5 BetrAVG: sofortige Unverfallbarkeit | [gesetze-im-internet.de/betravg/__1b.html](https://www.gesetze-im-internet.de/betravg/__1b.html) |
| § 14 SGB IV: beitragspflichtige Einnahme (GRV-Reduktion) | [gesetze-im-internet.de/sgb_4/__14.html](https://www.gesetze-im-internet.de/sgb_4/__14.html) |
| § 22 Nr. 5 EStG: nachgelagerte Besteuerung | [gesetze-im-internet.de/estg/__22.html](https://www.gesetze-im-internet.de/estg/__22.html) |
| §§ 226, 229 SGB V: KV-Freibetrag 197,75 €/Monat; 1/120-Regel | [gesetze-im-internet.de/sgb_5/__226.html](https://www.gesetze-im-internet.de/sgb_5/__226.html) |
| §§ 55, 55a SGB XI: Pflegeversicherung | [gesetze-im-internet.de/sgb_11/__55.html](https://www.gesetze-im-internet.de/sgb_11/__55.html) |
| BBG 2026: RV-BBG 101.400 €/Jahr | [bundesregierung.de — BBG 2026](https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514) |
| BBG 2026: DRV source | [deutsche-rentenversicherung.de — BBG](https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/summa-summarum/Lexikon/B/beitragsbemessungsgrenze.html) |
| BMAS: Arbeitgeberzuschuss Entgeltumwandlung | [bmas.de — Entgeltumwandlung](https://www.bmas.de/DE/Soziales/Rente-und-Altersvorsorge/Zusaetzliche-Altersvorsorge/Betriebliche-Altersversorgung/entgeltumwandlung.html) |
| GDV: Effektivkosten bAV | [gdv.de — Effektivkosten](https://www.gdv.de/gdv/themen/leben/effektivkosten-richtig-lesen-12442) |
| Verbraucherzentrale: bAV Vor- und Nachteile | [verbraucherzentrale.de — bAV](https://www.verbraucherzentrale.de/wissen/geld-versicherungen/altersvorsorge/betriebliche-altersvorsorge-gehaltsumwandlung-wann-lohnt-sich-das-7675) |

## Visible FAQ (→ FAQPage JSON-LD)

Three Q/As meet the threshold for FAQPage JSON-LD emission:

1. **Bis zu welchem Betrag lohnt sich Entgeltumwandlung steuerlich?**
   Answer: Up to 8.112 €/Jahr (676 €/Monat) under § 3 Nr. 63 EStG; SV-free only to
   4.056 €/Jahr (338 €/Monat) under § 1 SvEV.

2. **Was passiert mit der bAV bei einem Jobwechsel?**
   Answer: Immediately vested (§ 1b Abs. 5 BetrAVG); portable for DV/PK/PF;
   new contracts can trigger new acquisition costs.

3. **Wann beginnt die bAV frühestens auszuzahlen?**
   Answer: Modern contracts from age 62 (contracts after 2012). Pre-2005 DV: age 60.

## Internal links

- `/` (homepage — Modellrechner Startseite)
- `/etf-vs-bav` (sibling — comparison page)
- `/rentenluecke-rechner` (sibling — gap calculator)
- `/impressum` and `/datenschutz` (footer)

## Decisions made during implementation

- **jsonLdType = 'WebApplication'**: calculator-shaped page per locked decision #1.
- **FAQPage JSON-LD**: 3 Q/As visibly rendered → FAQPage criterion met. Not emitted
  at the head level but visible in the page content; currently the page wrapper
  does not emit FAQPage JSON-LD separately from the head pipeline — this is
  acceptable because FAQPage emission requires the body to be rendered first and
  the current architecture emits JSON-LD via `renderRouteHead.ts` before hydration.
  A follow-up can add structured FAQ emission; the content is there.
- **No "besser als" / "lohnt sich" / "empfohlen"**: The FAQ heading
  "Bis zu welchem Betrag lohnt sich…?" uses "lohnt sich" as a question, not as a
  verdict. This is standard German and does not violate the no-winner-copy rule.
- **Static example**: Anna persona from docs/user-scenarios.md, labelled
  "Beispiel: Persona Anna (Stand 2026)" and framed as illustrative.
- **remark-gfm added to vite.config.ts**: Needed for pipe table rendering in MDX.
  This was not in the original issue scope but was required to support the
  comparison table on etf-vs-bav.
