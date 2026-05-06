# Content brief — `/rente-netto-berechnen`

Status: draft
Author: Claude (AFK implementer, issue #07)
Last reviewed for statutory accuracy: 2026-05-06

This brief drives the page copy at `/rente-netto-berechnen`. The body lives at
`src/features/publicPages/rente-netto-berechnen.body.mdx`; the `.tsx` wrapper
at `RenteNettoBerechnePage.tsx` registers the page in `publicRouteRegistry.ts`.

## Target query cluster

Primary intent: a German-speaking user wants to understand how much of their
statutory pension they will actually receive (net of tax, KV, and PV).

Seed queries (from PRD seed query map, "Renten gap" cluster):

- "Rente netto berechnen"
- "gesetzliche Rente Steuer berechnen"
- "Rente nach Steuern 2026"
- "KVdR Beitrag Rentner"
- "Besteuerungsanteil Rente Jahrgang"
- "Versorgungsfreibetrag Beamte"

Adjacent informational intents:

- "Wie viel Steuer zahle ich auf meine Rente?"
- "KVdR oder freiwillig versichert als Rentner?"
- "Werbungskosten Rente Pauschbetrag"
- "Besteuerungsanteil 2032 Rentner"

## User intent

Three layered intents:

1. **Definitional.** What does "Rente netto" mean? What gets deducted?
2. **Procedural.** How is the tax calculated (Besteuerungsanteil, Kohorte)?
   How does KV/PV work (KVdR vs. freiwillig)?
3. **Calculator entry.** CTA: `/?topic=rente-netto-berechnen` → compare-mode
   with ETF preselected (GRV always shown; user sees GRV netto alongside
   a potential ETF supplement).

## Calculator path

CTA: "Rente netto jetzt berechnen" → `/?topic=rente-netto-berechnen`

The topic-preselection mechanism (issue #13) fires compare-mode with
`visibleProducts: ['etf']`. GRV is always visible alongside the comparison.
This is the most natural "Rentenlücke schließen" framing.

## JSON-LD type

`WebApplication` (calculator-shaped page). `BreadcrumbList` emitted by the
head pipeline automatically. No `FAQPage` JSON-LD shipped because the FAQ
section is rendered as plain prose and the answers have not been reviewed by
a human (PRD line 53 / Google structured-data guidelines).

## Cited sources (inline + structured list below)

### Primary statutory sources

- **§ 22 Nr. 1 Satz 3 a EStG** — Besteuerungsanteil bei Leibrenten aus
  gesetzlicher Rentenversicherung und Basisrente (Kohorten-Modell;
  Renteneintritt 2005 → 50 %, +2 pp/Jahr bis 2020, +1 pp/Jahr ab 2021,
  100 % ab 2058). Eingefrierter Rentenfreibetrag ab dem ersten vollen
  Rentenjahr.
- **§ 19 Abs. 2 EStG** — Versorgungsfreibetrag für Beamtenpensionen und
  vergleichbare Bezüge (sinkt ebenfalls jahrgangsstufig).
- **§ 9a Satz 1 Nr. 3 EStG** — Werbungskosten-Pauschbetrag für Renteneinkünfte
  (102 EUR jährlich; ersetzbar durch tatsächliche höhere Werbungskosten).
- **§ 10c EStG** — Sonderausgaben-Pauschbetrag (36 EUR; regelmäßig durch
  tatsächliche KV/PV-Beiträge überschritten).
- **§ 10 Abs. 1 Nr. 3 EStG** — Abzug der tatsächlichen KV/PV-Beiträge als
  Sonderausgaben.
- **§ 5 Abs. 1 Nr. 11 SGB V** — Halbbelegung; Zugangsvoraussetzung KVdR.
- **§§ 226, 237 SGB V** — Beitragspflicht auf gesetzliche Rente und
  Versorgungsbezüge (KVdR).
- **§ 228 SGB V** — Beitragsbemessungsgrenze GKV (2026: 5 512,50 EUR/Monat).
- **§ 229 SGB V** — 1/120-Regel für Kapitalleistungen aus bAV.
- **§ 240 SGB V** — Freiwillige Mitgliedschaft; Beitrag auf gesamte
  wirtschaftliche Leistungsfähigkeit.
- **§ 241 SGB V** — Allgemeiner Beitragssatz GKV (14,6 %).
- **§ 249a SGB V** — Rentnerbeitragsteilung (je Hälfte Rentner / DRV).
- **§§ 55, 55a SGB XI** — Pflegeversicherungs-Beitragssatz 3,6 % + Kinder-
  Entlastung ab dem zweiten Kind (Reform 2024).
- **§ 68 SGB VI** — Rentenwertanpassungsformel.

### Authoritative publications

- **BMF** (Bundesministerium der Finanzen): *Programmablaufplan für die
  Berechnung der Lohnsteuer 2026* (BMF-Schreiben vom 19. November 2025).
- **DRV Bund**: *Rentenversicherung in Zahlen 2025/2026* — Rentenwert,
  Entgeltpunkte, BBG.
- **BMAS**: *Sozialversicherungs-Rechengrößen-Verordnung 2026* — BBG
  GKV/PV 5 512,50 EUR/Monat.
- **GKV-Spitzenverband**: *Beitragssatz-Übersicht 2026* — allgemeiner
  Beitragssatz, Zusatzbeitrag.
- **Statistisches Bundesamt (Destatis)**: *Sterbetafeln 2021/2023* —
  Lebenserwartungsannahmen.

## Must-include caveats

1. Visible "Stand: 2026-05-06" line — JSON-LD `dateModified` references it.
2. Not-advice disclaimer (`DisclaimerBanner`) at top of main; FAQ reiterates
   "Modellrechnung, keine Beratung".
3. Links to Impressum and Datenschutz in footer.
4. No "winner" framing — page describes mechanics and assumptions, not outcomes.
5. No commercial-license-only content.
6. Persona example (Anna) uses "Modellschätzung" caveat in the table.

## Visible page structure

1. H1 — "Rente netto berechnen — gesetzliche Rente nach Steuer und KV/PV 2026"
2. Lead summary from registry.
3. Stand line — "Stand: 2026-05-06 · Werte für Deutschland 2026".
4. CTA — "Rente netto jetzt berechnen" → `/?topic=rente-netto-berechnen`.
5. **Was bedeutet „Rente netto"?** — definition, three components.
6. **Besteuerung der gesetzlichen Rente: der Besteuerungsanteil** —
   §-22-Kohortenmodell; Versorgungsfreibetrag §19.
7. **KV-Beiträge: KVdR vs. freiwillige Mitgliedschaft** — §§226, 237, 240,
   241, 249a SGB V; Pflegeversicherung §§55, 55a SGB XI.
8. **Pauschbeträge** — Werbungskosten §9a Satz 1 Nr. 3 EStG; Sonderausgaben
   §10c EStG.
9. **Beispiel: Anna (Stand 2026)** — modellhafte Tabelle.
10. **Was der Rechner nicht berechnet** — Günstigerprüfung, Splitting,
    weitere Einkünfte, Rentenanpassungen.
11. **Häufige Fragen** — 4 Q&As.
12. **Quellen** — bullet list matching inline citations.
13. **Verwandte Seiten** — homepage + siblings.

## FAQ entries (visible, no FAQPage JSON-LD shipped)

- Ist die gesetzliche Rente vollständig steuerpflichtig?
- Zahle ich als Rentnerin KV auf meine gesamte Rente?
- Was ist der Unterschied zwischen KVdR und freiwilliger GKV?
- Was ändert sich durch das Rentenbonus-Reformgesetz 2026?

## SEO surfaces (driven by `publicRouteRegistry.ts`)

- `title`: "Rente netto berechnen — gesetzliche Rente nach Steuer und KV/PV 2026 | RentenWiki.de"
- `metaDescription`: "Gesetzliche Rente netto berechnen: Besteuerungsanteil §22 EStG (Kohorten), KVdR vs. freiwillige GKV §240 SGB V, Pflegeversicherung §55 SGB XI, Werbungskosten- und Sonderausgaben-Pauschbetrag. Modellrechnung Stand 2026."
- `jsonLdType`: `WebApplication`
- `preselection`: `{ mode: 'compare', visibleProducts: ['etf'] }`

## Related routes

- `/` — Startseite
- `/rentenluecke-rechner` — Rentenlücke berechnen
- `/altersvorsorgeprodukte-vergleichen` — Portfolio-Modus
