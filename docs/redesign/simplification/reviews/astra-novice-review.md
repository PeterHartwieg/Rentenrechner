
Getestet ausschließlich mit Playwright über Accessibility-Snapshots, Klicks, Eingaben und Scrollen. Vor dem Einstieg wurden die Browser-Speicher geleert und die Seite neu geladen. Für den Telefondurchlauf wurde erneut geleert und das Fenster mit dem Resize-Werkzeug auf **390 × 844** gestellt.

**1. Erste Rentenschätzung ohne Unterlagen — geschafft**

Ich erreiche **879 €**, beschriftet mit „Geschätzt aus deinen Angaben“, „Gesamt · netto pro Monat ab 67“ und „In heutigen Euro“.

Der Einstieg ist verständlich. „Ohne Unterlagen grob schätzen“ ist bereits ausgewählt. „Ungefähr reicht. Eine bezahlte Ausbildung kannst du als Start nehmen“ nimmt mir die Unsicherheit beim Arbeitsbeginn.

Etwas verwirrend: Neben zunächst leeren Feldern steht schon „Angenommen“, gleichzeitig darunter „Bitte eintragen“. Ich weiß nicht, was dort bereits angenommen wurde.

Reproduktion: „Meine Rente einschätzen“ → Alter **35**, Jahreseinkommen **60000** → vorausgewählte Angaben „Angestellt“ und „Gesetzlich“ belassen → „Weiter“ → „Ohne Unterlagen grob schätzen“ → Arbeitsbeginn **22** → „Meinen Plan ansehen“.

**2. ETF mit unbekanntem Depotwert und 150 € Sparrate — geschafft**

Das Depot wird hinzugefügt. Die Möglichkeit „Weiß ich nicht“ ist leicht verständlich.

Überraschend verschwindet danach meine erste Schätzung: Oben steht **„Noch offen“**, und auch die gesetzliche Rente zeigt **„—“** statt vorher 879 €. Der Hinweis „Aktueller Wert von „ETF-Depot" ist unbekannt.“ erklärt die fehlende Gesamtsumme. Warum auch die schon geschätzte gesetzliche Rente verschwindet, verstehe ich nicht.

Reproduktion: Im Plan „Vorsorge ergänzen“ → „ETF-Depot“ → bei „Aktueller Wert (€)“ das Kästchen „Weiß ich nicht“ wählen → „Monatliche Sparrate (€)“ **150** → „Zum Plan hinzufügen“.

**3. Große Zahl und lebenslange Auszahlung verstehen — geschafft, mit Einschränkung**

In meinen Worten: Die Zahl soll zeigen, wie viel ich aus meinen eingetragenen Rentenquellen zusammen monatlich ab 67 bekomme, nach Steuern und Krankenversicherung. „In heutigen Euro“ verstehe ich als heutige Kaufkraft.

Die gesamte Auszahlung gilt **nicht automatisch lebenslang**. Bei der gesetzlichen Rente steht „Lebenslang“. Beim ETF steht „Entnahme geplant bis Alter 90 · gemeinsame Annahme“ und „Danach fällt dieser Teil weg“.

Das wird unter „Dauer ansehen →“ ausdrücklich bestätigt: **„Der Gesamtbetrag gilt nicht automatisch ein Leben lang.“**

Die Einschränkung: Nach Aufgabe 2 gibt es überhaupt keine große Zahl mehr, sondern „Noch offen“.

Reproduktion: Plan nach dem ETF-Hinzufügen ansehen → Beschriftungen unter dem Ergebnis lesen → „Dauer ansehen →“ → dort gesetzliche Rente und ETF gegenüberstellen.

**4. Kosten und Annahmen herausfinden — teilweise geschafft**

Ich finde konkrete Angaben:

- **5 % Rendite und 2 % Inflation**; außerdem die Auswahl „Konservativ 3 %“, „Basis 5 %“, „Optimistisch 7 %“.
- Beim ETF **0,2 % laufende Fondskosten pro Jahr**, als „Angenommen“ gekennzeichnet.
- **0 % Beitragsdynamik**, Vertragsbeginn **2026** und Entnahme bis **90** als voreingestellte Angaben.
- Erläuterungen zu Steuern, Kranken- und Pflegeversicherung.

Hilfreich ist: „Nicht bestätigte Kosten sind Annahmen. Die angezeigten Werte werden vorläufig für die Berechnung verwendet.“

Ich kann aber nicht sicher erklären, wie alles zusammenwirkt. Unter „Annahmen & Risiko“ begegnen mir „MC 1000x | Vol 15 %“, „Lohnsteuer-Engine“, „proportionale Gain-Ratio statt FIFO-Losprinzip“ und viele Gesetzesverweise. Das überfordert mich als Anfängerin.

Zusätzlich verwirrt die ETF-Detailseite: Trotz unbekanntem Depotwert stehen dort **763 € „Netto-Rente“**, in der Tabelle bei „Weiterführen“ aber **2.419 € „Netto-Rente“**. Im Plan steht gleichzeitig „Noch offen“. Der Hinweis auf vorläufige Modellwerte erklärt mir diese unterschiedlichen Beträge nicht ausreichend.

Reproduktion: 

- Plan → „Annahmen & Risiko“ öffnen.
- Plan → „Angaben & Annahmen prüfen“ → „Weitere Annahmen & Rechenweg“.
- Plan → „ETF-Depot bearbeiten“ → Kennzahlen und Tabelle „Was wäre, wenn du diesen Vertrag anders führst?“ vergleichen.
- Dort „Angaben bearbeiten“ → „Kosten & Auszahlung“ → „Wo finde ich die Kosten?“.

**5. 250 € ausprobieren, speichern, zurückkehren und übernehmen — teilweise geschafft**

Speichern, Wiederfinden und Übernehmen gelingen. Den **finanziellen Effekt** kann ich nicht erkennen: Unter „Bisher“ und „Danach“ steht jeweils „Noch offen“. Nur die Beiträge **150 € → 250 €** sind sichtbar.

Nach dem Übernehmen erscheinen gleichzeitig:

- „Änderung in den Plan übernommen.“
- „Dein Plan hat sich seit dem Speichern geändert.“
- „Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.“

Dadurch bin ich unsicher, ob ich fertig bin. Die anschließende Kontrolle auf der ETF-Detailseite bestätigt jedoch **250 € Beitrag pro Monat**.

Reproduktion: „Änderung ausprobieren“ → „Neuer monatlicher Beitrag in €“ auf **250** setzen → „Vorher und nachher ansehen“ → „Alternative speichern“ → „Zurück zum Plan“ → „Gespeicherte Alternativen (1)“ → bei „ETF-Depot: 250 € Beitrag / Monat“ auf „Vorher und nachher öffnen“ → „Beitrag in meinen Plan übernehmen“.

Beim Wiederöffnen steht vor der Übernahme weiterhin „Bisher: 150 € / Monat“; der ursprüngliche Plan war also erhalten geblieben.

**6. ETF entfernen und wiederherstellen — geschafft**

„Vorsorge entfernt“ und „„ETF-Depot“ entfernt.“ bestätigen das Entfernen eindeutig. „Rückgängig“ stellt das Depot mit **250 € Sparrate** und weiterhin unbekanntem aktuellem Wert wieder her.

Der Weg zum Entfernen ist etwas länger als erwartet: „ETF-Depot bearbeiten“ führt zunächst zu einer Detailseite; erst „Angaben bearbeiten“ öffnet das eigentliche Formular.

Reproduktion: Plan → „ETF-Depot bearbeiten“ → „Angaben bearbeiten“ → „Vorsorge entfernen“ → „Rückgängig“.

**7. ETF und Betriebsrente mit jeweils 200 € eigenem Geld vergleichen — geschafft**

Unter „Vergleich“ erscheinen bereits die passenden Sparformen und der Text **„Je 200 € aus deinem eigenen Geld im Monat.“**

Angezeigt werden:

| Sparform | Geschätzte monatliche Nettoauszahlung | Dauer |
|---|---:|---|
| ETF-Depot | 1.003 € | Bis Alter 90 |
| Betriebliche Altersvorsorge | 486 € | Lebenslang |

„Gezeigt wird die Auszahlung je Sparform ab 67, keine Gesamtrente“ hilft mir sehr.

Verwirrend bleibt der Wechsel der Geldbetrachtung: Hier steht **„Beträge zum Rentenbeginn (nominal)“**, im Plan „In heutigen Euro“. Ich kann die Zahlen deshalb nicht einfach mit meinem Plan vergleichen. Bei der Betriebsrente steht unter den Annahmen außerdem „Weitere Einkünfte im Ruhestand: 0 € / Monat“, obwohl ich zuvor eine gesetzliche Rente geschätzt habe.

Reproduktion: „Vergleich“ → bei beiden Produkten „Annahmen ansehen“ → „Auswahl oder Betrag ändern“ → ausgewählte Produkte und **200 €** kontrollieren → „Vergleich ansehen“.

**8. Wiederholung am Telefon — insgesamt teilweise geschafft**

**Aufgabe 1: geschafft.** Derselbe Einstieg mit 35, 60000 und Arbeitsbeginn 22 ergibt erneut **879 €**. Die Eingaben und die Schaltflächen „Weiter“ und „Meinen Plan ansehen“ lassen sich bedienen. Die anfängliche Beschriftung leerer Felder mit „Angenommen“ bleibt irritierend.

**Aufgabe 3: geschafft.** Die Ergebnisbeschriftung ist lesbar. Für die Wiederholung von Aufgabe 5 ergänze ich wieder den ETF mit unbekanntem Wert und 150 €. Danach erscheint erneut „Noch offen“. Nach Scrollen führt „Dauer ansehen →“ zur verständlichen Erklärung der unterschiedlichen Laufzeiten.

**Aufgabe 5: teilweise geschafft.** Speichern, Rückkehr, Wiederfinden und Übernehmen funktionieren auch hier. Zweimal „Noch offen“ verhindert wieder den Vergleich der Rentenhöhe. Nach der Übernahme erscheinen dieselben widersprüchlichen Texte. Beim erneuten Öffnen von „Änderung ausprobieren“ bestätigt **„Bisher: 250 € / Monat“** die erfolgreiche Änderung.

Reproduktion: Fenster auf **390 × 844** → Speicher leeren und Startseite neu laden → Schritte aus Aufgabe 1 und 2 wiederholen → im Plan nach unten zu „Änderung ausprobieren“ scrollen → **250** eingeben → „Vorher und nachher ansehen“ → nach unten zu „Alternative speichern“ scrollen → über die untere Navigation „Mein Plan“ zurückkehren → zu „Gespeicherte Alternativen (1)“ scrollen → Alternative öffnen → nach unten zur Übernahme scrollen.

Auf dem Telefon muss ich Ergebnis, Aktionen und gespeicherte Alternativen häufiger durch Scrollen zusammensuchen. Eine zusätzliche Bedienblockade habe ich auf diesen Wegen nicht erlebt.

**Die drei größten Probleme aus meiner Sicht**

1. **Eine unbekannte ETF-Angabe nimmt mir den bisherigen Überblick.** Meine gesetzliche Rentenschätzung verschwindet mit; auch der Nutzen einer höheren Sparrate bleibt unsichtbar.
2. **Zahlen und Bestätigungstexte passen für mich nicht eindeutig zusammen.** „Noch offen“, 763 € und 2.419 € stehen auf verschiedenen Ansichten; nach der Übernahme klingt ein Teil der Texte weiterhin nach einer ausstehenden Aktion.
3. **Die Erklärung wird schnell zu fachlich.** Kosten sind auffindbar, aber Begriffe wie „TER“, „MC 1000x“, „Gain-Ratio“ und „nominal“ erschweren mir die Einordnung.

**Was gut funktioniert hat**

Der kurze Einstieg ohne Unterlagen, „Ungefähr reicht“ und „Weiß ich nicht“ erleichtern den Anfang. Die Auszahlungsdauer wird ausdrücklich erklärt. Gespeicherte Alternativen sind über einen eigenen Button wiederzufinden. Entfernen und „Rückgängig“ funktionieren eindeutig. Besonders verständlich ist im Vergleich die Formulierung **„Je 200 € aus deinem eigenen Geld im Monat.“**
tokens used
134.378
Getestet ausschließlich mit Playwright über Accessibility-Snapshots, Klicks, Eingaben und Scrollen. Vor dem Einstieg wurden die Browser-Speicher geleert und die Seite neu geladen. Für den Telefondurchlauf wurde erneut geleert und das Fenster mit dem Resize-Werkzeug auf **390 × 844** gestellt.

**1. Erste Rentenschätzung ohne Unterlagen — geschafft**

Ich erreiche **879 €**, beschriftet mit „Geschätzt aus deinen Angaben“, „Gesamt · netto pro Monat ab 67“ und „In heutigen Euro“.

Der Einstieg ist verständlich. „Ohne Unterlagen grob schätzen“ ist bereits ausgewählt. „Ungefähr reicht. Eine bezahlte Ausbildung kannst du als Start nehmen“ nimmt mir die Unsicherheit beim Arbeitsbeginn.

Etwas verwirrend: Neben zunächst leeren Feldern steht schon „Angenommen“, gleichzeitig darunter „Bitte eintragen“. Ich weiß nicht, was dort bereits angenommen wurde.

Reproduktion: „Meine Rente einschätzen“ → Alter **35**, Jahreseinkommen **60000** → vorausgewählte Angaben „Angestellt“ und „Gesetzlich“ belassen → „Weiter“ → „Ohne Unterlagen grob schätzen“ → Arbeitsbeginn **22** → „Meinen Plan ansehen“.

**2. ETF mit unbekanntem Depotwert und 150 € Sparrate — geschafft**

Das Depot wird hinzugefügt. Die Möglichkeit „Weiß ich nicht“ ist leicht verständlich.

Überraschend verschwindet danach meine erste Schätzung: Oben steht **„Noch offen“**, und auch die gesetzliche Rente zeigt **„—“** statt vorher 879 €. Der Hinweis „Aktueller Wert von „ETF-Depot" ist unbekannt.“ erklärt die fehlende Gesamtsumme. Warum auch die schon geschätzte gesetzliche Rente verschwindet, verstehe ich nicht.

Reproduktion: Im Plan „Vorsorge ergänzen“ → „ETF-Depot“ → bei „Aktueller Wert (€)“ das Kästchen „Weiß ich nicht“ wählen → „Monatliche Sparrate (€)“ **150** → „Zum Plan hinzufügen“.

**3. Große Zahl und lebenslange Auszahlung verstehen — geschafft, mit Einschränkung**

In meinen Worten: Die Zahl soll zeigen, wie viel ich aus meinen eingetragenen Rentenquellen zusammen monatlich ab 67 bekomme, nach Steuern und Krankenversicherung. „In heutigen Euro“ verstehe ich als heutige Kaufkraft.

Die gesamte Auszahlung gilt **nicht automatisch lebenslang**. Bei der gesetzlichen Rente steht „Lebenslang“. Beim ETF steht „Entnahme geplant bis Alter 90 · gemeinsame Annahme“ und „Danach fällt dieser Teil weg“.

Das wird unter „Dauer ansehen →“ ausdrücklich bestätigt: **„Der Gesamtbetrag gilt nicht automatisch ein Leben lang.“**

Die Einschränkung: Nach Aufgabe 2 gibt es überhaupt keine große Zahl mehr, sondern „Noch offen“.

Reproduktion: Plan nach dem ETF-Hinzufügen ansehen → Beschriftungen unter dem Ergebnis lesen → „Dauer ansehen →“ → dort gesetzliche Rente und ETF gegenüberstellen.

**4. Kosten und Annahmen herausfinden — teilweise geschafft**

Ich finde konkrete Angaben:

- **5 % Rendite und 2 % Inflation**; außerdem die Auswahl „Konservativ 3 %“, „Basis 5 %“, „Optimistisch 7 %“.
- Beim ETF **0,2 % laufende Fondskosten pro Jahr**, als „Angenommen“ gekennzeichnet.
- **0 % Beitragsdynamik**, Vertragsbeginn **2026** und Entnahme bis **90** als voreingestellte Angaben.
- Erläuterungen zu Steuern, Kranken- und Pflegeversicherung.

Hilfreich ist: „Nicht bestätigte Kosten sind Annahmen. Die angezeigten Werte werden vorläufig für die Berechnung verwendet.“

Ich kann aber nicht sicher erklären, wie alles zusammenwirkt. Unter „Annahmen & Risiko“ begegnen mir „MC 1000x | Vol 15 %“, „Lohnsteuer-Engine“, „proportionale Gain-Ratio statt FIFO-Losprinzip“ und viele Gesetzesverweise. Das überfordert mich als Anfängerin.

Zusätzlich verwirrt die ETF-Detailseite: Trotz unbekanntem Depotwert stehen dort **763 € „Netto-Rente“**, in der Tabelle bei „Weiterführen“ aber **2.419 € „Netto-Rente“**. Im Plan steht gleichzeitig „Noch offen“. Der Hinweis auf vorläufige Modellwerte erklärt mir diese unterschiedlichen Beträge nicht ausreichend.

Reproduktion: 

- Plan → „Annahmen & Risiko“ öffnen.
- Plan → „Angaben & Annahmen prüfen“ → „Weitere Annahmen & Rechenweg“.
- Plan → „ETF-Depot bearbeiten“ → Kennzahlen und Tabelle „Was wäre, wenn du diesen Vertrag anders führst?“ vergleichen.
- Dort „Angaben bearbeiten“ → „Kosten & Auszahlung“ → „Wo finde ich die Kosten?“.

**5. 250 € ausprobieren, speichern, zurückkehren und übernehmen — teilweise geschafft**

Speichern, Wiederfinden und Übernehmen gelingen. Den **finanziellen Effekt** kann ich nicht erkennen: Unter „Bisher“ und „Danach“ steht jeweils „Noch offen“. Nur die Beiträge **150 € → 250 €** sind sichtbar.

Nach dem Übernehmen erscheinen gleichzeitig:

- „Änderung in den Plan übernommen.“
- „Dein Plan hat sich seit dem Speichern geändert.“
- „Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.“

Dadurch bin ich unsicher, ob ich fertig bin. Die anschließende Kontrolle auf der ETF-Detailseite bestätigt jedoch **250 € Beitrag pro Monat**.

Reproduktion: „Änderung ausprobieren“ → „Neuer monatlicher Beitrag in €“ auf **250** setzen → „Vorher und nachher ansehen“ → „Alternative speichern“ → „Zurück zum Plan“ → „Gespeicherte Alternativen (1)“ → bei „ETF-Depot: 250 € Beitrag / Monat“ auf „Vorher und nachher öffnen“ → „Beitrag in meinen Plan übernehmen“.

Beim Wiederöffnen steht vor der Übernahme weiterhin „Bisher: 150 € / Monat“; der ursprüngliche Plan war also erhalten geblieben.

**6. ETF entfernen und wiederherstellen — geschafft**

„Vorsorge entfernt“ und „„ETF-Depot“ entfernt.“ bestätigen das Entfernen eindeutig. „Rückgängig“ stellt das Depot mit **250 € Sparrate** und weiterhin unbekanntem aktuellem Wert wieder her.

Der Weg zum Entfernen ist etwas länger als erwartet: „ETF-Depot bearbeiten“ führt zunächst zu einer Detailseite; erst „Angaben bearbeiten“ öffnet das eigentliche Formular.

Reproduktion: Plan → „ETF-Depot bearbeiten“ → „Angaben bearbeiten“ → „Vorsorge entfernen“ → „Rückgängig“.

**7. ETF und Betriebsrente mit jeweils 200 € eigenem Geld vergleichen — geschafft**

Unter „Vergleich“ erscheinen bereits die passenden Sparformen und der Text **„Je 200 € aus deinem eigenen Geld im Monat.“**

Angezeigt werden:

| Sparform | Geschätzte monatliche Nettoauszahlung | Dauer |
|---|---:|---|
| ETF-Depot | 1.003 € | Bis Alter 90 |
| Betriebliche Altersvorsorge | 486 € | Lebenslang |

„Gezeigt wird die Auszahlung je Sparform ab 67, keine Gesamtrente“ hilft mir sehr.

Verwirrend bleibt der Wechsel der Geldbetrachtung: Hier steht **„Beträge zum Rentenbeginn (nominal)“**, im Plan „In heutigen Euro“. Ich kann die Zahlen deshalb nicht einfach mit meinem Plan vergleichen. Bei der Betriebsrente steht unter den Annahmen außerdem „Weitere Einkünfte im Ruhestand: 0 € / Monat“, obwohl ich zuvor eine gesetzliche Rente geschätzt habe.

Reproduktion: „Vergleich“ → bei beiden Produkten „Annahmen ansehen“ → „Auswahl oder Betrag ändern“ → ausgewählte Produkte und **200 €** kontrollieren → „Vergleich ansehen“.

**8. Wiederholung am Telefon — insgesamt teilweise geschafft**

**Aufgabe 1: geschafft.** Derselbe Einstieg mit 35, 60000 und Arbeitsbeginn 22 ergibt erneut **879 €**. Die Eingaben und die Schaltflächen „Weiter“ und „Meinen Plan ansehen“ lassen sich bedienen. Die anfängliche Beschriftung leerer Felder mit „Angenommen“ bleibt irritierend.

**Aufgabe 3: geschafft.** Die Ergebnisbeschriftung ist lesbar. Für die Wiederholung von Aufgabe 5 ergänze ich wieder den ETF mit unbekanntem Wert und 150 €. Danach erscheint erneut „Noch offen“. Nach Scrollen führt „Dauer ansehen →“ zur verständlichen Erklärung der unterschiedlichen Laufzeiten.

**Aufgabe 5: teilweise geschafft.** Speichern, Rückkehr, Wiederfinden und Übernehmen funktionieren auch hier. Zweimal „Noch offen“ verhindert wieder den Vergleich der Rentenhöhe. Nach der Übernahme erscheinen dieselben widersprüchlichen Texte. Beim erneuten Öffnen von „Änderung ausprobieren“ bestätigt **„Bisher: 250 € / Monat“** die erfolgreiche Änderung.

Reproduktion: Fenster auf **390 × 844** → Speicher leeren und Startseite neu laden → Schritte aus Aufgabe 1 und 2 wiederholen → im Plan nach unten zu „Änderung ausprobieren“ scrollen → **250** eingeben → „Vorher und nachher ansehen“ → nach unten zu „Alternative speichern“ scrollen → über die untere Navigation „Mein Plan“ zurückkehren → zu „Gespeicherte Alternativen (1)“ scrollen → Alternative öffnen → nach unten zur Übernahme scrollen.

Auf dem Telefon muss ich Ergebnis, Aktionen und gespeicherte Alternativen häufiger durch Scrollen zusammensuchen. Eine zusätzliche Bedienblockade habe ich auf diesen Wegen nicht erlebt.

**Die drei größten Probleme aus meiner Sicht**

1. **Eine unbekannte ETF-Angabe nimmt mir den bisherigen Überblick.** Meine gesetzliche Rentenschätzung verschwindet mit; auch der Nutzen einer höheren Sparrate bleibt unsichtbar.
2. **Zahlen und Bestätigungstexte passen für mich nicht eindeutig zusammen.** „Noch offen“, 763 € und 2.419 € stehen auf verschiedenen Ansichten; nach der Übernahme klingt ein Teil der Texte weiterhin nach einer ausstehenden Aktion.
3. **Die Erklärung wird schnell zu fachlich.** Kosten sind auffindbar, aber Begriffe wie „TER“, „MC 1000x“, „Gain-Ratio“ und „nominal“ erschweren mir die Einordnung.

**Was gut funktioniert hat**

Der kurze Einstieg ohne Unterlagen, „Ungefähr reicht“ und „Weiß ich nicht“ erleichtern den Anfang. Die Auszahlungsdauer wird ausdrücklich erklärt. Gespeicherte Alternativen sind über einen eigenen Button wiederzufinden. Entfernen und „Rückgängig“ funktionieren eindeutig. Besonders verständlich ist im Vergleich die Formulierung **„Je 200 € aus deinem eigenen Geld im Monat.“**
exit=0
