# Content brief — `/rentenluecke-rechner`

Status: draft
Author: Claude (AFK implementer, issue #02)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/rentenluecke-rechner`. The body lives at
`src/features/publicPages/rentenluecke-rechner.body.mdx`; the `.tsx` wrapper at
`RentenluckeRechnerPage.tsx` registers the page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to estimate the gap between their
expected statutory pension and the net monthly income they would prefer in
retirement.

Seed queries (from PRD seed query map, "Renten gap" cluster):

- "Rentenlücke Rechner"
- "Rentenlücke berechnen"
- "Rente netto berechnen"
- "Wunschrente Rechner"
- "Versorgungslücke berechnen"

Adjacent informational intents we partly cover:

- "Wie hoch ist meine Rentenlücke?"
- "Was ist eine Versorgungslücke?"
- "Wann beginnt die Rentenlücke?"
- "Sicherungsniveau gesetzliche Rente Deutschland 2026"

## User intent

Three layered intents the page must serve in order:

1. **Definitional.** What is the Rentenlücke? Why does it exist?
2. **Procedural.** How is it calculated? What inputs does the calculator
   need? What assumptions vary?
3. **Calculator entry.** Direct deep-link to the calculator at `/`. The
   topic-preselection mechanism (`?topic=rentenluecke`) is deferred to
   issue #13; this slice ships a plain `/` link.

## Calculator path

CTA: "Rentenlücke jetzt berechnen" → `/`. The user lands on the home page,
which already contains the inventory wizard for combine-mode and the compare
picker for compare-mode. After issue #13 ships, the link will preselect a
relevant set of inputs.

## Cited sources

Inline citations in the page body must reference public, authoritative sources.
Only the sources below have been used; new claims must add a source from this
list (or trigger an extension during review).

### Primary statutory sources

- **§ 154 SGB VI** — Sicherungsziel und Sicherungsniveau (current 48%
  Standardrentenniveau pre-tax for 45 contribution years).
- **§ 68 SGB VI** — Rentenwertanpassungsformel (annual statutory pension value
  adjustment, follows wage development).
- **§ 77 SGB VI** — Zugangsfaktor (premium / discount on benefit by entry age).
- **§ 109 SGB VI** — Renteninformation (annual letter sent from age 27).
- **§ 226 SGB V** — Beiträge KVdR (statutory health-insurance contribution
  basis for KVdR members).
- **§ 240 SGB V** — Beiträge freiwillige Mitgliedschaft (contribution basis
  for voluntary statutory health-insurance members in retirement).
- **§ 55 SGB XI / § 55a SGB XI** — Pflegeversicherungs-Beitragssatz +
  Kinderzuschlag (long-term care insurance rate and child surcharge).
- **§ 22 EStG** — Besteuerung von Renten (tax treatment of statutory pensions,
  Basisrente, certified pensions).
- **§ 22 Nr. 1 Satz 3 a EStG** — Ertragsanteil bei Leibrenten aus privaten
  Rentenversicherungen.
- **§ 22 Nr. 5 EStG** — Besteuerung geförderter Verträge (Riester, AVD).
- **§ 20 Abs. 1 Nr. 6 EStG** — Tax mode for capital payouts from private
  pension contracts.

### Authoritative publications

- **Bundesministerium der Finanzen (BMF):** *Programmablaufplan für die
  Berechnung der Lohnsteuer 2026* (BMF-Schreiben vom 19. November 2025) —
  used for the salary-phase tax pipeline that backs the gross-to-net
  projection.
- **Deutsche Rentenversicherung Bund:** *Rentenversicherung in Zahlen
  2025/2026* — current Entgeltpunkte, Standardrentenniveau, Rentenwert.
- **Deutsche Rentenversicherung Bund:** *Rentenversicherungsbericht der
  Bundesregierung 2025* — official outlook used for sicherungsniveau
  context.
- **GKV-Spitzenverband:** *Beitragssatz-Übersicht 2026* — KV/PV contribution
  rates, average Zusatzbeitrag.
- **Statistisches Bundesamt (Destatis):** *Sterbetafeln 2021/2023* —
  background for life-expectancy assumptions.

### Supplementary references (no claims sourced from these but useful for context)

- **BaFin** — supervisory publications on private pension insurance
  mechanics (cited from the body when the topic is private-insurance
  payouts, not used in the Rentenlücke definition itself).
- **BMAS** — § 240 SGB V context for freiwillig-GKV-Mitgliedschaft in
  retirement.

## Must-include caveats

Every public discovery page in this project must include the following — the
review will block if any of them is missing.

1. **Visible "Stand: 2026-05-06" line** at the top of the article. The JSON-LD
   `dateModified` references the same value.
2. **Not-advice disclaimer.** The shared `DisclaimerBanner` is rendered at the
   top of `<main>` for both prerender and hydration; the inline FAQ section
   also reiterates that the page is "kein Anlagevorschlag und keine
   Empfehlung".
3. **Link to Impressum and Datenschutz** in the page footer — the user must
   always be one click away from the legal pages.
4. **No "winner" framing.** The body intentionally describes inputs and
   assumptions, not "the right answer". Per PRD line 111: comparison tables
   should frame conditions, not declare a winner.
5. **No commercial-license-only content.** PRD line 121 forbids gating
   discovery pages behind commercial license checks.

## Visible page structure

(matches the rendered MDX — keep in sync if the body changes)

1. H1 — `Rentenlücke berechnen — Versorgungslücke in Deutschland 2026`
2. Lead paragraph — short summary string from the registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — link to `/` with label "Rentenlücke jetzt berechnen".
5. **Was ist die Rentenlücke?** — definition + Sicherungsniveau citation.
6. **Wie wird die Rentenlücke berechnet?** — three components (Wunschrente,
   gesetzliche Nettorente, weitere Vorsorgewege) with statutory citations.
7. **Welche Eingaben braucht der Rechner?** — input list with PAP / DRV
   citations.
8. **Welche Annahmen variieren?** — Rentenanpassung, Inflation, Renditen,
   Gesetzesänderungen, Lebenserwartung.
9. **Was die Rentenlücke nicht ist** — explicit not-advice frame.
10. **Häufige Fragen** — 4 visible Q&As (Sicherungslücke, Steuer in der
    Auszahlphase, KV/PV in der Auszahlphase, Aktualität der Werte).
11. **Quellen** — bullet list of source references that match the inline
    citations.
12. **Verwandte Seiten** — link list to homepage and 404 sibling.

## FAQ entries (visible-only)

Per PRD line 53 + Google structured-data guidelines, FAQ schema must only
appear when every Q&A is visibly rendered. This page does **not** ship FAQ
JSON-LD in issue #02 — the JSON-LD type is `WebApplication`. The FAQ section
is rendered as plain prose; FAQ structured data is reserved for a later
issue once we have stable answers reviewed by a human.

## SEO surfaces (driven by `publicRouteRegistry.ts`)

Stored fields:

- `title`: `"Rentenlücke berechnen — Rechner für die Versorgungslücke 2026 | RentenWiki.de"`
- `metaDescription`: `"Rentenlücke (Versorgungslücke) berechnen: Differenz zwischen erwarteter gesetzlicher Rente und gewünschtem Nettoeinkommen im Ruhestand. Modellrechnung mit Werten Stand 2026."`
- `h1`: matches the visible H1 above.
- `summary`: matches the lead paragraph above.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `WebApplication` (`@context: schema.org`, `applicationCategory:
  FinanceApplication`, `offers.price: 0` since the calculator is free).

## Out-of-scope (downstream issues)

- Per-route OG card — issue #08; this slice ships the shared brand
  placeholder at `/og/default.png`.
- Topic-preselection deep-link (`?topic=rentenluecke`) — issue #13.
- Full topic-page hub on the homepage — issue #03.
- FAQ JSON-LD with hidden vs. visible questions — deferred until human review.
- Cloudflare Content Signals (`search=yes, ai-input=yes, ai-train=no`) —
  issue #09.
- `llms.txt` / `llms-full.txt` — issue #10.
- Sibling topic pages (`/bav-rechner`, `/etf-vs-bav`, etc.) — issues #04–#07.
