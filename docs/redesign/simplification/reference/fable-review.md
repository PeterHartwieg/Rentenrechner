# Blind Novice Usability Review — RentenWiki.de "Klickentwurf" (http://127.0.0.1:56819/)

**Disclaimer on method:** This is an AI role-play review (Claude acting as a 35-year-old German employee, €60,000 gross, statutory health insurance, no financial or IT expertise, no documents to hand). It is not evidence from a real novice participant. Only the visible browser UI was used (screenshots, clicks, keyboard, the extension's accessibility reader); no code, network, or page source was inspected. All entered data was synthetic (35 / 60000 / 12 years / ETF 10000 + 150 / 250 / 2800).

---

## 0. Environment notes and failed actions (candid)

- **First tab was dead.** In the initial tab the page rendered but *nothing* responded — "Meine Rente einschätzen" ×3, "Mein Plan", the disclaimer toggle ×2, Tab-key focus, reload. Page-text and accessibility readers returned empty. After opening a **new tab**, everything worked. I believe this was a browser-extension/tab issue rather than the prototype, but I cannot prove it. A real novice hitting that would simply conclude "the site is broken" and leave.
- **Slow first paint.** In the fresh tab the page was fully black for ~2 s, then header-only for several more seconds, then complete after ~8–10 s. No spinner or "loading" text. As a novice: *"Ist das kaputt?"*
- **Mouse-wheel scrolling did nothing** in my tool; PageDown/End/Home worked. I can't tell whether that's the tool or the page. Mentioning it because on step 1 the "Weiter" button sat cut off at the bottom of the viewport until I found keyboard scrolling.
- **Accessibility tree was essentially empty** on every screen (only one generic node). This may be a tool limitation; if it reflects the page, screen-reader users would get nothing. Flagged with uncertainty.
- **Narrow-phone check could not be performed.** `resize_window` to 390×844 and 400×900 both reported success, but the viewport stayed 1439×784 (verified twice). I restored the window to 1440×880. I have **no** mobile observations.

---

## 1. First impressions (start page, before any click)

Visible: top bar "Klickentwurf · Beispielwerte, keine Berechnung"; logo "RentenWiki.de"; nav "Mein Plan", "Vergleich"; collapsed line "▶ Keine Steuer-, Rechts- oder Anlageberatung."; eyebrow "DEINE VORSORGE. VERSTÄNDLICH."; headline "Was bleibt dir im Ruhestand?"; subline "Ein erster Überblick mit wenigen Angaben. Details ergänzt du, wenn du möchtest."; primary button "Meine Rente einschätzen"; links "Sparformen vergleichen →", "Ohne Anmeldung.", "Mit Beispiel erkunden"; a card "SO SIEHT DEIN ÜBERBLICK AUS — ca. 2.450 € — Gesamt · netto pro Monat — Mit 67 · heutige Kaufkraft — Gesetzliche Rente 1.900 € / ETF-Depot 350 € / Betriebsrente 200 € — Beispiel · keine garantierte Rente". Footer: "Annahmen & Rechenweg", "Datenschutz".

Novice reactions:
- *"Sieht seriös und ruhig aus. Dunkel, große Zahl, wenig Text — gut."*
- *"'Ohne Anmeldung' beruhigt mich sofort."* (reassurance moment #1)
- *"Die Karte sagt 'SO SIEHT DEIN ÜBERBLICK AUS' — aber ich habe noch nichts eingegeben. Ist das meins?"* The card header says "dein", the footnote says "Beispiel". Mixed signal.
- *"'Klickentwurf' und 'Klickmodell' — keine Ahnung, was das heißt."* (jargon from the design world, not the user's world)
- *"'heutige Kaufkraft' — hm, ich glaube das heißt 'in heutigem Geld'? Nicht sicher."*
- The words "Mein Plan" and "Vergleich" in the nav are clear enough. I'd click the pink button.

---

## 2. Task walkthroughs (with click paths and visible labels)

### Task A — Reach a useful first result without the example preset
**Status: Completed, with one moment of guessing.**

Path: "Meine Rente einschätzen" → screen "1 VON 2 · ÜBER DICH / Ein paar Angaben reichen." Fields: "Dein Alter" (placeholder "z. B. 35"), "Jahreseinkommen brutto (€)" ("z. B. 60000"), "Deine Tätigkeit" (dropdown, default "Angestellt"), "Krankenversicherung" (default "Gesetzlich"), collapsed "▶ Rentenalter & weitere Angaben" (opened: "Rentenbeginn mit" = 67, note "Steuerdetails kannst du später ergänzen."), button "Weiter".

- *"Vier Felder, zwei schon richtig vorausgefüllt. Das schaffe ich."* Very good.
- Minor: "Jahreseinkommen brutto" — I know "brutto" from my payslip; okay.
- Issue: after opening the expander, the "Weiter" button was cut off below the fold and the wheel didn't scroll; I had to discover PageDown.

"Weiter" → "2 VON 2 · DEINE RENTE / Was weißt du schon?" — "Gesetzliche Rente": radio options "Renteninformation liegt vor", "Grob schätzen" (preselected), "Später ergänzen"; field "Wie viele Jahre hast du bisher eingezahlt?" (placeholder "z. B. 15"), hint "Für eine grobe Schätzung mit deinem heutigen Einkommen."; button "Meinen Plan ansehen".

- **Guessing moment:** I had to guess the years paid in (I typed 12). No hint like "meist ab dem ersten Job" or "Ausbildung zählt oft mit". A novice will either guess or stop here.
- I peeked at "Renteninformation liegt vor": it reveals "Hochgerechnete Regelaltersrente brutto (€/Monat)" with hint "Aus der Renteninformation: bei weiteren Beiträgen wie bisher, ohne künftige Rentenanpassungen." — *"Das ist genau die Sprache, die ich nicht verstehe. Welche Zeile auf dem Brief ist das?"* No pointer to where on the letter that number sits. Since the task said I have no documents, "Grob schätzen" being preselected was the right default and a relief.

"Meinen Plan ansehen" → **"Deine Rente im Überblick" — "Gesamt · netto pro Monat" — "ca. 1.900 €" — "Mit 67 · heutige Kaufkraft" — "Beispiel mit Annahmen · nicht garantiert"** — row "Gesetzliche Rente / Lebenslang · grob geschätzt / 1.900 € ›" — buttons "Vorsorge ergänzen", links "Persönliche Angaben", "Wunschrente ergänzen", collapsed "▶ Mehr zu deinem Plan".

- *"1.900 € — das ist genau die Zahl aus dem Beispiel auf der Startseite. Hat er meine Angaben überhaupt benutzt?"* This coincidence undermined my trust more than anything else on the site. (I'm told not to judge the maths — but the *impression* is a UX problem.)

### Task B — Add an ETF account (€10,000 now, €150/month)
**Status: Completed.**

Path: "Vorsorge ergänzen" → "VORSORGE ERGÄNZEN / Was möchtest du hinzufügen?" — "Wähle eine Sparform. Angaben kannst du später ändern." Six tiles: "ETF-Depot / Dein selbst angelegtes Vermögen", "Betriebliche Altersvorsorge / Vorsorge über deinen Arbeitgeber", "Private Rentenversicherung / Dein privater Versicherungsvertrag", "Basisrente / Auch als Rürup-Rente bekannt", "Riester / Dein bestehender Riester-Vertrag", "Altersvorsorgedepot / Als zukünftige Sparform erkunden".

- The one-line subtitles are the best explanatory copy in the whole prototype. *"Ah, 'über deinen Arbeitgeber' — jetzt weiß ich, was betriebliche Altersvorsorge ist."*
- "Altersvorsorgedepot / Als zukünftige Sparform erkunden" — *"Was ist der Unterschied zum ETF-Depot? Und 'zukünftige' — gibt es das noch nicht?"* Unclear.

"ETF-Depot" tile → form "ETF-Depot — Trage ein, was du weißt. Unbekannte Werte bleiben offen." Fields "Aktueller Wert (€)" and "Monatliche Sparrate (€)", each placeholder "Unbekannt" with a **pre-ticked checkbox "Weiß ich nicht"**. Collapsed "▶ Name, Kosten und Auszahlung" (opened: "Eigener Name (optional)", "Laufende Kosten pro Jahr (%)" + "Weiß ich nicht" ticked, "Auszahlung bis Alter" + "Weiß ich nicht" ticked, note "Deine Angaben bleiben beim Zuklappen erhalten."). Grey box "Klickmodell: Diese Angaben ändern noch keine berechnete Rente." Buttons "Zur Rente hinzufügen", "Abbrechen".

- Typing into a field automatically un-ticked "Weiß ich nicht". Nice — no extra step.
- *"'Weiß ich nicht' als Standard — das nimmt mir die Angst, etwas falsch zu machen."* (reassurance moment #2)
- Confusing sentence: "Klickmodell: Diese Angaben ändern noch keine berechnete Rente." — then I clicked "Zur Rente hinzufügen" and the total **did** change (1.900 → 2.275). *"Erst sagt er, es ändert nichts, dann ändert es doch was. Was stimmt jetzt?"*
- Result on plan: new row "ETF-Depot / Bis 90 · Beispiel / 375 € ›" and total "ca. 2.275 €"; new button "Änderung ausprobieren" appeared.
- *"'Bis 90' — was passiert mit 91? Und warum 375 €?"* Clicking the row only reopens the same input form ("VORSORGE BEARBEITEN", "Änderungen übernehmen"). There is **no plain-language explanation** of how 10.000 € + 150 €/Monat becomes 375 €/Monat, and **no visible way to delete** the ETF once added.

### Task C — Find details for more precision
**Status: Completed, but details are thin and partly reassuring-by-disclaimer only.**

Path: "▶ Mehr zu deinem Plan" → three buttons "Annahmen & Rechenweg", "Kapital im Ruhestand", "Gemerkte Alternativen".

"Annahmen & Rechenweg" → "Die Details bleiben erreichbar, wenn du genauer hinsehen möchtest." Four collapsed sections:
- "Deine Angaben": "Alter / Einkommen — 35 Jahre / 60.000 €", "Rentenangabe — Grobe Schätzung", link "Angaben ändern". *"Gut — er hat meine Zahlen also doch benutzt."* (late reassurance that should have come earlier)
- "Markt, Kaufkraft & Rentenbeginn": "Alle gezeigten Beträge sind Beispiele in heutiger Kaufkraft. Im fertigen Rechner wird die Inflation berücksichtigt." + small "Die Eingaben in dieser Vorschau führen keine Renten-, Steuer- oder Inflationsberechnung aus." + link "Annahmen bearbeiten" → page "Deine Annahmen": "Rendite vor Kosten (% pro Jahr)" = 5, "Inflation (% pro Jahr)" = 2, note "Im Entwurf werden Werte gemerkt. Die Beispielrente wird nicht neu berechnet.", button "Annahmen übernehmen". *"'Rendite vor Kosten' — ich weiß ungefähr, was Rendite ist, aber ob 5 gut oder schlecht ist, keine Ahnung."*
- "Steuern & Krankenversicherung": "Das Netto-Ergebnis soll die Abzüge aller erfassten Renten berücksichtigen. Fehlende Angaben bleiben sichtbar." + link "Weitere persönliche Angaben".
- "Woher kommen die Beispielwerte?": "Frei gewählte Beträge zur Prüfung des Bedienablaufs. Vertragsbeiträge verändern nur das Zahlenbeispiel. Keine finanzielle Prognose."

Honest novice takeaway: *"Also ist alles hier ausgedacht? Dann weiß ich nach 5 Minuten immer noch nicht, wie meine Rente aussieht."* The disclaimers are clear, but they are the *only* content — there is no "so wird gerechnet" explanation a layperson could follow.

"Kapital im Ruhestand" → "Beispiel: Kapital im Ruhestand — Ein eigenständiges Auszahlungsbeispiel · heutige Kaufkraft" with bars "Mit 67 100.000 € / Mit 75 65.000 € / Mit 85 22.000 € / Mit 90 0 €" and note "In diesem Beispiel endet die Auszahlung mit 90. Lebenslange Renten laufen weiter." — *"Wo kommen 100.000 € her? Ich habe 10.000 € eingegeben."* The word "eigenständiges" is doing heavy lifting a novice won't notice. This chart actively confuses in the context of "Mehr zu **deinem** Plan".

### Task D — Compare a couple of savings options
**Status: Completed.**

Path: nav "Vergleich" → "SPARFORMEN VERGLEICHEN / Was möchtest du vergleichen?" — "Wähle nur die Sparformen, die dich interessieren." Checkbox tiles: "ETF-Sparplan" ✓, "Betriebliche Altersvorsorge" ✓ (both preselected), "Private Rentenversicherung", "Basisrente", "Riester", "Altersvorsorgedepot". Field "Dein monatlicher Nettoaufwand in €" = 150 (carried over from my ETF), hint "Für jede ausgewählte Sparform derselbe Betrag aus deinem eigenen Geld." Button "Vergleich ansehen".

Result: "SPARFORMEN VERGLEICHEN · BEISPIEL / Deine ausgewählten Sparformen — Je 150 € eigener Nettoaufwand im Monat. — Gezeigt wird die Auszahlung je Sparform ab 67, keine Gesamtrente. Beträge in heutigen Euro." Cards: "ETF-Sparplan 350 € netto / Monat · bis Alter 90" and "Betriebliche Altersvorsorge 310 € netto / Monat · lebenslang", each with "▶ Beispielannahmen ansehen" (opened: "Eigener Nettoaufwand: 150 € / Monat. Auszahlung ab 67, bis Alter 90." / "…lebenslang." + "Frei gewählte Beispielbeträge für die Gestaltung. Kosten, Förderung, Steuern und Versicherungsbeiträge werden hier nicht berechnet."). Grey box "Eine höhere Monatsauszahlung sagt allein nicht, welche Sparform besser passt. Beachte die Auszahlungsdauer." Buttons "Auswahl oder Betrag ändern", "Weitere Sparform hinzufügen".

- The warning box is genuinely helpful and honest. (reassurance moment #3)
- "Nettoaufwand" is jargon. *"Netto-Aufwand — heißt das, was mir am Ende vom Konto abgeht?"* Probably, but I'm guessing.
- Inconsistent naming: on the plan it's "ETF-Depot", here "ETF-Sparplan". Same thing? Not sure.
- The sub-headings on the start page said "Betriebsrente", here "Betriebliche Altersvorsorge". Again the same thing? A novice can't be sure.
- Missing: nothing tells me *why* the bAV is "lebenslang" and the ETF is "bis 90" — the one fact that the warning box says matters most.

### Task E — Change a contribution, keep the alternative, return to the original plan
**Status: Completed — this was the smoothest flow.**

Path: "Mein Plan" → "Änderung ausprobieren" → "ÄNDERUNG AUSPROBIEREN · BEISPIEL / Was wäre, wenn …? — Dein ursprünglicher Plan bleibt erhalten." Dropdowns "Sparform" (= ETF-Depot), "Änderung" (= "Monatlichen Beitrag ändern"), field "Neuer monatlicher Beitrag in €" (150), small "Bisher: 150 € / Monat.", buttons "Vorher und nachher ansehen", "Zum ursprünglichen Plan".

Typed 250 → "Vorher und nachher ansehen" → box "Bisherige Gesamtrente 2.275 € / Gesamtrente danach 2.505 € — Netto / Monat ab 67 · heutige Euro — Änderung: +230 € / Monat" + "Beispiel für die Darstellung, keine berechnete Auswirkung. Auszahlungsdauer der einzelnen Quellen siehe ursprünglicher Plan." New button "Alternative merken".

"Alternative merken" → "ALTERNATIVEN / Deine gemerkten Änderungen — Für diese Vorschau gemerkt. Nach dem Neuladen nicht mehr verfügbar." Card "ETF-Depot: 250 € Beitrag / Monat — 2.275 € → 2.505 € netto / Monat · Beispiel — Stand beim Merken — [Vorher und nachher öffnen]". Buttons "Änderung ausprobieren", "Zum ursprünglichen Plan".

"Zum ursprünglichen Plan" → plan still shows "ca. 2.275 €" and "ETF-Depot 375 €"; under "Mehr zu deinem Plan" the button now reads "Gemerkte Alternativen (1)".

- *"'Dein ursprünglicher Plan bleibt erhalten' — genau der Satz, den ich brauche."* (reassurance moment #4, the best one)
- *"Nach dem Neuladen nicht mehr verfügbar" — so if I accidentally refresh, my work is gone, and there is no "speichern" or "als Link teilen". A novice will lose their work eventually.*
- No way to delete a remembered alternative, and no way to "apply" it to the plan (maybe intentional, but I looked for it).

### Bonus — "Wunschrente ergänzen"
"Wie viel möchtest du haben? — Optional · netto pro Monat, in heutiger Kaufkraft." Field "Deine Wunschrente (€)" (placeholder "z. B. 2800"), buttons "Wunsch übernehmen", "Ohne Wunschrente fortfahren". After entering 2800 the plan shows a side box "Dein Wunsch: 2.800 € / 525 € fehlen monatlich / Wunsch ändern". *"Das ist die nützlichste Zahl der ganzen Seite: Mir fehlen 525 €."* Yet this feature is hidden as a small text link under the main buttons.

### Navigation oddities found
- On the "DEINE RENTENANGABE" edit screen, "← Zurück" did **not** return to the plan but to the step-1 form ("DEINE ANGABEN / Ein paar Angaben reichen." with "← Zurück zum Plan" and "Weiter zur Rentenangabe"). Two backs needed; first one lands on a form the user didn't ask for.
- Back-link labels vary: "← Zurück", "← Zurück zum Plan", "← Zurück zu meiner Rente", "← Andere Sparform". Each is understandable, but the plain "← Zurück" is the one that misbehaves.
- The top-bar text "Klickentwurf · Beispielwerte, keine Berechnung" and the inline "Klickmodell:" boxes are developer-speak and appear on every screen.

---

## 3. The headline number — my interpretation as a novice

- **What I think it means:** "ca. 2.275 €" is roughly what I'd have per month at 67, after deductions, in today's money — the sub-labels "Gesamt · netto pro Monat" and "Mit 67 · heutige Kaufkraft" make that fairly clear (though "Kaufkraft" is a stretch word).
- **Is it guaranteed?** No — "Beispiel mit Annahmen · nicht garantiert" is directly under it. Good and honest. But I only learned via "Annahmen & Rechenweg" that it's essentially a *placeholder example*, not a real estimate from my inputs. The plan page itself doesn't say that clearly enough; "Beispiel mit Annahmen" reads like "estimate with assumptions", not "made-up numbers".
- **What it includes:** the rows below (Gesetzliche Rente 1.900 €, ETF-Depot 375 €). "netto" suggests taxes and health insurance are deducted, and the "Steuern & Krankenversicherung" section says it "soll … berücksichtigen" (should) — future tense that a novice won't notice.
- **What's missing for me to trust it:** (1) an explicit statement on the plan "diese Zahl basiert auf deinen Angaben: 35 Jahre, 60.000 €, 12 Beitragsjahre" — right next to the number; (2) a one-sentence explanation for each row's amount ("375 € entsteht aus 10.000 € heute plus 150 €/Monat bei 5 % Rendite bis 67, verteilt bis 90"); (3) a plain-language line about what happens after "Bis 90"; (4) whether the state pension already accounts for "Rentenanpassungen"; (5) what "heutige Kaufkraft" means in one sentence; (6) how "netto" was derived.

---

## 4. Confusing words, excess input, missing guidance — concrete list

**Confusing words (novice perspective):** "Klickentwurf", "Klickmodell", "heutige Kaufkraft", "Hochgerechnete Regelaltersrente brutto", "ohne künftige Rentenanpassungen", "Nettoaufwand", "Rendite vor Kosten", "Laufende Kosten pro Jahr (%)", "Auszahlung bis Alter", "Altersvorsorgedepot" vs "ETF-Depot", "ETF-Depot" vs "ETF-Sparplan", "Betriebsrente" vs "Betriebliche Altersvorsorge", "eigenständiges Auszahlungsbeispiel", "Basisrente / Rürup".

**Excess text/input:** Very little — the input burden is admirably low (4 + 1 fields to a first result; "Weiß ich nicht" defaults). The excess is in *disclaimers*: nearly every screen carries one or two grey boxes saying essentially "this is only an example", which, repeated, becomes noise and eventually erodes confidence rather than building it.

**Missing guidance:** how to estimate years paid in; where on the Renteninformation letter to find the number; what each row amount means; how to remove a Sparform; how to save/share the plan; what to do about a "525 € fehlen" gap (no "so könntest du die Lücke schließen" nudge); no visible progress/where-am-I beyond "1 VON 2".

**Reassurance moments (worked well):** "Ohne Anmeldung."; "Ein paar Angaben reichen."; "Weiß ich nicht" defaults; "Dein ursprünglicher Plan bleibt erhalten."; "Eine höhere Monatsauszahlung sagt allein nicht, welche Sparform besser passt."; the "525 € fehlen monatlich" gap; the Datenschutz page "Keine Anmeldung, keine Übertragung deiner Eingaben."

---

## 5. Top-five issues (prioritised by user impact, grounded in what I saw)

1. **The first result looks like it ignored my input.** After entering 35 / 60000 / 12 years, the plan shows "ca. 1.900 €" — the identical figure from the start-page example card — with no echo of my inputs beside it. Only two levels deeper ("Mehr zu deinem Plan" → "Annahmen & Rechenweg" → "Deine Angaben") is it confirmed that 35 / 60.000 € were used. Trust is lost at the exact moment it should be won.

2. **Contradictory "no calculation" messaging vs. numbers that visibly change.** "Klickmodell: Diese Angaben ändern noch keine berechnete Rente." sits above "Zur Rente hinzufügen" — and then the total changes 1.900 → 2.275 €, and later 2.275 → 2.505 € with "Änderung: +230 € / Monat". Combined with "Beispiel mit Annahmen · nicht garantiert" and the "Woher kommen die Beispielwerte?" text ("Frei gewählte Beträge … Keine finanzielle Prognose."), a novice cannot tell what is real, what is placeholder, and what to take home.

3. **Row amounts are unexplained and unremovable.** "ETF-Depot / Bis 90 · Beispiel / 375 €" — clicking "›" only reopens the input form. No sentence explains how 10.000 € + 150 €/Monat → 375 €/Monat, what "Bis 90" implies, or how to delete the row. The "Kapital im Ruhestand" chart under "Mehr zu **deinem** Plan" then shows an unrelated "100.000 €" example, deepening the confusion.

4. **Jargon at the exact decision points.** "Wie viele Jahre hast du bisher eingezahlt?" (no help), "Hochgerechnete Regelaltersrente brutto (€/Monat)" (no pointer to the letter), "Nettoaufwand", "Rendite vor Kosten", inconsistent product names ("ETF-Depot"/"ETF-Sparplan", "Betriebsrente"/"Betriebliche Altersvorsorge", "Altersvorsorgedepot"). Each is a place where a novice guesses or stops.

5. **Fragile session and navigation friction.** Work is lost on reload ("Nach dem Neuladen nicht mehr verfügbar", "Beim Neuladen gehen sie verloren.") with no save/share; "← Zurück" from the pension edit screen goes to the wrong place; the primary button sat below the fold on step 1 with (in my session) no wheel scrolling; the very first load showed a blank black screen for seconds with no loading indicator; the one hidden feature that gives the most useful answer ("525 € fehlen monatlich") is a small text link.

---

## 6. Would I use it unaided? / Single most helpful change

**Comfort level unaided:** *Partly.* I could reach a number in under two minutes and never felt asked for something I didn't have — that is genuinely rare. But I would not act on the result, because the site keeps telling me it's made up while showing me numbers that respond to my inputs, and because the one thing I most wanted — "why 375 €? why 1.900 €?" — is never explained in words. I'd finish the flow, feel mildly reassured, and still not know my retirement situation. I would not be *stuck* anywhere except the "Jahre eingezahlt" guess and the possible "site is broken" first impression.

**Single change that would help most:** On the plan page, directly under "ca. 1.900 € / 2.275 €", show one plain sentence that ties the number to *my* inputs and states its nature unambiguously — e.g. "Grob geschätzt aus deinen Angaben: 35 Jahre, 60.000 € brutto, 12 Beitragsjahre, Rente ab 67. Kein garantierter Wert." — and give every row a matching one-liner ("375 €: aus 10.000 € heute plus 150 €/Monat, ausgezahlt von 67 bis 90"). That one addition would fix the trust gap (issue 1), resolve the "is this real?" confusion (issue 2), and cover the unexplained rows (issue 3) in a single stroke, without adding any input burden.
