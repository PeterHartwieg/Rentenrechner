# Content brief — `/altersvorsorgedepot-rechner`

Status: draft
Author: Claude (AFK implementer, issue #05)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/altersvorsorgedepot-rechner`. The body
lives at `src/features/publicPages/altersvorsorgedepot-rechner.body.mdx`; the
`.tsx` wrapper at `AltersvorsorgedepotRechnerPage.tsx` registers the page in
`publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to understand the new
Altersvorsorgedepot (AVD) introduced by Jahressteuergesetz 2024 — how it is
subsidised, how it differs from Riester, and how the payout is taxed.

Seed queries (from PRD seed query map, "AVD" cluster):

- "Altersvorsorgedepot Rechner"
- "AVD Altersvorsorge Depot berechnen"
- "Altersvorsorgedepot Jahressteuergesetz 2024"
- "AVD vs Riester Vergleich"
- "Altersvorsorgedepot Förderung"
- "Altersvorsorgedepot Steuern Auszahlung"

Adjacent informational intents we partly cover:

- "Was ist das Altersvorsorgedepot?"
- "Altersvorsorgedepot Glidepath"
- "Riester zu Altersvorsorgedepot übertragen"
- "Altersvorsorgedepot §22 Nr. 5 EStG"

## User intent

Three layered intents the page must serve in order:

1. **Definitional.** What is the Altersvorsorgedepot? What law introduced it?
   How does it differ from Riester?
2. **Procedural.** How is the subsidy calculated? What is the Glidepath?
   How is the payout taxed?
3. **Calculator entry.** Deep-link via `/?topic=altersvorsorgedepot-rechner`
   (issue #13) to compare ETF vs. AVD with the user's own inputs.

## Calculator path

CTA: "Altersvorsorgedepot jetzt berechnen" → `/?topic=altersvorsorgedepot-rechner`.
This triggers `resolveTopicPreselection` in `LandingPage`, which seeds
`visibleProducts: ['etf', 'altersvorsorgedepot']` for first-time visitors.

## Cited sources

### Primary statutory sources

- **§ 84 EStG** — Grundzulage (175 €/Jahr, gilt identisch für AVD).
- **§ 85 EStG** — Kinderzulage (185 €/Kind vor 2008, 300 €/Kind ab 2008).
- **§ 86 EStG** — Mindesteigenbeitrag (4 % des BBE-Einkommens, min. 60 €/Jahr).
- **§ 10a EStG** — Sonderausgabenabzug bis 2.100 €/Jahr, Günstigerprüfung.
- **§ 22 Nr. 5 EStG** — Nachgelagerte Besteuerung der AVD-Auszahlungen.
- **§ 20 EStG** — Kapitalerträge (Steuerstundung in der Ansparphase erklärt).
- **§ 93 EStG** — Schädliche Verwendung; Portierung Riester → AVD nicht
  schädlich bei Einhaltung der Voraussetzungen.
- **§ 229 SGB V** — KV-Beitragspflicht auf AVD-Auszahlungen (Versorgungsbezüge).
- **§ 240 SGB V** — freiwillig Versicherte.
- **§§ 55, 55a SGB XI** — Pflegeversicherungssatz und Kinderzuschlag.

### Gesetzliche Grundlage

- **Jahressteuergesetz 2024** — Einführung des Altersvorsorgedepots als
  neues Schicht-2-Produkt.
- **Altersvorsorgeverbesserungsgesetz (AltvVerbG)** — Zertifizierungs- und
  Anforderungsrahmen für das AVD.

### Authoritative publications

- **BaFin:** Zertifizierungsregister und Aufsicht über AVD-Anbieter.
- **Zentrale Zulagenstelle für Altersvermögen (ZfA):** zuständig für
  Zulagegewährung und -rückforderung auch beim AVD.
- **Bundesministerium der Finanzen (BMF):** *Programmablaufplan für die
  Berechnung der Lohnsteuer 2026* (BMF-Schreiben vom 19. November 2025).
- **Deutsche Rentenversicherung Bund:** *Rentenversicherung in Zahlen
  2025/2026*.

## Must-include caveats

1. **Visible "Stand: 2026-05-06" line** at the top of the article.
2. **Not-advice disclaimer.** `DisclaimerBanner` is rendered first.
3. **Link to Impressum and Datenschutz** in the page footer.
4. **No "winner" framing.** The body describes the AVD's characteristics
   and differences from Riester — no product is declared superior.
5. **Jahressteuergesetz 2024 as the origin** must be explicitly stated;
   the product is less than 2 years old at the time of writing.
6. **Glidepath explained.** The mechanic is product-specific but mandatory
   by law; the body must clarify this is a legal requirement, not a
   voluntary feature.
7. **No capital guarantee.** The absence of a capital guarantee must be
   stated clearly as a risk note — contrast with Riester's AltZertG §1
   guarantee requirement.

## Visible page structure

(matches the rendered MDX — keep in sync if the body changes)

1. H1 — `Altersvorsorgedepot-Rechner 2026 — Neues Schicht-2-Produkt vergleichen`
2. Lead paragraph — summary from registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — link to `/?topic=altersvorsorgedepot-rechner`.
5. **Was ist das Altersvorsorgedepot?** — definition, Jahressteuergesetz 2024,
   AltvVerbG, kein Versicherungsmantel.
6. **Staatliche Förderung (analog zur Riester-Rente)** — §84/§85/§86/§10a EStG,
   ZfA.
7. **Depot statt Versicherung: Was ist anders?** — comparison table
   (Riester vs. AVD, 10 rows, Stand 2026).
8. **Glidepath: automatische Umschichtung** — gesetzliche Pflicht, Risiko-
   reduktion, Rendite-Dämpfung.
9. **Besteuerung in der Auszahlphase (§22 Nr. 5 EStG)** — nachgelagert,
   Steuerstundung in der Ansparphase, KV/PV-Pflicht.
10. **Übertragung von Riester auf AVD** — §93 EStG Portierung, Status 2026.
11. **Beispielrechnung: Bernd** (Szenario — Stand 2026) — hardcoded table.
12. **Häufige Fragen** — 4 visible Q&As.
13. **Quellen** — bullet list.
14. **Verwandte Seiten** — link list.

## FAQ entries (visible-only)

4 visible Q&As. JSON-LD type is `WebApplication` — no FAQPage JSON-LD emitted.

## SEO surfaces (driven by `publicRouteRegistry.ts`)

- `title`: `"Altersvorsorgedepot-Rechner 2026 — Neues Schicht-2-Produkt vergleichen | RentenWiki.de"`
- `metaDescription`: `"Altersvorsorgedepot (AVD) modellhaft berechnen: depot-basierte Altersvorsorge ohne Versicherungsmantel, Förderung nach § 10a EStG, Auszahlungsbesteuerung § 22 Nr. 5 EStG (Jahressteuergesetz 2024). Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung."`
- `h1`: matches the visible H1 above.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `WebApplication`
- `preselection`: `{ mode: 'compare', visibleProducts: ['etf', 'altersvorsorgedepot'] }`

## Out-of-scope (downstream issues)

- Per-route OG card — issue #08.
- FAQ JSON-LD — deferred until human review.
- Cloudflare Content Signals — issue #09.
- Yearly update checklist — issue #12.
