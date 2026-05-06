# Content brief — `/private-rentenversicherung-rechner`

Status: draft
Author: Claude (AFK implementer, issue #06)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/private-rentenversicherung-rechner`. The
body lives at `src/features/publicPages/private-rentenversicherung-rechner.body.mdx`;
the `.tsx` wrapper at `PrivateRentenversicherungRechnerPage.tsx` registers the
page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to calculate how a private
Rentenversicherung compares to an ETF Sparplan, understand insurance costs
(fees), and learn about the tax treatment of their contract.

Seed queries (from PRD seed query map, "Private insurance" cluster):

- "private Rentenversicherung Rechner"
- "private Rentenversicherung vs ETF"
- "Rentenversicherung Auszahlung Steuer"
- "Kapitalverzehr oder Leibrente"
- "alte Lebensversicherung kündigen oder behalten"

Adjacent informational intents we partly cover:

- "Versicherungsmantel Kosten Rentenversicherung"
- "Halbeinkünfte Lebensversicherung 2026"
- "Abgeltungsteuer Rentenversicherung"
- "Ertragsanteil Leibrente Tabelle 2026"

## User intent

Three layered intents:

1. **Definitional.** What is a private Rentenversicherung? How does it differ
   from Basisrente and bAV?
2. **Procedural.** What are the costs? What is the tax treatment by contract era?
   What is the difference between Leibrente (annuity) and Kapitalverzehr
   (capital drawdown)?
3. **Calculator entry.** Deep-link into the calculator at
   `/?topic=private-rentenversicherung-rechner` (preselects ETF + versicherung
   in compare mode).

## Critical UX requirement

The **contract-era tax-mode auto-derivation** must be clearly explained with
a visible comparison table and the three eras explicitly named:

1. **pre2005** — Vertrag vor 01.01.2005. Halbeinkünfte or tax-free.
2. **halbeinkuenfte** — Vertrag 01.01.2005–31.12.2008. 50 % des Ertrags
   steuerpflichtig bei Erfüllung der 12-Jahres-Bedingung.
3. **abgeltungsteuer** — Vertrag ab 01.01.2009. 25 % Abgeltungsteuer auf vollen
   Ertrag.

The page should make clear that **RentenWiki.de derives this automatically**
from the entered Vertragsbeginn (function `deriveInsuranceTaxMode` in the engine).
Users with old pre-2005 contracts often don't realize how valuable their regime
is — this page should surface that clearly.

## Calculator path

CTA: "Private Rentenversicherung jetzt berechnen"
→ `/?topic=private-rentenversicherung-rechner`
Preselection (issue #13): `{ mode: 'compare', visibleProducts: ['etf', 'versicherung'] }`

## Cited sources (inline + listed in Quellen section)

### Primary statutory sources

- **§ 20 Abs. 1 Nr. 6 EStG** — Steuerregime für Kapitalerträge aus privaten
  Rentenversicherungen; Halbeinkünfteverfahren für Verträge ab 2005 mit
  Laufzeit ≥ 12 Jahre; Abgeltungsteuer für Verträge ab 2009.
- **§ 20 Abs. 9 EStG** — Sparerpauschbetrag 1 000 €/Jahr.
- **§ 22 Nr. 1 Satz 3 a bb EStG** — Ertragsanteil-Besteuerung bei Leibrenten
  aus privaten Rentenversicherungen (Tabelle nach Alter bei Rentenbeginn).
- **§ 32d EStG** — Abgeltungsteuer-Tarif (25 % + SolZ).
- **§ 226 SGB V** — KV-Beitragspflicht auf Leibrenten (KVdR).
- **§ 240 SGB V** — KV-Beitragspflicht für freiwillig Versicherte.
- **§§ 55, 55a SGB XI** — Pflegeversicherungsbeitrag.

### Statutory framework

- **Alterseinkünftegesetz (AltEinkG)** — Übergangsregelung ab 2005 für Neuverträge.

### Authoritative publications

- **BMF:** *Schreiben zur steuerlichen Behandlung von Leibrenten und anderen
  Leistungen aus Rentenversicherungen* (aktuelle Fassung, Stand 2025/2026).
- **BaFin:** *Merkblatt zu Lebensversicherungsprodukten* — aufsichtsrechtliche
  Rahmenbedingungen nach VAG und VVG.
- **Statistisches Bundesamt (Destatis):** *Sterbetafeln 2021/2023* — Grundlage
  für Ertragsanteiltabellen und Lebenserwartungsannahmen.

### Supporting product standard

- **VVG-InfoV § 2a** — Effektivkostenquote (Reduction in Yield), Pflichtangabe.

## Must-include caveats

1. **Visible "Stand: 2026-05-06" line** at top of article.
2. **Not-advice disclaimer.** `DisclaimerBanner` rendered; inline prose also
   repeats "kein Steuerrat, keine Anlageempfehlung."
3. **Impressum + Datenschutz links** in page footer.
4. **No winner framing.** Contract era comparisons frame conditions, not verdicts.
5. **Pre-2005 altvertrag value.** Must be clearly stated that old contracts
   have a tax privilege that cannot be recreated in a new contract.

## Visible page structure

1. H1 — from registry.
2. Lead paragraph — summary string from registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — `/?topic=private-rentenversicherung-rechner`.
5. **Was ist eine private Rentenversicherung?** — definition, Kapitalwahlrecht,
   no state subsidy, tax solely from contract era.
6. **Kostenstruktur: Versicherungsmantel und Fondskosten** — wrapperAssetFee,
   fundAssetFee, RIY, Beispielrechnung (Karin, persona from user-scenarios.md).
7. **Steuerregime: Automatische Ableitung aus dem Vertragsbeginn** — three eras
   with comparison table; auto-derivation via deriveInsuranceTaxMode.
8. **Leibrente vs. Kapitalverzehr (Kapitalwahlrecht)** — annuity vs. lump-sum
   choice, respective tax treatment.
9. **Was der Rechner berechnet** — inputs/outputs prose, no engine code.
10. **Häufige Fragen** — 4 visible Q/As: contract era identification, should I
    cancel old insurance, difference from Basisrente, value currency.
11. **Quellen** — full statutory + publication source list.
12. **Verwandte Seiten** — internal links to homepage, /rentenluecke-rechner,
    /basisrente-rechner.

## FAQ entries (visible on page — FAQPage JSON-LD condition)

Page has 4 visible FAQ entries. FAQPage JSON-LD could be added in a follow-on
issue if all Q/As pass human YMYL review. This release ships `WebApplication`
JSON-LD only.

## SEO surfaces (driven by publicRouteRegistry.ts)

- `title`: Registered.
- `metaDescription`: Registered.
- `h1`: Matches visible H1.
- `summary`: Matches lead paragraph.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `WebApplication`
- `preselection`: `{ mode: 'compare', visibleProducts: ['etf', 'versicherung'] }`

## Out of scope (downstream issues)

- Per-route OG card — issue #08.
- FAQPage JSON-LD — deferred until human review.
- Cloudflare Content Signals — issue #09.
- llms.txt — automatic from registry.
