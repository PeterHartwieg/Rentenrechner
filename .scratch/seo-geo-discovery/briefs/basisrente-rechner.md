# Content brief — `/basisrente-rechner`

Status: draft
Author: Claude (AFK implementer, issue #06)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/basisrente-rechner`. The body lives at
`src/features/publicPages/basisrente-rechner.body.mdx`; the `.tsx` wrapper at
`BasisrenteRechnerPage.tsx` registers the page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to calculate the tax benefit of a
Basisrente (Rürup) contract and understand payout restrictions.

Seed queries (from PRD seed query map, "Basisrente" cluster):

- "Basisrente Rechner"
- "Rürup Rechner"
- "Basisrente Steuervorteil berechnen"
- "Rürup oder ETF"
- "Basisrente Selbständig sinnvoll 2026"

Adjacent informational intents we partly cover:

- "Was ist Basisrente?"
- "Basisrente Kapitalauszahlung möglich?"
- "Basisrente Besteuerungsanteil 2026"
- "Rürup kündigen"

## User intent

Three layered intents the page must serve in order:

1. **Definitional.** What is the Basisrente (Rürup)? Who is it for?
2. **Procedural.** How is the Sonderausgabenabzug calculated? What is the
   Besteuerungsanteil cohort table? Why can't I take a lump sum?
3. **Calculator entry.** Deep-link into the calculator at
   `/?topic=basisrente-rechner` (preselects ETF + basisrente in compare mode).

## Critical UX requirement

The **no-Kapitalauszahlung constraint** must be made visibly explicit — this is
a documented frequent user surprise per the issue brief. A dedicated section
"Auszahlungsbeschränkung: Kapitalauszahlung verboten" with prominent framing
is required. Tests assert on this.

## Calculator path

CTA: "Basisrente jetzt berechnen" → `/?topic=basisrente-rechner`
Preselection (issue #13): `{ mode: 'compare', visibleProducts: ['etf', 'basisrente'] }`

## Cited sources (inline + listed in Quellen section)

### Primary statutory sources

- **§ 10 Abs. 1 Nr. 2 EStG** — Sonderausgaben-Tatbestand für Basisrentenbeiträge;
  Verbot der Kapitalauszahlung in Satz 2 lit. b.
- **§ 10 Abs. 3 EStG** — Höchstbetrag für Basisrentenbeiträge (100 % der
  Beitragsbemessungsgrenze West 2026 = 29 344 €/Jahr für Alleinveranlagte;
  58 688 €/Jahr für Zusammenveranlagte).
- **§ 22 Nr. 1 Satz 3 a aa EStG** — Kohortenbasierter Besteuerungsanteil für
  Leibrenten aus der Basisversorgung; Tabelle der Besteuerungsanteile.
- **§ 226 SGB V** — KV-Beitragspflicht auf Leibrenten in der KVdR.
- **§ 240 SGB V** — KV-Beitragspflicht für freiwillig gesetzlich Versicherte.
- **§§ 55, 55a SGB XI** — Pflegeversicherungsbeitrag.

### Statutory framework documents

- **AltZertG (Altersvorsorgeverträge-Zertifizierungsgesetz)** — Zertifizierungs-
  voraussetzungen, insbesondere zulässige Leistungsformen (§ 1 Abs. 1 Nr. 2:
  lebenslange Leibrente oder Ratenzahlung).

### Authoritative publications

- **BMF:** *Programmablaufplan für die Berechnung der Lohnsteuer 2026*
  (BMF-Schreiben vom 19. November 2025).
- **Deutsche Rentenversicherung Bund:** *Besteuerungsanteile für Renten aus der
  gesetzlichen Rentenversicherung und vergleichbare Renten, Stand 2026* —
  Kohortentabelle Besteuerungsanteile.
- **Statistisches Bundesamt (Destatis):** *Sterbetafeln 2021/2023* — Grundlage
  für Lebenserwartungsannahmen in der Modellrechnung.

### Supporting product standard

- **VVG-InfoV § 2a** — Effektivkostenquote (Reduction in Yield) bei
  zertifizierten Altersvorsorgeprodukten.

## Must-include caveats

1. **Visible "Stand: 2026-05-06" line** at top of article.
2. **Not-advice disclaimer.** `DisclaimerBanner` rendered; inline prose also
   repeats "keine Empfehlung" framing.
3. **Impressum + Datenschutz links** in page footer.
4. **No-Kapitalauszahlung** — explicitly framed as a legal constraint, not a
   product flaw. Source: § 10 Abs. 1 Nr. 2 EStG + AltZertG.
5. **No winner framing.** Comparison of Basisrente vs. ETF frames conditions and
   tradeoffs, not a verdict.

## Visible page structure

1. H1 — from registry.
2. Lead paragraph — summary string from registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — `/?topic=basisrente-rechner`.
5. **Was ist die Basisrente (Rürup)?** — definition, Schicht 1, self-employed use.
6. **Steuerliche Förderung in der Ansparphase** — § 10 Abs. 3 EStG, Höchstbetrag,
   Beispielrechnung (Markus, Beamter, persona from user-scenarios.md).
7. **Besteuerungsanteil in der Rentenphase** — § 22 Nr. 1 Satz 3 a aa EStG,
   cohort table 2025–2058.
8. **Auszahlungsbeschränkung: Kapitalauszahlung verboten** — core UX requirement;
   legal prohibition; Leibrente and Zeitrente as permitted forms; ETF comparison
   note (ETF has flexibility, Basisrente does not).
9. **Kostenstruktur** — wrapperAssetFee, fundAssetFee, RIY/Effektivkosten.
10. **Was der Rechner berechnet** — inputs/outputs, no engine code, just prose.
11. **Häufige Fragen** — 4 visible Q&As: Angestellte, Tod, Kündigung, GRV-Verhältnis,
    Basisrente vs. ETF in Rechner.
12. **Quellen** — bullet list citing all statutory and publication sources.
13. **Verwandte Seiten** — internal links to homepage, /rentenluecke-rechner,
    /private-rentenversicherung-rechner.

## FAQ entries (visible on page — FAQPage JSON-LD condition)

Page has 5 FAQ entries visible. The issue brief says "FAQPage only if 3+ Q/As
are visibly rendered." Per locked decision #3 in the issue, FAQPage JSON-LD is
optional per page; the agent decides. Since there are 5 visible Q/As, FAQPage
JSON-LD *could* be added in a follow-on issue. This release ships `WebApplication`
only (as specified in the registry).

## SEO surfaces (driven by publicRouteRegistry.ts)

- `title`: Registered.
- `metaDescription`: Registered.
- `h1`: Matches visible H1.
- `summary`: Matches lead paragraph.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `WebApplication`
- `preselection`: `{ mode: 'compare', visibleProducts: ['etf', 'basisrente'] }`

## Out of scope (downstream issues)

- Per-route OG card — issue #08.
- FAQPage JSON-LD — deferred until human review.
- Cloudflare Content Signals — issue #09.
- llms.txt — automatic from registry.
