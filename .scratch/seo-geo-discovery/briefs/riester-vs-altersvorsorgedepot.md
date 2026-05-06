# Content brief — `/riester-vs-altersvorsorgedepot`

Status: draft
Author: Claude (AFK implementer, issue #05)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/riester-vs-altersvorsorgedepot`. The body
lives at `src/features/publicPages/riester-vs-altersvorsorgedepot.body.mdx`;
the `.tsx` wrapper at `RiesterVsAltersvorsorgedepotPage.tsx` registers the
page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to compare Riester-Rente and the
new Altersvorsorgedepot (AVD) — same subsidy, different product form, transfer
mechanics — before deciding which to use or before using the calculator.

Seed queries (from PRD seed query map, "Riester vs AVD" cluster):

- "Riester oder Altersvorsorgedepot"
- "Riester vs Altersvorsorgedepot Vergleich"
- "Riester Rente auf Altersvorsorgedepot übertragen"
- "Altersvorsorgedepot vs Riester 2026"
- "Riester Rente kündigen für AVD"

Adjacent informational intents we partly cover:

- "Sind Riester und Altersvorsorgedepot gleich gefördert?"
- "Unterschied Riester Depot und Versicherung"
- "AVD Kapitalgarantie"
- "Riester Portabilität 2026"

## User intent

Three layered intents the page must serve in order:

1. **Comparative.** Side-by-side comparison of product mechanics, subsidy,
   cost structure, risk profile, and payout rules.
2. **Transfer mechanics.** What happens when moving Riester → AVD?
   Is it taxed? Are Zulagen retained?
3. **Calculator entry.** Deep-link via `/?topic=riester-vs-altersvorsorgedepot`
   (issue #13) to run a side-by-side Riester vs. AVD comparison.

## Calculator path

CTA: "Riester vs. AVD selbst berechnen" → `/?topic=riester-vs-altersvorsorgedepot`.
This triggers `resolveTopicPreselection` in `LandingPage`, which seeds
`visibleProducts: ['riester', 'altersvorsorgedepot']` for first-time visitors.

## YMYL guardrail — no winner copy

This is a comparison page (JSON-LD type: `Article`). Per PRD line 111:

> "comparison tables should frame conditions, not declare a winner."

The body must NOT:
- Declare either product as "better" or "worse" in general terms
- Recommend one product over the other
- Use phrases like "ist besser", "der Sieger", "wir empfehlen"

The body MUST:
- Frame differences as conditions: "when X, Riester has Y; when Z, AVD has W"
- Explicitly state in a dedicated section what the page does not answer
- Mention that individual circumstances require personal review

## Cited sources

### Primary statutory sources

- **§§ 84, 85 EStG** — Grundzulage und Kinderzulage (beide Produkte identisch).
- **§ 86 EStG** — Mindesteigenbeitrag (beide Produkte identisch).
- **§ 10a EStG** — Sonderausgabenabzug bis 2.100 €/Jahr (beide identisch).
- **§ 22 Nr. 5 EStG** — Nachgelagerte Besteuerung (beide Produkte identisch).
- **§ 93 EStG** — Schädliche Verwendung; Portierung Riester → AVD nicht
  schädlich bei Einhaltung der Voraussetzungen.
- **§ 229 SGB V** — KV-Beitragspflicht auf Versorgungsbezüge.
- **§ 240 SGB V** — freiwillig Versicherte.
- **§§ 55, 55a SGB XI** — Pflegeversicherungssatz und Kinderzuschlag.
- **AltZertG § 1** — Zertifizierungsvoraussetzungen für Riester (Kapitalgarantie).

### Gesetzliche Grundlage

- **Jahressteuergesetz 2024** — Einführung des AVD, Portierungsregelung.
- **AltvVerbG** — Zertifizierungsrahmen für das AVD.

### Authoritative publications

- **Zentrale Zulagenstelle für Altersvermögen (ZfA):** Zulagenvergabe für
  beide Produkte; URL: https://www.zfa.deutsche-rentenversicherung.de
- **BaFin:** Zertifizierungsregister nach AltZertG / AltvVerbG.
- **Bundesministerium der Finanzen (BMF):** *Programmablaufplan für die
  Berechnung der Lohnsteuer 2026* (BMF-Schreiben vom 19. November 2025).
- **Deutsche Rentenversicherung Bund:** *Rentenversicherung in Zahlen
  2025/2026*.

## Must-include caveats

1. **Visible "Stand: 2026-05-06" line** at the top of the article.
2. **Not-advice disclaimer.** `DisclaimerBanner` is rendered first.
3. **Link to Impressum and Datenschutz** in the page footer.
4. **No winner framing** — explicit section "Was diese Seite nicht beantwortet"
   confirms the page does not recommend either product.
5. **Transfer mechanics** must be referenced where relevant (§93 EStG, status
   of AVD portability from Riester at time of writing).
6. **Both products have identical § 22 Nr. 5 EStG payout taxation** —
   must be stated clearly so users do not assume they differ on this axis.

## Visible page structure

(matches the rendered MDX — keep in sync if the body changes)

1. H1 — `Riester oder Altersvorsorgedepot? Vergleich der geförderten Schicht-2-Wege 2026`
2. Lead paragraph — summary from registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — link to `/?topic=riester-vs-altersvorsorgedepot`.
5. **Überblick** — framing statement, both products are Schicht 2, same
   subsidy, AVD is new (Jahressteuergesetz 2024).
6. **Vergleichstabelle** — 13-row table, Stand 2026 caveat.
7. **Förderstruktur: Gemeinsamkeiten und Unterschiede** — identical §§84/85,
   Günstigerprüfung, Kinderzulagen vs. Sonderausgabenabzug.
8. **Produktform: Versicherung vs. Depot** — AltZertG §1 Kapitalgarantie
   vs. AVD kein Garantie, Glidepath.
9. **Besteuerung: §22 Nr. 5 EStG** — both identical, nachgelagert, KV/PV.
10. **Übertragung: Riester → AVD (§93 EStG)** — steuerbefreit, Zulagen
    bleiben, Portabilität noch nicht vollständig umgesetzt (Stand: 2026).
11. **Beispielrechnung: Lena** (Szenario — Stand 2026) — hardcoded table,
    identical subsidy side-by-side.
12. **Was diese Seite nicht beantwortet** — explicit no-winner declaration.
13. **Häufige Fragen** — 4 visible Q&As.
14. **Quellen** — bullet list.
15. **Verwandte Seiten** — link list.

## FAQ entries (visible-only)

4 visible Q&As. JSON-LD type is `Article` — no FAQPage JSON-LD emitted.

## SEO surfaces (driven by `publicRouteRegistry.ts`)

- `title`: `"Riester oder Altersvorsorgedepot? Vergleich 2026 | RentenWiki.de"`
- `metaDescription`: `"Riester-Rente vs. Altersvorsorgedepot (AVD) im direkten Vergleich: Förderstruktur, Zulagen, Sonderausgabenabzug, Übertragungsmöglichkeiten und Auszahlungsbesteuerung nach § 22 Nr. 5 EStG. Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung."`
- `h1`: matches the visible H1 above.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `Article` (comparison / explanatory page — issue #05 decision)
- `preselection`: `{ mode: 'compare', visibleProducts: ['riester', 'altersvorsorgedepot'] }`

## Out-of-scope (downstream issues)

- Per-route OG card — issue #08.
- FAQ JSON-LD — deferred until human review.
- Cloudflare Content Signals — issue #09.
- Yearly update checklist — issue #12.
