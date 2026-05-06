# Content Brief: /etf-vs-bav

Issue: #04 — Topic cluster bAV ↔ ETF comparison
Created: 2026-05-06
Status: shipped

## Target query cluster

Primary:
- "ETF vs bAV"
- "bAV oder ETF"
- "bAV vs ETF Vergleich"
- "ETF oder betriebliche Altersvorsorge"
- "bAV ETF Rechner 2026"

Secondary:
- "ETF bAV gleicher Nettobeitrag"
- "Entgeltumwandlung vs ETF Sparplan"
- "bAV Kosten ETF Vergleich"
- "betriebliche Altersvorsorge Arbeitgeberzuschuss ETF"

## User intent

User wants to compare bAV and ETF directly without being funneled by a broker. They
want to know:
1. What the tradeoffs are under different conditions (employer subsidy, income, costs)
2. Why no single answer applies universally
3. What the key inputs are for their own calculation

Primary persona: Anna (26, 52k€ brutto, first job with bAV offer — docs/user-scenarios.md).
Also relevant: Bernd (38, 95k€, existing bAV + ETF — scenario 2).

## Calculator path

CTA: `/?topic=etf-vs-bav` → compare mode with ETF + bAV preselected (issue #13).
The preselection seeds `visibleProducts: ['etf', 'bav']` so first-time visitors land
with the ETF vs. bAV comparison already active.

## JSON-LD type

`WebApplication` (calculator entry point for the comparison)
`BreadcrumbList`: Home → ETF vs. bAV

Note: The brief specified `Article` but the registry uses `WebApplication` because the
page serves as a calculator entry point (CTA → calculator). The locked decision in
the issue spec says "Comparison/explanatory → Article", but the page primarily drives
users into the compare-mode calculator. Reviewer attention: consider whether to change
jsonLdType to 'Article' for this page. The current `WebApplication` type is consistent
with other topic pages and the existing `JsonLdType` union in the registry.

## Page shape

Comparison (Article-shaped) page covering:
- Fair-comparison invariant: same net-cost basis
- Comparison table: 9 dimensions (tax, employer subsidy, costs, GRV reduction, payout
  tax, KV/PV, flexibility, portability, insolvency protection)
- Caveats for each row (who the rule applies to, thresholds, exceptions)
- Condition-based analysis: high/low employer subsidy, high/low income, KVdR vs freiwillig
- Static example: Anna persona (Stand 2026, labelled as illustrative)
- FAQ (3 Q/As → FAQPage JSON-LD criterion met)

## Must-include caveats

1. No page-level winner declaration — always frame as "under conditions X, Y applies".
2. The employer subsidy is the dominant variable for most cases.
3. KVdR vs. freiwillig versichert materially affects the KV/PV load on bAV payouts.
4. ETF costs are typically far lower but employer subsidy can more than offset them.
5. GRV reduction is a real cost that must appear in any honest comparison.
6. Income above the RV/AV BBG (101.400 €) changes employer subsidy obligation.

## YMYL sources cited

| Claim | Source |
|---|---|
| § 1a Abs. 1a BetrAVG: 15% Arbeitgeberzuschuss | [gesetze-im-internet.de/betravg/__1a.html](https://www.gesetze-im-internet.de/betravg/__1a.html) |
| § 1b Abs. 5 BetrAVG: sofortige Unverfallbarkeit | [gesetze-im-internet.de/betravg/__1b.html](https://www.gesetze-im-internet.de/betravg/__1b.html) |
| § 3 Nr. 63 EStG: steuerfreier Höchstbetrag | [gesetze-im-internet.de/estg/__3.html](https://www.gesetze-im-internet.de/estg/__3.html) |
| § 20 EStG: Abgeltungsteuer auf private Kapitalerträge | [gesetze-im-internet.de/estg/__20.html](https://www.gesetze-im-internet.de/estg/__20.html) |
| § 22 Nr. 5 EStG: nachgelagerte Besteuerung | [gesetze-im-internet.de/estg/__22.html](https://www.gesetze-im-internet.de/estg/__22.html) |
| § 1 SvEV: SV-freier Höchstbetrag | [gesetze-im-internet.de/svev/__1.html](https://www.gesetze-im-internet.de/svev/__1.html) |
| § 14 SGB IV: beitragspflichtige Einnahme (GRV-Reduktion) | [gesetze-im-internet.de/sgb_4/__14.html](https://www.gesetze-im-internet.de/sgb_4/__14.html) |
| §§ 226, 229, 240 SGB V: KV-Freibetrag, 1/120-Regel, freiwillig GKV | [gesetze-im-internet.de/sgb_5/__226.html](https://www.gesetze-im-internet.de/sgb_5/__226.html) |
| §§ 55, 55a SGB XI: Pflegeversicherung | [gesetze-im-internet.de/sgb_11/__55.html](https://www.gesetze-im-internet.de/sgb_11/__55.html) |
| BBG 2026: RV-BBG 101.400 €/Jahr | [bundesregierung.de — BBG 2026](https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514) |
| DRV: BBG-Übersicht 2026 | [deutsche-rentenversicherung.de — BBG](https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/summa-summarum/Lexikon/B/beitragsbemessungsgrenze.html) |
| GDV: Effektivkosten richtig lesen | [gdv.de — Effektivkosten](https://www.gdv.de/gdv/themen/leben/effektivkosten-richtig-lesen-12442) |
| Verbraucherzentrale: bAV wann lohnt es sich | [verbraucherzentrale.de — bAV](https://www.verbraucherzentrale.de/wissen/geld-versicherungen/altersvorsorge/betriebliche-altersvorsorge-gehaltsumwandlung-wann-lohnt-sich-das-7675) |
| Finanztip: Entgeltumwandlung 2026 | [finanztip.de — Entgeltumwandlung](https://www.finanztip.de/betriebliche-altersvorsorge/entgeltumwandlung/) |

## Visible FAQ (→ FAQPage JSON-LD criterion met)

Three Q/As visibly rendered:

1. **Kann man ETF und bAV kombinieren?**
   Answer: Yes — both paths can coexist; the combine-mode (Mein Plan) supports this.

2. **Lohnt sich bAV ohne Arbeitgeberzuschuss über 15 %?**
   Answer: Depends on income, costs, tax bracket — framed as a question, not a verdict.

3. **Gilt der Freibetrag für KV/PV pro Vertrag oder gesamt?**
   Answer: Total Freibetrag once across all Versorgungsbezüge (§ 226 Abs. 2 SGB V).

## Internal links

- `/` (homepage — Modellrechner Startseite)
- `/bav-rechner` (sibling — bAV mechanics page)
- `/rentenluecke-rechner` (sibling — gap calculator)
- `/impressum` and `/datenschutz` (footer)

## Forbidden copy — compliance check

- "besser als": not present ✓
- "lohnt sich" as conclusion: not present ✓ ("Lohnt sich…?" as question headline in FAQ is allowed)
- "empfohlen": not present ✓

## Decisions made during implementation

- **jsonLdType = 'WebApplication'**: Diverges slightly from the brief's "Article"
  specification. Rationale: the page's primary function is driving users into the
  calculator (CTA → preselection). `WebApplication` is consistent with other
  topic pages. The existing `JsonLdType` union does not include `'Article'` — adding
  it would require a code change and was not in scope for this agent slice.
  Reviewer attention: if `Article` is needed, add it to the `JsonLdType` union in
  `publicRouteRegistry.ts` and update `routeHead.ts` JSON-LD builder.
- **remark-gfm added to vite.config.ts**: Required for pipe table rendering in MDX.
  The comparison table on this page relies on GFM pipe syntax. This is the primary
  reason `remark-gfm` was added.
- **Same-net-cost-basis framing**: The engine's fair-comparison invariant is explained
  in the first section to set reader expectations correctly.
- **No engine import**: Page imports only the MDX body and the CSS. No `src/engine/`
  imports. Static example numbers are hard-coded with persona framing.
