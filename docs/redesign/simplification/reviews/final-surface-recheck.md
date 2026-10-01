# Final surface re-check — RentenWiki.de

**Urteil: nicht bereit.** F3 enthält weiterhin eine falsche Herkunftsangabe im Seitenfuß; F5 zeigt noch horizontalen Überlauf auf zwei Oberflächen bei 320 px. Die übrigen angeforderten Re-Checks bestehen. Der vollständige Smoke erzeugte keine Konsolenwarnungen, Konsolenfehler oder unbehandelten JavaScript-Fehler.

Geprüft am **09.09.2026**, gegen `http://localhost:5173/`, HEAD **`ddfc203`**, mit **Playwright MCP**. Grundlage: F1–F8 aus `final-surface-sweep.md`. Keine Quelldateien geändert; dieser Bericht ist die einzige bewusst geschriebene Datei. Bereits vorhandene Arbeitsbaumänderungen wurden nicht verändert. Playwright erzeugt eigene Tool-Protokolle automatisch.

Die Prüfung begann auf `/`. Für F1 wurde ein neuer Browser-Kontext ohne vorhandene Cookies, localStorage oder sessionStorage angelegt; `/?topic=etf-vs-bav` wurde vor dem App-Start per History auf dem Root-Dokument gesetzt. Weitere Navigationen erfolgten in-app oder über `history.pushState` + `popstate`. Keine direkten Dokumentabrufe anderer Pfade; die bekannte lokale Vite-404-Einschränkung wurde nicht erneut bewertet. Desktop: 1280 × 900; mobil: 390 bzw. 320 × 844 CSS-px. Messungen nach Rendern und Größenanpassung.

## Ergebnisse

| Befund | Status | Beobachtete Evidenz |
|---|---|---|
| **F1a** — Vergleich erzeugt ungefragt einen Plan | **FIXED** | Frischer Kontext → Topic-Einstieg → `/vergleich` → „Wohin geht das Geld?“ → „← Zurück zum Vergleich“ → „Mein Plan“. Rückweg zunächst tatsächlich `/vergleich`; anschließend `/` mit **„Dein Plan beginnt hier.“** und „Zwei kurze Schritte. Bestehende Verträge sind optional.“ Keine Vertragskarten und kein Gesamtbetrag. |
| **F1b** — Auswahl und Rückweg der Details | **FIXED** | `/vergleich/details?scenario=basis` zeigt genau zwei Produktüberschriften: **„ETF-Depot“** und **„Betriebliche Altersvorsorge (bAV)“**, zusätzlich die H1 „Wohin geht jeder Euro?“. Kicker **„VERGLEICH › WOHIN GEHT DAS GELD“**. Back-Link hat `href="/vergleich"`; nach Klick ist die URL `/vergleich`. Sowohl frisch als auch nochmals mit vorhandenem Plan geprüft. |
| **F2** — Kapitalansicht verliert Vergleichskontext | **FIXED** | Nach Onboarding **35 / 60000 / 22**, ETF **10000 / 175** und ausdrücklich gesetztem Vergleichsbudget **200** führt „Kapital im Verlauf“ nach **`/kapital?quelle=vergleich`**. Kicker **„VERGLEICH › VERLAUF 35 → 100“**, Rücklink und tatsächlich geklickter Rückweg `/vergleich`. Filter: alle Produkte, ETF und bAV. ETF-Auswahl zeigt mit 67 **174.770 € Kapital / 76.799 € eingezahlt**, statt der Planwerte **195.628 € / 67.200 €**. Die beobachteten Vergleichswerte werden hier unverändert wiedergegeben; keine zusätzliche mathematische Validierung. |
| **F3** — Berufsschätzung als DRV-Übernahme bezeichnet | **STILL OPEN** | Auf `/eingaben/produkte` ist die Rentenkarte korrigiert: **„GROB AUS BERUFSSTART GESCHÄTZT“**, „Grundlage sind deine Angaben oder Modellannahmen“ und „Änderungen ersetzen die bisher verwendeten Angaben oder Annahmen zur gesetzlichen Rente.“ Keine „PDF“- oder „übernommen“-Formulierung mehr. **Im sichtbaren Seitenfuß steht aber weiterhin `[3] GRV-Werte: DRV-Renteninformation`**, obwohl ausschließlich über den Berufsstart geschätzt wurde. Diese verbleibende Quellenbehauptung verhindert ein vollständiges FIXED. „DRV · SCHICHT 1 · PFLICHT“ und der allgemeine Unterlagenhinweis „DRV-RENTENAUSKUNFT“ sind ebenfalls vorhanden, behaupten für sich genommen jedoch keinen Import. |
| **F4** — Entfernen ohne Rückgängig im Produkteingang | **FIXED** | Nach Entfernen auf `/eingaben/produkte`: **`role=status`: „Vertrag entferntRückgängig“**, genau **1 Rückgängig-Button**, „0 Verträge erfasst“. Rückgängig stellt **1 Vertrag**, ETF **175 €/Mon.**, wieder her. Zweite Entfernung → „Mein Plan“: derselbe Status, ETF fehlt, Gesamt **879 €**. Rückgängig im Plan stellt ETF und **1.465 € Gesamt** wieder her. Anschließend im Editor beide Eingabewerte bestätigt: **10000 / 175**. |
| **F5** — Mobiler Seitenüberlauf | **STILL OPEN** | Bei 390 px passen alle fünf Seiten. Bei 320 px bleiben **374 px** im Vertragsdetail und **371 px** auf `/methode`. Vollständige Messwerte unten; beide verbleibenden Überläufe bei erneutem Mount reproduziert. |
| **F6** — Recharts `width(-1)` | **FIXED** | Nach Mount von `/vertrag/etf-0ccqpprt`, `/kapital` und `/methode` sind Diagramm-SVGs vorhanden. Jeweils **0 Warnungen, 0 Konsolenfehler, 0 pageerrors**; insbesondere kein **„width(-1)“**. Auch nach mobilen Größenwechseln keine Warnung. |
| **F7** — Grenzen und Renditewortlaut | **FIXED** für die angeforderten Abschnitte | `/eingaben`, § 2: **„Steuerfrei bis 676 €/Monat (§ 3 Nr. 63 EStG); SV-frei bis 338 €/Monat (§ 1 SvEV). Beide Grenzen gelten für den Gesamtbeitrag einschließlich Arbeitgeberzuschuss.“** § 4: **„Die Renditen sind nominale Modellannahmen. Die heutige Kaufkraft wird separat mit der Inflationsrate berechnet.“** Alle drei Szenarien mit **„nominal p.a.“** und „Modellannahme vor Inflation“. `/methode` ebenfalls **„nominale, langfristige Renditeannahmen p. a.“** mit separater Kaufkraftberechnung. |
| **F8** — Englische Resttexte / doppelte Währung | **FIXED** | Auf `/etf-vs-bav`, `/methode` und im geöffneten Planbereich **„Annahmen & Risiko“**, einschließlich aufgeklappter **„Regelwerte & Quellen 2026“**, keine Treffer für `Caveats:`, `Lump-Sum`, `Spreading` oder `€\s*EUR`. Beobachtete Ersatztexte: **„Einschränkungen:“**, **„Einmalige Kapitalauszahlung“**, **„Verteilung auf 120 Monate“**, **„42,52 € pro Entgeltpunkt (ab 1.7.2026)“**, **„1.000 € pro Jahr“**. |

## F5 — gemessene Breiten

Messausdruck: `document.documentElement.scrollWidth`. `innerWidth` und `document.documentElement.clientWidth` entsprachen jeweils 390 bzw. 320; `document.body.scrollWidth` entsprach in jeder Messung der angegebenen Dokumentbreite.

| Oberfläche | scrollWidth bei 390 | scrollWidth bei 320 | Überlauf |
|---|---:|---:|---|
| `/vertrag/etf-0ccqpprt` | 390 | **374** | 54 px bei 320 |
| `/kapital` — vorhandener Plan | 390 | 320 | keiner |
| `/methode` | 390 | **371** | 51 px bei 320 |
| `/bav-rechner` | 390 | 320 | keiner |
| `/etf-vs-bav` | 390 | 320 | keiner |

Zusätzliche DOM-Evidenz auf `/methode` bei 320 px: `sup.methode-footnote-ref` mit Text **`[9]`** liegt bei `left=349.828125`, `right=370.59375`. Für das Vertragsdetail wird hier keine ungesicherte Ursache aus einzelnen Kind-Bounding-Boxes abgeleitet; maßgeblich ist der reproduzierte Dokumentüberlauf von 374 px.

## Vollständiger Smoke und Konsole nach jedem Schritt

Durchgehender Ablauf im neu angelegten Kontext, anschließend an F1. Konsolenpuffer und `pageErrors()` wurden **nach jeder unten aufgeführten Aktion** ausgelesen.

| Schritt | Sichtbares Ergebnis | Warnungen / Fehler / pageerrors |
|---|---|---|
| Onboarding: 35 Jahre / 60.000 € / Berufseinstieg 22 | Plan, gesetzliche Rente **879 €**, „Grob aus Berufsstart geschätzt“ | 0 / 0 / 0 |
| ETF hinzufügen: 10.000 € / 175 € monatlich | „Vertrag hinzugefügt“, ETF **586 €**, Gesamt **1.465 €**, heutige Euro | 0 / 0 / 0 |
| Alternative als Vorschau: 250 statt 175 € | Vorher **1.465 €**, danach **1.653 €**, Änderung **+188 €/Monat** | 0 / 0 / 0 |
| Alternative speichern | „Gespeicherte Alternative“, „ETF-Depot: 250 € Beitrag / Monat“, URL mit `?id=whatif-…` | 0 / 0 / 0 |
| Beitrag in Plan übernehmen | „Alternative übernommen“, Sparrate **250 €**, Gesamt **1.653 €** | 0 / 0 / 0 |
| Rückgängig | Sparrate wieder **175 €**, Gesamt wieder **1.465 €**, gespeicherte Alternative bleibt vorhanden | 0 / 0 / 0 |
| Vergleich öffnen | `/vergleich`, **200 €** eigener Monatsaufwand; ETF **1.003 €**, bAV **486 €**, nominale Auszahlungen | 0 / 0 / 0 |

**Neue Laufzeitfehler: keine.** Auch die weiteren F1–F8-Prüfungen lieferten keine Browser-Konsolenwarnung oder Fehlermeldung. Die einzigen Konsolenzeilen waren die üblichen Entwicklungsinformationen:

```text
[debug] [vite] connecting...
[debug] [vite] connected.
[info] Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
```

Einzelne zunächst falsch gewählte Playwright-Rollen-Selektoren liefen in Tool-Timeouts und wurden mit dem passenden sichtbaren Element wiederholt. Das waren Automationsfehler, keine App-Konsolenfehler; alle angeforderten Abläufe wurden anschließend abgeschlossen.

## Weitere beobachtete Textreste

- Die unter F3 belegte falsche DRV-Quellenzeile erscheint auch im leeren Plan, im geschätzten Plan und auf Detailseiten. Sie ist kein neu eingeführter Laufzeitfehler, aber ein noch sichtbarer Rest desselben Herkunftsproblems.
- Außerhalb der gezielt geprüften §-4-Haupttexte steht in der rechten Erläuterung von `/eingaben` weiterhin **„Basis = realer Median“**. Die angeforderten Szenariobezeichnungen sind korrigiert; dieser zusätzliche Herkunfts-/Renditewortlaut sollte noch mit der nominalen Erklärung abgestimmt werden. Keine neue Quellen- oder Rechtsprüfung durchgeführt.

**Schlussurteil für die geprüften Oberflächen: nicht bereit.** Die funktionalen Vergleichs- und Undo-Fixes bestehen den Re-Check; vor Freigabe bleiben F3 und die beiden 320-px-Überläufe aus F5 zu beheben.
