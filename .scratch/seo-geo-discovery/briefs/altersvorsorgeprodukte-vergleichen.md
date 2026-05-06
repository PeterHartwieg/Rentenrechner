# Content brief — `/altersvorsorgeprodukte-vergleichen`

Status: draft
Author: Claude (AFK implementer, issue #07)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/altersvorsorgeprodukte-vergleichen`. The
body lives at `src/features/publicPages/altersvorsorgeprodukte-vergleichen.body.mdx`;
the `.tsx` wrapper at `AltersvorsorgeproduktePage.tsx` registers the page in
`publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to understand which pension products
exist in Germany and how to plan across multiple products simultaneously.

Seed queries (from PRD seed query map, "Portfolio planner" cluster):

- "Altersvorsorge Rechner Deutschland 2026"
- "Altersvorsorgeprodukte vergleichen"
- "nächster Euro Altersvorsorge"
- "ETF Riester bAV Vergleich"
- "Rentenplanung Rechner kostenlos"
- "bAV und ETF gleichzeitig"
- "Riester auf AVD übertragen"

## User intent

Three layered intents:

1. **Comparative/definitional.** Which products exist? How do they differ?
2. **Portfolio planning.** How can I plan across multiple contracts simultaneously?
   What is a "Transfer-Ereignis"?
3. **Calculator entry.** CTA opens combine-mode via `/?topic=altersvorsorgeprodukte-vergleichen`.

## Calculator path

CTA: "Portfolio-Modus öffnen" → `/?topic=altersvorsorgeprodukte-vergleichen`

The topic-preselection mechanism (issue #13) fires combine-mode with no
`visibleProducts` seed — the InventoryWizard starts empty so users self-select
which contracts they actually have. This is the correct framing for "Wo geht
mein nächster Euro hin?" which requires knowing the user's existing contracts.

## JSON-LD type

`Article` (explanatory / portfolio-framing page, not single-product calculator).
`BreadcrumbList` emitted by the head pipeline automatically.

No `FAQPage` JSON-LD shipped for this issue — 4 visible Q&As are present
(meets the 3+ threshold in the acceptance criteria), but the answers have not
been reviewed by a human per PRD line 53. This is flagged for issue #07 follow-up.

## No-broker / no-recommendation constraints — MANDATORY

This page MUST NOT:
- Use winner framing ("besser", "lohnt sich", "empfohlen", product X > product Y).
- Include inline simulator output / live recommender results (PRD line 134).
- Imply broker or advisory services (§§ 34d, 34e GewO scope disclaimer required).
- Include affiliate links, commissions, or product promotions.

This page MUST:
- Explicitly state that RentenWiki.de is a free model calculator.
- State that the tool is not a broker, not an investment advisor, not a
  Versicherungsvermittler.
- Frame the recommender as cap-headroom-driven and Monte-Carlo-P10-risk-aware.
- Use "Modellrechnung" and "Illustration" framing throughout.

## Cited sources (inline + structured list below)

### Primary statutory sources

- **§ 3 Nr. 63 EStG** — bAV-Beitragsfreistellung in der Ansparphase.
- **§ 1a BetrAVG** — Rechtsanspruch auf Entgeltumwandlung + AG-Zuschuss (15 %).
- **§ 10 Abs. 1 Nr. 2 EStG** — Basisrente-Sonderausgabenabzug.
- **§ 10a EStG** — Riester/AVD-Sonderausgabenabzug (2 100 EUR/Jahr).
- **§ 18 InvStG** — Vorabpauschale ETF.
- **§ 20 Abs. 1 Nr. 1, Nr. 2, Abs. 9 EStG** — ETF-Kapitalerträge,
  Sparerpauschbetrag (1 000 EUR).
- **§ 22 Nr. 1 Satz 3 a EStG** — Leibrenten-Ertragsanteil, Besteuerungsanteil.
- **§ 22 Nr. 5 EStG** — Besteuerung geförderter Verträge (Riester, AVD).
- **§ 34 Abs. 1 EStG** — Fünftelregelung (Direktzusage, Unterstützungskasse).
- **§§ 84, 85 EStG** — Riester-Grundzulage und Kinderzulagen.
- **§ 93 Abs. 1a EStG** — Übertragung von Riester auf AVD (schädliche Verwendung).
- **§ 100 EStG** — AVD staatliche Zulage (20 % der Beiträge, max. 400 EUR).
- **§§ 226, 229, 237 SGB V** — KVdR-Beiträge auf gesetzliche Rente und
  Versorgungsbezüge inkl. 1/120-Regel für Kapitalleistungen.
- **§ 240 SGB V** — Freiwillige Mitgliedschaft.
- **§§ 55, 55a SGB XI** — Pflegeversicherung.
- **§§ 34d, 34e GewO** — Versicherungsvermittlung (RentenWiki.de übt dies
  nicht aus).
- **KWG / WpIG / WpHG** — Anlageberatung (nicht ausgeübt).

### Authoritative publications

- **BMF**: *Programmablaufplan 2026* (BMF-Schreiben vom 19. November 2025).
- **DRV Bund**: *Rentenversicherung in Zahlen 2025/2026*.
- **GKV-Spitzenverband**: *Beitragssatz-Übersicht 2026*.
- **Statistisches Bundesamt (Destatis)**: *Sterbetafeln 2021/2023*.

## Must-include caveats

1. Visible "Stand: 2026-05-06" line.
2. Not-advice disclaimer (`DisclaimerBanner`); FAQ reiterates "keine Empfehlung".
3. Impressum and Datenschutz links in footer.
4. Explicit no-broker/no-Vermittler statement (GewO / KWG).
5. "Kein Produktverkauf, keine Provision, kein Affiliate-Link."
6. Persona example (Markus) uses "Modellrechnung" caveat.
7. The recommender is described as cap-headroom-driven + Monte-Carlo-P10, never
   as "empfiehlt X".

## Visible page structure

1. H1 — "Altersvorsorgeprodukte vergleichen — ETF, bAV, Riester und mehr
   gemeinsam planen 2026"
2. Lead summary from registry.
3. Stand line.
4. CTA — "Portfolio-Modus öffnen" → `/?topic=altersvorsorgeprodukte-vergleichen`.
5. **Warum Altersvorsorge selten aus einem Produkt besteht** — multi-product
   complexity framing.
6. **Welche Produkte vergleicht RentenWiki.de?** — 6 products, each with §-refs.
7. **Der Portfolio-Modus: Verträge gemeinsam planen** — instanz, status,
   Transfer-Ereignisse.
8. **"Wo geht mein nächster Euro hin?"** — cap-headroom + Monte-Carlo framing,
   explicitly NOT a recommendation.
9. **Warum RentenWiki.de kein Broker ist** — GewO / KWG disclaimer.
10. **Beispiel: Markus (Stand 2026)** — modellhafte Tabelle.
11. **Häufige Fragen** — 4 Q&As.
12. **Quellen** — bullet list.
13. **Verwandte Seiten** — homepage + siblings.

## FAQ entries (visible, no FAQPage JSON-LD shipped for this issue)

- Kann ich alle meine Verträge zusammen eingeben?
- Empfiehlt der Rechner mir ein Produkt?
- Was kostet der Rechner?
- Werden meine Eingaben gespeichert oder weitergegeben?

## SEO surfaces (driven by `publicRouteRegistry.ts`)

- `title`: "Altersvorsorgeprodukte vergleichen — ETF, bAV, Riester, Basisrente & Co. 2026 | RentenWiki.de"
- `metaDescription`: "Alle Altersvorsorgeprodukte (ETF, bAV, private Rentenversicherung, Basisrente, Altersvorsorgedepot, Riester) gemeinsam planen: kostenloser Modellrechner, Portfoliomodus, \"Wo geht mein nächster Euro hin?\". Stand 2026. Kein Broker, keine Empfehlung."
- `jsonLdType`: `Article`
- `preselection`: `{ mode: 'combine' }` (no visibleProducts)

## Related routes

- `/` — Startseite
- `/rentenluecke-rechner` — Rentenlücke berechnen
- `/rente-netto-berechnen` — Rente netto berechnen

## Reviewer attention

- The no-broker framing is the primary YMYL-compliance concern. Every pass
  should verify: no affiliate links, no "empfehlen" language, no inline
  live recommender output.
- The `preselection: { mode: 'combine' }` entry must NOT carry `visibleProducts`.
  The InventoryWizard starts empty; users self-select contracts. If `visibleProducts`
  is accidentally added, the wizard would pre-check products the user may not have.
- The Article JSON-LD `publisher` must match the Organization block on the homepage
  (name: "RentenWiki.de"). Any rename of the organisation must be coordinated
  across `organization.ts`, `publicRouteRegistry.ts`, and this page's JSON-LD.
