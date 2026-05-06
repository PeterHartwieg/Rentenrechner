# Content brief — `/riester-rechner`

Status: draft
Author: Claude (AFK implementer, issue #05)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/riester-rechner`. The body lives at
`src/features/publicPages/riester-rechner.body.mdx`; the `.tsx` wrapper at
`RiesterRechnerPage.tsx` registers the page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to understand and calculate
the Riester-Rente subsidy — Grundzulage, Kinderzulage, Sonderausgabenabzug,
and payout taxation — before using the RentenWiki.de calculator.

Seed queries (from PRD seed query map, "Riester" cluster):

- "Riester Rechner"
- "Riester Rente berechnen"
- "Riester Zulage berechnen"
- "Riester Grundzulage 2026"
- "Riester Sonderausgabenabzug"
- "Riester Günstigerprüfung"

Adjacent informational intents we partly cover:

- "Wie viel Grundzulage bekomme ich?"
- "Riester Kinderzulage 2026"
- "Riester Rente Besteuerung Auszahlung"
- "Riester vs. ETF Vergleich"
- "Riester Kündigung Zulagen zurückzahlen"

## User intent

Three layered intents the page must serve in order:

1. **Definitional.** What is the Riester-Rente? How is it funded? Who is
   eligible?
2. **Procedural.** How are Zulagen and Sonderausgabenabzug calculated? How
   does the Günstigerprüfung work? What happens at payout?
3. **Calculator entry.** Deep-link via `/?topic=riester-rechner` (issue #13)
   to compare ETF vs. Riester with the user's own inputs.

## Calculator path

CTA: "Riester-Rente jetzt berechnen" → `/?topic=riester-rechner`.
This triggers `resolveTopicPreselection` in `LandingPage`, which seeds
`visibleProducts: ['etf', 'riester']` for first-time visitors.

## Cited sources

Inline citations in the page body must reference public, authoritative
sources. The following sources were used in the page body; new claims must
add a source from this list (or trigger an extension during review).

### Primary statutory sources

- **§ 84 EStG** — Grundzulage (Altersvorsorgezulage), 175 €/Jahr (Stand 2026).
- **§ 85 EStG** — Kinderzulage, 185 €/Kind (vor 2008) / 300 €/Kind (ab 2008).
- **§ 86 EStG** — Mindesteigenbeitrag (4 % des rentenversicherungspflichtigen
  Vorjahresbruttoeinkommens, mindestens 60 €/Jahr).
- **§ 10a EStG** — Sonderausgabenabzug bis 2.100 €/Jahr, Günstigerprüfung.
- **§ 92a EStG** — Wohn-Riester: Entnahme zur eigengenützten Immobilie.
- **§ 93 EStG** — Schädliche Verwendung und Portierung auf AVD.
- **§ 22 Nr. 5 EStG** — Nachgelagerte Besteuerung der Riester-Auszahlungen.
- **§ 226 SGB V** — KV-Beiträge der KVdR-Mitglieder auf Versorgungsbezüge.
- **§ 229 SGB V** — Versorgungsbezüge (Riester) als KV-Beitragsbasis.
- **§ 240 SGB V** — KV-Beiträge freiwillig Versicherter.
- **§§ 55, 55a SGB XI** — Pflegeversicherungssatz und Kinderzuschlag.
- **AltZertG § 1** — Zertifizierungsanforderungen für Riester-Produkte
  (Kapitalgarantie, Leibrentenerfordernis).

### Authoritative publications

- **Zentrale Zulagenstelle für Altersvermögen (ZfA):** zuständige Behörde
  für Zulagenvergabe und -rückforderung; URL:
  https://www.zfa.deutsche-rentenversicherung.de
- **BaFin:** Zertifizierungsregister nach AltZertG; Aufsicht über
  Produktanbieter (Rentenversicherungen, Fondssparpläne).
- **Bundesministerium der Finanzen (BMF):** *Programmablaufplan für die
  Berechnung der Lohnsteuer 2026* (BMF-Schreiben vom 19. November 2025).
- **Deutsche Rentenversicherung Bund:** *Rentenversicherung in Zahlen
  2025/2026* — Beitragsbemessungsgrenzen, Rentenwert.
- **GKV-Spitzenverband:** Beitragssatz-Übersicht 2026.

## Must-include caveats

1. **Visible "Stand: 2026-05-06" line** at the top of the article.
2. **Not-advice disclaimer.** `DisclaimerBanner` is rendered first; body
   reiterates "kein Anlagevorschlag und keine Empfehlung".
3. **Link to Impressum and Datenschutz** in the page footer.
4. **No "winner" framing.** The body describes mechanics and conditions,
   not "Riester is better/worse than ETF". PRD line 111.
5. **No commercial-license-only content.** PRD line 121.

## Visible page structure

(matches the rendered MDX — keep in sync if the body changes)

1. H1 — `Riester-Rechner 2026 — Zulagen, Steuerförderung und Auszahlung berechnen`
2. Lead paragraph — short summary string from the registry.
3. Stand line — `Stand: 2026-05-06 · Werte für Deutschland 2026`.
4. CTA — link to `/?topic=riester-rechner` with label "Riester-Rente jetzt berechnen".
5. **Was ist die Riester-Rente?** — definition, AltZertG §1, Schicht-2-Förderung.
6. **Staatliche Förderung** — Grundzulage §84, Kinderzulage §85, Mindesteigenbeitrag §86.
7. **Sonderausgabenabzug und Günstigerprüfung (§10a EStG)** — max. 2.100 €,
   automatische Prüfung durch Finanzamt.
8. **Zertifizierung und Produktformen (AltZertG)** — Fondssparplan,
   Bankplan, Rentenversicherung, Wohn-Riester.
9. **Besteuerung in der Auszahlphase (§22 Nr. 5 EStG)** — nachgelagert,
   volle KV/PV-Pflicht.
10. **Schädliche Verwendung (§93 EStG)** — Kündigung, beitragsfreie Stellung,
    Übertragung auf AVD.
11. **Beispielrechnung: Lena** (Szenario — Stand 2026) — hardcoded table,
    Modellcharakter explizit.
12. **Häufige Fragen** — 4 visible Q&As.
13. **Quellen** — bullet list matching inline citations.
14. **Verwandte Seiten** — link list to homepage and 3 siblings.

## FAQ entries (visible-only)

The page ships 4 visible Q&As. Per PRD line 53 + Google structured-data
guidelines, FAQ schema must only appear when every Q&A is visibly rendered.
This page does NOT emit FAQPage JSON-LD — the JSON-LD type is `WebApplication`.

## SEO surfaces (driven by `publicRouteRegistry.ts`)

- `title`: `"Riester-Rechner 2026 — Zulagen, Sonderausgabenabzug und Auszahlung | RentenWiki.de"`
- `metaDescription`: `"Riester-Rente modellhaft berechnen: Grundzulage (§ 84 EStG), Kinderzulage (§ 85 EStG), Sonderausgabenabzug § 10a EStG, Günstigerprüfung und Auszahlungsbesteuerung § 22 Nr. 5 EStG. Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung."`
- `h1`: matches the visible H1 above.
- `summary`: matches the lead paragraph above.
- `dateModified`: `2026-05-06`
- `robots`: `index,follow`
- `inSitemap`: `true`
- `jsonLdType`: `WebApplication`
- `preselection`: `{ mode: 'compare', visibleProducts: ['etf', 'riester'] }`

## Out-of-scope (downstream issues)

- Per-route OG card — issue #08.
- FAQ JSON-LD with hidden vs. visible questions — deferred until human review.
- Cloudflare Content Signals — issue #09.
- `llms.txt` / `llms-full.txt` — issue #10.
