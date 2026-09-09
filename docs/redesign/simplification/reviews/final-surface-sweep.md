# Final surface sweep — RentenWiki.de

**Urteil: nicht bereit.** Vergleichs-Detailseiten verlieren den Vergleichskontext; eine reine Vergleichssitzung führt zu einem ungefragt vorausgefüllten persönlichen Plan. Hinzu kommen eine falsche Herkunftsangabe zur gesetzlichen Rente, Löschen ohne Rückgängig im alten Produkteingang und mobile Layoutfehler.

Geprüft am 09.09.2026 mit Playwright MCP gegen `http://localhost:5173/`, Arbeitsstand `d810ea5`. Keine Quelldateien geändert. Routeninventar aus `src/app/useRoute.ts` und `src/seo/publicRouteRegistry.ts`: **23 statische Pfade, zwei dynamische Routenmuster**, zusätzlich sechs neue Produkteditoren und die angeforderten Query-/Zustandsvarianten. Alle wurden besucht; nach abgeschlossenem Rendern war überall eine H1 vorhanden.

Navigation begann auf `/`; weitere Ziele wurden in-app oder mit `history.pushState` und `popstate` geöffnet. Frische Sitzungen verwendeten getrennte Browser-Kontexte ohne vorhandenen Storage. Der von „Link kopieren“ erzeugte Share-URL wurde aus der App-URL übernommen und vor dem App-Start in einem frischen Kontext auf dem Root-Dokument gesetzt, um den bekannten Vite-404 beim direkten Dokumentabruf zu vermeiden.

Konsole nach Navigation kontrolliert; Vite-HMR und React-DevTools-Info ausgenommen. Ergänzend wurden `pageerror`, fehlgeschlagene Requests und HTTP-Fehler aufgezeichnet; separate Kontexte hatten eigene Listener. **Keine unbehandelten JavaScript-Fehler und keine fehlgeschlagenen Asset-Requests.** Warnungen und Dokument-404 stehen unten. Mobile Prüfung jeweils mit `document.documentElement.scrollWidth > innerWidth` bei 390 und 320 px, Höhe 844 px. Die Breiten in der Tabelle sind die gemessenen Dokumentbreiten, kein Screenshot-Schätzwert.

## Oberflächen

`—` = keine neue Warnung/Fehlermeldung bzw. kein Befund. **L** kennzeichnet ausschließlich die bekannte lokale Dokument-404-Einschränkung; daraus folgt kein nachgewiesener Produktionsfehler. H1 ist in jeder Tabellenzeile vorhanden.

| Oberfläche / Zustand | Status | Konsole | Breite bei 390 / 320 px | Befund / Aktionen |
|---|---|---|---|---|
| `/`, frisch / Onboarding | OK | — | 390 / 320 | Beide Einstiegsaktionen; Onboarding → Plan |
| `/`, Plan mit sechs Verträgen | Problem | — | 390 / 320 | Speichern, Modale, Annahmen, Auswertungen, Export funktionieren; Kopie F8 |
| `/vergleich`, Auswahl 1 / 2 / 6 / 0 | Problem | — | 390 / 320 | Auswahl, Betrag, Annahmen, CSV, Share funktionieren; weiterführende Aktionen F1/F2 |
| `/vergleich/details`, mit Plan und frisch | Problem | — | 390 / 320 | F1: falscher Modus, Produktauswahl und Rückweg |
| `/vorsorge/neu` | OK | — | 390 / 320 | Alle sechs Auswahlaktionen, zurück zum Plan |
| `/vorsorge/neu?produkt=etf` | OK | — | 390 / 320 | Unbekannter Wert, 150 €/Monat; speichern/abbrechen/andere Sparform |
| `/vorsorge/neu?produkt=bav` | OK | — | 390 / 320 | 100 € Bruttobeitrag, Direktversicherung, 2020; speichern/abbrechen/wechseln |
| `/vorsorge/neu?produkt=versicherung` | OK | — | 390 / 320 | 150 €, 2015; Kosten/Auszahlung, speichern/abbrechen/wechseln |
| `/vorsorge/neu?produkt=basisrente` | OK | — | 390 / 320 | 100 €; Kosten/Auszahlung, speichern/abbrechen/wechseln |
| `/vorsorge/neu?produkt=riester` | OK | — | 390 / 320 | 100 €; Kosten/Auszahlung, speichern/abbrechen/wechseln |
| `/vorsorge/neu?produkt=altersvorsorgedepot` | OK | — | 390 / 320 | 100 €; Kosten/Auszahlung, speichern/abbrechen/wechseln |
| `/vertrag/etf-zvqz0skm` | Problem | F6 | **553 / 553** | Vertragsdaten und Rückweg funktionieren; F5/F6 |
| `/vertrag/:id/bearbeiten`, alle sechs realen Instanzen | OK | — | 390 / 320 | Speichern; ETF ändern, entfernen und rückgängig machen |
| `/alternativen`, leer | OK | — | 390 / 320 | Leere Vorschau validiert; Vertrag auswählen |
| `/alternativen`, Vorschau | OK | — | 390 / 320 | ETF-Beitrag ändern, berechnen, speichern/direkt übernehmen |
| `/alternativen`, gespeicherte Liste | OK | — | 390 / 320 | Wiederöffnen, entfernen und rückgängig machen |
| `/alternativen?id=whatif-958f9443-bf25-4a6d-9e57-343c081a78af` | OK | — | 390 / 320 | Übernehmen, Rückgängig, neue Änderung, zurück zum Plan |
| `/kapital` | Problem | F6 | **876 / 876** | Alle Produktfilter funktionieren; F2/F5/F6 |
| `/eingaben` | Problem | — | 390 / 320 | Weiter, Erläuterungen, JSON funktionieren; F7 |
| `/eingaben/produkte` | Problem | — | 390 / 320 | Bearbeiten, hinzufügen, zurück, speichern; F3/F4 |
| `/methode` | Problem | F6 | **423 / 393** | F5/F6/F7/F8 |
| `/artikel` | OK | — | 390 / 320 | Alle zehn Themenkarten öffnen |
| `/rentenluecke-rechner` | Problem | L | 390 / 320 | Artikel/CTA rendern; weiterführende Links L |
| `/bav-rechner` | Problem | L | 390 / **353** | F5; weiterführende Links L |
| `/etf-vs-bav` | Problem | L | 390 / **353** | F5/F8; weiterführende Links L |
| `/riester-rechner` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/altersvorsorgedepot-rechner` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/riester-vs-altersvorsorgedepot` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/basisrente-rechner` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/private-rentenversicherung-rechner` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/rente-netto-berechnen` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/altersvorsorgeprodukte-vergleichen` | Problem | L | 390 / 320 | Weiterführende Links L |
| `/impressum` | OK | — | 390 / 320 | Inhalt und Rückweg |
| `/datenschutz` | OK | — | 390 / 320 | Inhalt und Rückweg |
| `/404` | Problem | L | 390 / 320 | Recovery zur Startseite funktioniert; weiterführende Links L |
| `/?view=landing`, frischer Kontext | OK | — | 390 / 320 | Landing rendert ohne gespeicherten Plan |
| `/?topic=etf-vs-bav`, frischer Kontext | OK | — | 390 / 320 | Automatisch Vergleich mit ETF + bAV |
| `/?topic=riester-vs-altersvorsorgedepot`, frischer Kontext | OK | — | 390 / 320 | Automatisch Vergleich mit AVD + Riester |
| `/vergleich?s=…`, erzeugter Share-Link, frischer Kontext | OK | — | 390 / 320 | ETF + bAV, 200 €/Monat, 1.003 / 486 € reproduziert |

## Durchgespielte Abläufe

- Frisch: Alter **35**, Jahresbrutto **60.000 €**, Berufseinstieg **22** → Plan. Geschätzte gesetzliche Nettorente 879 € in heutiger Kaufkraft. Root-Reload erhält die Angaben.
- Alle sechs Verträge angelegt und **nach jedem Hinzufügen Root neu geladen**: jeder Vertrag blieb im Plan. Zusätzliche Teststände: bAV 5.000 €, private Versicherung 10.000 €, Basisrente/Riester je 5.000 €, AVD 0 €. ETF-Wert blieb zunächst ausdrücklich unbekannt; Gesamtresultat wurde entsprechend als offen behandelt.
- ETF auf **10.000 € Wert / 175 € Monatsbeitrag** geändert, gespeichert, nach Reload bestätigt. Entfernen im neuen Editor und Rückgängig stellen dieselben Daten wieder her. Alle anderen bestehenden Editoren ebenfalls geöffnet und gespeichert.
- Alternative ETF **250 statt 175 €**: Vorschau 2.221 → 2.409 € Gesamtrente in heutiger Kaufkraft; speichern, Reload, wiederöffnen, übernehmen, Rückgängig, Reload erfolgreich. Gespeicherte Alternative entfernen/wiederherstellen ebenfalls erfolgreich. Direkte Übernahme einer weiteren Vorschau mit 225 € überstand einen Reload; anschließend QA-Ausgangsstand wiederhergestellt.
- Vergleich mit **1, 2, allen sechs und 0 Produkten**: korrekte Kartenanzahl bzw. verständlicher Leerzustand; leere Auswahl bleibt nach Reload erhalten. Produktwahl, Betrag, Rendite und Detail-Aufklapper bedienbar.
- Browser zurück/vorwärts zwischen Plan, Editor und Alternativen erfolgreich. Mobile Navigation einschließlich Legal-Seiten, neue Editor-Abbruch-/Wechselaktionen, Profil-/Renten-/Wunschrentenmodale und Plan-Aufklapper geprüft. Beitragsanpassungsdialog geöffnet/geschlossen; dessen vollständiger Optimierungsablauf war nicht Teil dieser Kernjourneys.
- CSV-Export auf Vergleich und Plan ausgelöst: Download ohne Konsolenfehler. JSON-Downloads der Eingabeseiten ebenfalls. Auf `/` mit Plan und auf `/vergleich` ist `#print-report` vorhanden; **der tatsächliche erste DOM-Knoten ist die Disclaimer-SECTION** (`pr-disclaimer-top`) mit „Keine Anlage-, Steuer- oder Rechtsberatung“. Wie angefordert kein Urteil über den nativen Druckdialog.
- Interne Links der statischen Seiten wurden geklickt: 104 unterschiedliche Kombinationen aus Quellseite und Ziel, wiederholte identische Ziele je Seite zusammengefasst. Alle zehn Artikel-Teilen-Aktionen ausgelöst. Externe Spenden-/Kontaktaktionen nicht abgeschickt. Der destruktive Baseline-Neustart wurde bis zum Bestätigungsdialog geprüft und abgebrochen.

## Konkrete Probleme

### F1 — Vergleichsdetails verlieren Modus, Auswahl und Rückweg

1. Mit dem angelegten Plan `/vergleich` öffnen und „Wohin geht das Geld? Aufschlüsselung pro Produkt“ klicken.
2. `/vergleich/details?scenario=basis` zeigt **„Wohin geht das Geld — nur im Vergleichs-Modus“**, obwohl der Einstieg aus dem Vergleich kommt.
3. Gegenprobe in frischem Kontext: `/?topic=etf-vs-bav` → dieselbe Detailaktion. Die Übersicht hat zwei Produkte, die Detailseite zeigt **alle sechs**.
4. „← Zurück zum Vergleich“ klicken. Der Link führt nach **`/`**, nicht `/vergleich`. Dort erscheint ohne vorheriges Onboarding „Deine Rente im Überblick“ mit sechs angenommenen Verträgen und **4.568 € Gesamt**, unter anderem ETF/private Rente mit 0 €.

**Konsole:** keine neue Meldung. Funktionaler Kontext-/Navigationsfehler; die Annahme eines persönlichen Plans erfolgt für den Nutzer überraschend.

### F2 — „Kapital im Verlauf“ aus dem Vergleich zeigt den persönlichen Plan

1. QA-Plan mit ETF 10.000 € / 175 € Monatsbeitrag verwenden; im Vergleich 200 € gemeinsamen Nettoaufwand einstellen.
2. Im Vergleich „Kapital im Verlauf“ klicken, dann ETF filtern.
3. Ziel zeigt **„MEIN PLAN“**, 67.200 € eingezahlt und 195.628 € Kapital mit 67. Die Einzahlung entspricht **175 × 12 × 32**, obwohl der gestartete Vergleich 200 €/Monat verwendet. Damit wechselt die Datengrundlage ohne passenden Hinweis/Rückweg.

**Konsole:** Recharts-Warnung aus F6; kein JavaScript-Fehler.

### F3 — Geschätzte GRV wird als aus einem DRV-Dokument übernommen bezeichnet

1. Frisch nur das Onboarding mit 35 / 60.000 / Berufseinstieg 22 durchführen; kein Dokument hochladen.
2. `/eingaben/produkte` öffnen und die gesetzliche Rente ansehen.
3. Sichtbar sind **„Werte aus deiner DRV-Rentenauskunft übernommen“**, die Kennzeichnung **„übernommen“**, „Rentenauskunft der Deutschen Rentenversicherung“ sowie „Anpassung der Werte überschreibt die Annahme aus der DRV-PDF“.

**Konsole:** keine neue Meldung. Die angegebene Herkunft ist für diesen rein geschätzten Datensatz falsch.

### F4 — Entfernen im alten Produkteingang bietet kein Rückgängig

1. Plan mit ETF neu laden, damit kein alter Undo-Hinweis mehr aktiv ist.
2. `/eingaben/produkte` öffnen; beim ETF „Entfernen“ klicken.
3. ETF verschwindet unmittelbar. Weder dort noch nach „Speichern“/Rückkehr zum Plan gibt es einen Rückgängig-Button oder Statushinweis. Kontrollmessung: ETF-Anzahl 0, Undo-Buttons jeweils 0.

**Konsole:** keine neue Meldung. Im neuen Vertragseditor funktioniert derselbe Entfernen-/Undo-Ablauf; diese alternative Oberfläche fällt dahinter zurück.

### F5 — Horizontaler Seitenüberlauf auf fünf Oberflächen

1. Root laden, jeweiliges Ziel in-app öffnen und auf 390 bzw. 320 px verkleinern.
2. `document.documentElement.scrollWidth > innerWidth` auswerten: **true** bei Vertragsdetail, Kapital und Methode in beiden Breiten; bei bAV-Artikel und ETF-vs-bAV in 320 px.
3. Exakte Werte siehe Tabelle: **553**, **876**, **423/393**, **353**, **353 px**. Im ETF-Vertragsdetail trägt die über den Rand ragende `table.sr-only` „Gebühren-Vergleich (Zusammenfassung)“ zum Überlauf bei.

**Konsole:** Vertragsdetail/Kapital/Methode zusätzlich F6; beide Artikel ohne neue Meldung beim SPA-Aufruf.

### F6 — Recharts warnt beim Öffnen von Diagrammseiten

Root laden, ETF-Vertragsdetail, `/kapital` oder `/methode` in-app öffnen und Konsole lesen. Im Test typischerweise zweimal pro Mount; Diagramme erscheinen anschließend, kein belegter Absturz.

**Konsolentext** (`node_modules/.vite/deps/recharts.js?v=666714fc:6476`):

```text
The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width.
```

### F7 — Widersprüchliche Annahmen-/Förderungstexte

1. `/eingaben`, Abschnitt 2: **„Voll steuer- und SV-frei bis ca. 676 €/Monat“**. Die eigenen Methoden-/bAV-Texte unterscheiden dagegen 676 € Steuergrenze und 338 € SV-Grenze. Das ist bereits innerhalb der Anwendung widersprüchlich; keine neue Rechtsprüfung erforderlich, um den Kopierfehler festzustellen.
2. `/eingaben`, Abschnitt 4, nennt die Renditen **„real p.a.“**; `/methode` spricht von **„reale langfristige Renditen“**. Die Ergebnisoberflächen unterscheiden nominale Ergebnisse und heutige Kaufkraft, und die Akkumulation diskontiert mit Inflation (`src/engine/accumulation.ts`). Die Terminologie erklärt dieselbe Renditeannahme damit widersprüchlich.

**Konsole:** Eingaben ohne neue Meldung; Methode zusätzlich F6. Keine umfassende steuerliche oder mathematische Validierung Bestandteil dieses Sweeps.

### F8 — Englische Resttexte und doppelte Währungseinheiten

- `/etf-vs-bav` lesen: sichtbare Abschnittseinleitung **„Caveats:“**.
- `/methode` lesen: **„Lump-Sum-Auszahlung“**, **„Spreading auf 120 Monate“**.
- Plan → „Annahmen & Risiko“ → 2026-Regeln aufklappen: **„42,52 € EUR/EP“**, **„1.000 € EUR/Jahr“**.

**Konsole:** nur Methode mit F6. Kein sichtbares `undefined`, `NaN` oder wörtliches `€ €` gefunden. Keine öffentliche Markenregression zu „Rentenrechner“ gefunden; `PeterHartwieg/Rentenrechner` im Datenschutz ist der tatsächliche Repository-Identifier. Der Sprachwähler „English“ ist kein versehentlich unübersetzter Inhalt.

### L — Weiterführende Artikel-Links lösen im bekannten Vite-Setup Dokument-404 aus

1. `/` → „Artikel“ → „Rentenlücke berechnen“ öffnen; diese Navigation funktioniert.
2. Im Artikel den weiterführenden Textlink **„bAV Rechner“** klicken.
3. Statt SPA-Navigation erfolgt ein Dokumentabruf von `/bav-rechner/`, der lokal HTTP 404 liefert. Entsprechend bei weiteren Body-/Related-Links aller zehn Themen und Links der 404-Seite: **37 unterschiedliche Quellseite/Ziel-Kombinationen** im statischen Linkdurchlauf betroffen.

**Konsole:**

```text
Failed to load resource: the server responded with a status of 404 ()
```

Requestfehler: `net::ERR_HTTP_RESPONSE_CODE_FAILURE`. Dies sind **HTML-Dokumente, keine Assets**. Die Zieloberflächen wurden anschließend separat per SPA-Navigation vollständig geprüft. Wegen der ausdrücklich bekannten Devserver-Einschränkung ist dies **kein Nachweis für defekte Links auf dem Produktionshost**; die betreffenden Vollnavigationen benötigen dort einen eigenen Hosting-Smoke-Test.

## Schlussurteil

**Nicht bereit.** Die vollständige Routenabdeckung und erfolgreichen Speichern-/Persistenz-/Alternativen-/Export-Abläufe reichen angesichts F1–F4 nicht für eine Freigabe. Vergleichskontext, Herkunftskennzeichnung und Wiederherstellbarkeit müssen stimmen; F5–F8 verhindern zusätzlich das geforderte fehlerfreie Oberflächenbild. L bleibt ein separat ausgewiesener Testumgebungsbefund. Es wurden keine Fehler behoben.
