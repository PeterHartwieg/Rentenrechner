# AVD-Beitragseingabe — Audit der Referenzmockups + Umsetzungsplan

**Datum:** 2026-08-02
**Grundlage:** [`docs/finanzfluss-avd-frontend-audit.md`](../../finanzfluss-avd-frontend-audit.md) und die Mockups in diesem Ordner.
**Status:** Plan — noch nichts implementiert.

Alle Zahlen in Teil 1 wurden gegen die echte Engine geprüft (`vite-node`-Probe
über `calculateAvdFunding`, `maxAvdMonthlyOwnContribution`, `computeAvdAllowances`,
`syncMonthlyContributions`), nicht aus den Mockups übernommen.

---

## Teil 1 — Audit

### 1.1 Was in den Mockups belegbar richtig ist

| Behauptung im Mockup | Engine-Gegenprobe | Ergebnis |
|---|---|---|
| Beitragsstufe 10 €/Mon. = Mindestbeitrag | 120 €/Jahr = `minimumOwnContributionAnnual`; bei 9 €/Mon. (108 €/Jahr) ist `totalAllowanceAnnual = 0`, bei 10 €/Mon. = 60 € | korrekt |
| Beitragsstufe 30 €/Mon. = Ende der 50-%-Stufe | 360 €/Jahr = `basicAllowanceTier1MaxContribution`; Grundzulage 180 € | korrekt |
| Beitragsstufe 150 €/Mon. = volle Grundzulage | 1 800 €/Jahr = `basicAllowanceTier2MaxContribution`; Grundzulage 540 € = `basicAllowanceMax` | korrekt |
| Vertragsrahmen 525 / 500 / 475 € bei 0 / 1 / 2 Kindern | `maxAvdMonthlyOwnContribution` liefert exakt 525,00 / 500,00 / 475,00 | korrekt **für die Default-Berechtigung** (siehe 1.3) |
| Farbwerte stammen aus `src/App.css` | `#8a2e2e` → `--rw-accent`, `#7a7268` → `--rw-ink-faint`, `#d8d2c7` → `--rw-rule-soft`, `#f6f4ef` → `--rw-bg-paper-soft`, `#111111` → `--rw-ink`, `#4a4a4a` → `--rw-ink-soft`, `#f8f4eb` → `--rw-bg-cream`, `#b0653a` → `--rw-accent-soft` | korrekt bis auf zwei Ausnahmen (1.3) |

Das Vollseiten-Mockup spiegelt die reale `/eingaben/produkte` sehr genau
(gleiche H1 „Deine Verträge und Sparformen", gleiche §-Gliederung, gleiche
Right-Rail-Texte). Strukturell ist es also **kein Redesign der Seite**, sondern
der Austausch eines Editors innerhalb der bestehenden Sober-D-Hülle. Das hält
das Risiko klein.

### 1.2 Blockierender Befund: der Vergleichsmodus hat gar kein Eigenbeitrags-Feld

Das ist der Kern und er steht so nicht im Audit-Dokument.

`useSimulationResult` ([src/app/useSimulationResult.ts:45](../../../src/app/useSimulationResult.ts)) berechnet **bei jedem Render** alle
Produktbeiträge neu aus dem einen Anker `equalInputAmountEUR`:

```
activeAssumptions = syncMonthlyContributions(equalInputAmountEUR, assumptions, profile, rules)
```

`syncMonthlyContributions` ([src/utils/syncContributions.ts](../../../src/utils/syncContributions.ts)) löst daraus per Bisektion
`bav.monthlyGrossConversion`, `basisrente.monthlyGrossContribution`,
`altersvorsorgedepot.monthlyOwnContribution` und `riester.monthlyOwnContribution`.

Folge: **`assumptions.altersvorsorgedepot.monthlyOwnContribution` ist im
Vergleichsmodus kein Eingabewert, sondern ein abgeleiteter Wert.** Was ein
Nutzer dort hineinschriebe, würde beim nächsten Simulationslauf überschrieben.
Ein simples Feld-Tauschen (Netto-Aufwand raus, Eigenbeitrag rein) funktioniert
deshalb nicht.

Dazu kommt eine messbare Drift. Gemessen: Eigenbeitrag vorwärts in Netto
rechnen, Netto als Anker setzen, Eigenbeitrag zurücklesen:

| gewählt | abgeleiteter Netto-Anker | zurückgelesener Eigenbeitrag | Drift |
|---:|---:|---:|---:|
| 10 € | 9,42 € | 10,11 € | +0,11 |
| 30 € | 28,17 € | 30,34 € | +0,34 |
| 150 € | 122,58 € | 149,73 € | −0,27 |
| 300 € | 272,58 € | 298,16 € | −1,84 |
| 525 € | 497,58 € | 521,92 € | −3,08 |

Ursache ist nachgewiesen: löst man denselben Netto auf **derselben**
Gehaltsbasis zurück, beträgt die Abweichung nur 0,003 € (Bisektionstoleranz).
Die Drift entsteht, weil `syncMonthlyContributions` zuerst die bAV-Umwandlung
neu löst, damit `salaryWithBav` verschiebt und die AVD-Günstigerprüfung
anschließend auf einer anderen Steuerbasis rechnet. Je größer der Anker, desto
größer die Verschiebung.

Ohne Gegenmaßnahme würde eine angeklickte Beitragsstufe „150 €" sofort auf
149,73 € springen, die Karte sich selbst abwählen und der Slider vom
5er-Raster fallen.

**Zweite Folge, die in die Copy muss:** ein Klick auf eine AVD-Beitragsstufe
schreibt den globalen Anker um und damit alle anderen Produkte. Gemessen:
Anker 200 € → bAV-Brutto 352,89 €, Basisrente 314,09 €, Riester 249,50 €.
Nach Klick auf AVD-Stufe 150 € (Anker 122,58 €) → bAV-Brutto 222,78 €,
Basisrente 194,75 €, Riester 172,92 €. Das ist im Einklang mit der
Fair-Comparison-Invariante und mit dem Mockup-Hinweis („wird automatisch
übernommen"), aber die aktuelle Formulierung erwähnt nur ETF.

#### Zwei Umsetzungswege

**Weg C — Anker-Rückwärtssuche (empfohlen).** Der Anker bleibt die einzige
Wahrheit. Ein neuer reiner Helper sucht denjenigen Anker, dessen
Sync-Ergebnis exakt den gewünschten Eigenbeitrag liefert:

```
solveAnchorForAvdOwn(targetOwn, assumptions, profile, rules) → anchorEUR
```

Gemessen (Bisektion über `syncMonthlyContributions`, Startwert aus der
Vorwärtsrechnung):

| Ziel-Eigenbeitrag | gefundener Anker | erreicht | Fehler | Zeit |
|---:|---:|---:|---:|---:|
| 10 € | 7,14 € | 10,0000 € | 0,0000 | 1,8 ms |
| 30 € | 27,86 € | 30,0259 € | +0,0259 | 4,1 ms |
| 150 € | 122,76 € | 150,0038 € | +0,0038 | 1,1 ms |
| 300 € | 274,50 € | 299,9908 € | −0,0092 | 5,7 ms |
| 525 € | 502,58 € | 525,0000 € | 0,0000 | 0,1 ms |

Die Abbildung Anker → Eigenbeitrag ist monoton (geprüft über 0–600 € in
25er-Schritten), Bisektion ist also zulässig. Restfehler bleibt unter 0,03 €
und ist bei Anzeige mit 0 Nachkommastellen unsichtbar. 40 Sync-Läufe (ein
Slider-Drag) kosten 2,4 ms — der Slider darf live rechnen.

Kein Schema-Wechsel, keine Storage-Migration, kein neuer persistierter Zustand.

**Weg B — Herkunft des Ankers persistieren (Rückfalloption).** Ein optionales
`equalInputOriginProductId` in `ScenarioAssumptions`; ist es
`'altersvorsorgedepot'`, lässt `syncMonthlyContributions` den gespeicherten
Eigenbeitrag unangetastet und löst nur die übrigen Produkte. Exakt auf den
Cent, kostet aber Schemafeld, `scenarioSchema`-Erweiterung,
`migrateAndValidateState`-Pfad und Share-URL-Round-Trip. Nur nehmen, wenn der
Restfehler aus Weg C sich als störend erweist.

### 1.3 Was aus den Mockups **nicht** übernommen werden darf

1. **Die Beitragsstufen als Literale.** Das Mockup schreibt `{ v: 10 }`,
   `{ v: 30 }`, `{ v: 150 }`. Übernommen wäre das ein **P0** („Statutory values
   hardcoded outside `src/rules/`", CLAUDE.md → Review guidelines). Die Werte
   müssen aus `rules.altersvorsorgedepot` abgeleitet werden:
   `minimumOwnContributionAnnual / 12`, `basicAllowanceTier1MaxContribution / 12`,
   `basicAllowanceTier2MaxContribution / 12`. Damit trägt sich ein späteres
   `de2027.ts` automatisch durch.

2. **Die Vertragsrahmen-Formel.** Das Mockup rechnet
   `(6840 − 540 − Kinder·300) / 12`. Das ignoriert Berufseinsteigerbonus und
   mittelbare Berechtigung. Gemessen:

   | Fall | `maxAvdMonthlyOwnContribution` | Mockup-Formel |
   |---|---:|---:|
   | Default | 525,00 € | 525 € |
   | Berufseinsteigerbonus noch offen (Alter ≤ 24) | 508,33 € | 525 € |
   | mittelbar über Ehegatte berechtigt | 510,42 € | 525 € |

   Es ist der Engine-Helper zu verwenden, nicht die Formel.

3. **Die vereinfachte Günstigerprüfung.** `mr · min(annual, 1800) − basic`
   vergleicht den Steuervorteil nur gegen die Grundzulage. Die Engine
   (`calculateAllowanceExcessBenefit`) vergleicht gegen `totalAllowanceAnnual`
   inklusive Kinder-, Berufseinsteiger- und Ehegattenzulage. Bei Kindern
   weicht das Mockup ab. Die README sagt das bereits; im Code ist ausschließlich
   `avdFunding.guenstigerpruefungBenefitAnnual` zu rendern.

4. **Die Kinderzulage.** Mockup: `Kinder · 300`. Engine:
   `min(Jahresbeitrag, 300) · Kinder`, und 0 unterhalb 120 €/Jahr. Bei kleinen
   Beiträgen liegt das Mockup zu hoch.

5. **Das Label „Höchste Förderquote" bei 30 €.** Gemessen ist die Förderquote
   (Zulage / Eigenbeitrag) bei 10 €, 20 € und 30 €/Monat jeweils **50 %** — 30 €
   ist nicht der höchste, sondern der *letzte* Punkt der 50-%-Stufe. Der
   Untertitel im Mockup („Ende der 50-%-Zulagenstufe") ist richtig, die
   Überschrift nicht. Vorschlag: **„Ende der 50-%-Stufe"**.

6. **Zwei Farbwerte ohne Token.** `#2c6e49` (grün für Zulagen im Ledger) ist
   in `src/App.css` nicht vorhanden; `#e7e2da` existiert dort nur als roher
   Hex-Wert, nicht als benannte Variable. Entweder auf `--rw-accent` /
   `--rw-rule-soft` abbilden oder zwei Tokens ergänzen — die README-Zusage
   „no new tokens" stimmt derzeit nicht.

### 1.4 Lücken der Mockups gegenüber dem heutigen Editor

Im Mockup fehlen ersatzlos, sind aber heute vorhanden und funktional:

- `rentenfaktor` (nur bei `payoutMode === 'lifelong_annuity'`)
- `payoutPlanEndAge` (nur bei `certified_payout_plan`, min. 85)
- die `validateAvdPayoutAge`-Warnung im Kopf des Panels
- der `field-hint` zum Mindestkapital bei `guarantee_80` / `guarantee_100`
  (muss mit der Produktvariante unter „Erweitert" mitwandern)

Diese vier müssen im Umbau erhalten bleiben; die beiden Payout-Detailfelder
gehören unter „Erweitert" bzw. direkt unter die Auszahlungsform.

### 1.5 Was der Umbau sonst noch anfasst

- **`src/features/qa-feedback/__tests__/coverage.test.tsx:801`** prüft
  `data-qa-target="inputs.avd.monthlyNetCost"`. Wird das Primärfeld zum
  Eigenbeitrag, ändert sich die Target-ID — der Test ist bewusst mitzuziehen,
  nicht zu umgehen.
- **Es gibt heute kein einziges `<input type="range">` in `src/`.** Das
  `RangeNumberField` ist ein echtes neues Primitive: Tastaturbedienung,
  `aria-valuetext` mit Einheit, Label-Kopplung, Touch-Zielgröße und
  Dark-/Print-Verhalten sind neu zu lösen, nicht zu kopieren.
- **`NumberField`-Semantik bewahren:** lokaler Draft-String, Commit auf Blur
  und Enter, Range-Hinweis bei Überschreitung. Der Slider schreibt live, das
  Zahlenfeld committet — beide auf denselben Wert.
- **UI-Rundungsgrenze:** Der Ledger zeigt Engine-Floats. Ausschließlich
  `formatCurrency` / `formatPercent`; im Slider/Feld nichts runden, was in die
  Engine zurückfließt.
- **Copy-Katalog:** nur `landing.copy.json` ist migriert; AVD-Texte bleiben
  vorerst inline. Kein Katalogaufwand.

### 1.6 Bewusst außerhalb des Umfangs

- **Riester.** Strukturell identisch (Grundzulage, Günstigerprüfung,
  `solveRiesterOwnFromNet`, `monthlyOwnContribution`) und der offensichtliche
  nächste Kandidat — aber `src/engine/products/riester.ts`,
  `src/domain/products/riester.ts` und `src/engine/portfolioFunding.ts` sind
  gerade in Arbeit. Erst danach anfassen.
- **Basisrente** (§10 Abs. 3 Höchstbetrag) könnte dieselben Beitragsstufen
  bekommen; separates Thema.
- Slider für weitere begrenzte Werte (Alter, Allokation, Auszahlungsquote) —
  erst nachdem sich das Primitive an einer Stelle bewährt hat.

---

## Teil 2 — Umsetzungsplan

Sechs PRs, jeder für sich lauffähig und mit `npm run verify` grün. PR 1–3 sind
reine Zulieferung ohne sichtbare Änderung; erst PR 4 verändert die Oberfläche.

Jeder PR-Text nennt gemäß Cron-Dispatch-Guardrails die berührte Invariante,
die betroffene sichtbare Fläche und die Testdatei.

### PR 1 — Anker-Rückwärtssuche (kein UI)

**Neu:** `solveAnchorForAvdOwn(targetOwn, assumptions, profile, rules)` in
`src/utils/syncContributions.ts` (kanonischer Ort; `src/app/syncContributions.ts`
re-exportiert).

- Bisektion über `syncMonthlyContributions`, Startwert aus
  `calculateAvdFunding(...).monthlyNetCost`, Abbruch bei 0,005 € oder 60 Runden.
- Obergrenze aus `maxAvdMonthlyOwnContribution` — oberhalb davon gibt es keinen
  Anker mehr, die Funktion gibt den Anker der Obergrenze zurück und signalisiert
  die Kappung.
- Keine Rundung im Rückgabewert (Engine-Grenze).

**Tests:** `src/utils/syncContributions.test.ts` — Round-Trip für 10 / 30 / 150 /
300 / 525 € mit Toleranz 0,05 €; Monotonie; Verhalten bei 0 und oberhalb der
Vertragsobergrenze; Kinder = 2; Berufseinsteigerbonus offen.

**Invariante:** Fair-Comparison-Invariante (Compare-Mode) — der Anker bleibt der
einzige Netto-Bezug, alle Produkte investieren weiterhin denselben Netto.
**Fläche:** noch keine.

### PR 2 — `RangeNumberField` (kein Konsument)

**Neu:** `src/ui/RangeNumberField.tsx` + `src/ui/RangeNumberField.test.tsx`.

```
RangeNumberField
├── optionale Quick-Choice-Karten (generisch: { value, label, sub }[])
├── <input type="range"> (live: onChange)
└── NumberField (exakt: onCommit)
```

- Slider und Zahlenfeld teilen `value` / `min` / `max` / `step`; Slider schreibt
  live, Feld committet — die Draft-Semantik von `NumberField` bleibt unberührt,
  weil `RangeNumberField` es komponiert statt es zu ersetzen.
- Auswahlzustand der Karten über Toleranz (`Math.abs(value − option.value) < tol`,
  Default `step / 2`), **nicht** über `===`. Ohne das flackert die Auswahl bei
  jedem Restfehler aus PR 1.
- A11y: `<label htmlFor>` auf beide Controls, gemeinsame Beschreibung via
  `aria-describedby`, `aria-valuetext` mit Einheit („150 Euro monatlich"),
  Karten als `role="radio"` in einer `radiogroup`.
- `feedbackTargetId` durchreichen; Karten bekommen Leaf-Targets
  `<id>.stufe.<value>`.
- CSS in `src/ui/forms.css` mit bestehenden Tokens; ggf. `--rw-positive` und
  `--rw-rule-faint` in `src/App.css` ergänzen (Befund 1.3.6).

**Tests:** Tastaturbedienung (Pfeiltasten am Slider, Enter im Feld), Commit-auf-
Blur, Karten-Auswahl mit Toleranz, Clamping an `min`/`max`, QA-Targets
vorhanden/abwesend je nach QA-Modus.

**Invariante:** UI-Rundungsgrenze — das Primitive rundet nichts, es reicht
`number` unverändert durch.
**Fläche:** noch keine.

### PR 3 — Beitragsstufen aus den Regeln

**Neu:** `src/features/inputs/avdBeitragsstufen.ts` — reine Funktion, React-frei:

```
buildAvdBeitragsstufen(rules, eligibility) → { value, label, sub }[]
```

- Werte aus `rules.altersvorsorgedepot` abgeleitet (Befund 1.3.1), Obergrenze
  über `maxAvdMonthlyOwnContribution` (Befund 1.3.2).
- Duplikate und Stufen oberhalb des Vertragsrahmens werden entfernt (bei sehr
  vielen Kindern kann der Rahmen unter 150 € fallen).
- Label 30 €: „Ende der 50-%-Stufe" (Befund 1.3.5).

**Tests:** `avdBeitragsstufen.test.ts` — Stufenwerte 10/30/150 bei
Default-Regeln; Vertragsrahmen 525/500/475 bei 0/1/2 Kindern; 508,33 € bei
offenem Berufseinsteigerbonus; Entfernen überzähliger Stufen; keine Literale im
Modul (Regression gegen den P0).

**Invariante:** „Statutory values hardcoded outside `src/rules/`" (P0).
**Fläche:** noch keine.

### PR 4 — Vergleichsmodus: `AltersvorsorgedepotInputs` umbauen

**Ändert:** `src/features/inputs/AltersvorsorgedepotInputs.tsx`.

1. Primärfeld wird der Eigenbeitrag. Angezeigt wird
   `avdFunding.monthlyOwnContribution` (also der aus dem Anker abgeleitete,
   simulationsgleiche Wert) — **nicht** `assumptions.…monthlyOwnContribution`
   (Befund 1.2).
2. Änderung schreibt über `solveAnchorForAvdOwn` (PR 1) in
   `onSyncMonthlyContribution`.
3. Darunter das Ledger: Eigenbeitrag → Grundzulage → Kinderzulage →
   Berufseinsteigerbonus → Günstigerprüfung → **Netto-Aufwand nach Steuer**,
   alle Werte direkt aus `avdFunding`, keine Nachrechnung im Panel
   (Befunde 1.3.3 / 1.3.4).
4. Der Hinweistext nennt ausdrücklich, dass dieser Netto-Aufwand der
   Vergleichsbetrag **aller** Produkte ist, nicht nur des ETF (Befund 1.2).
5. Sichtbar bleiben: Kinder, beide Berechtigungs-Checkboxen, Auszahlungsform,
   und je nach Auszahlungsform Rentenfaktor bzw. Entnahmeplan-Endalter
   (Lücke 1.4).
6. Unter „Erweitert" wandern: Produktvariante samt Garantie-Hinweis,
   Aktienanteil, Sicherheitsrendite, Teilkapital, Übertragungskosten, andere
   Renteneinkommen, Kostenblock.
7. `validateAvdPayoutAge`-Warnung und `cappedAtContractMax`-Warnung bleiben.
8. QA-Target `inputs.avd.monthlyNetCost` → `inputs.avd.monthlyOwnContribution`.

**Tests:**
- neu `AltersvorsorgedepotInputs.test.tsx`: Stufe klicken → `onSyncMonthlyContribution`
  mit dem Anker aus PR 1; Ledger-Werte stammen aus `avdFunding`; Erweitert-Felder
  initial eingeklappt; Rentenfaktor/Endalter je nach Auszahlungsform.
- `coverage.test.tsx:801` auf die neue Target-ID ziehen (Befund 1.5).

**Invariante:** Fair-Comparison-Invariante (Compare-Mode); UI-Rundungsgrenze.
**Fläche:** `/eingaben/produkte`, AVD-Produktzeile.

### PR 5 — Kombi-Modus und Bestandsaufnahme

**Ändert:** `src/features/produkte/instances/AltersvorsorgedepotInstanceInputs.tsx`
und die AVD-Karte in `src/features/inventory/InstanceCard.tsx`.

- Beide ersetzen ihr generisches Eigenbeitragsfeld (heute `min 0 / max 5000 /
  step 10`, ohne Bezug zu den gesetzlichen Grenzen) durch die kompakte Variante
  desselben Controls mit denselben Beitragsstufen. Genau das ist der Punkt aus
  Audit-Abschnitt „Proposed frontend model": gleiche Semantik auf allen drei
  Flächen.
- **Kein** Anker im Kombi-Modus — dort ist `monthlyOwnContribution` ein echter
  Eingabewert pro Instanz. `solveAnchorForAvdOwn` wird hier nicht benutzt.
- Beitragsfreie Verträge (`status === 'paid_up'`) bleiben deaktiviert, inklusive
  Slider und Karten.
- Bestandsaufnahme: Leitfrage „Wie viel zahlst du selbst ein?", zwei Karten
  (30 € / 150 €) plus Slider, Evidence-Badge unverändert.

**Tests:** `AltersvorsorgedepotInstanceInputs`-Test für Stufenwahl und
`paid_up`-Deaktivierung; `InventoryWizard`-Regressionstest, dass der Draft den
Eigenbeitrag korrekt in die Instanz überträgt.

**Invariante:** `PRODUCT_REGISTRY` / `inventoryProductRegistry` als einzige
Quelle der Produktidentität — die neuen Felder hängen an den bestehenden
Registry-Einträgen, es kommt keine Produktliste dazu.
**Fläche:** Kombi-Modus-Instanz-Editor, Bestandsaufnahme-Assistent Schritt 2.

### PR 6 — optional: weitere begrenzte Werte

Erst nach PR 5 bewerten. Kandidaten laut Audit: Aktienanteil, Teilkapital,
Renteneintrittsalter, Auszahlungsquote. Ausdrücklich **nicht**: Gehalt,
aktueller Vertragswert, belegbasierte Werte — die bleiben reine Zahlenfelder.

---

## Reihenfolge und Abhängigkeiten

```
PR 1 (Anker-Suche) ─┐
PR 2 (Primitive)  ──┼─→ PR 4 (Vergleichsmodus) ─→ PR 5 (Kombi + Wizard) ─→ PR 6
PR 3 (Stufen)     ──┘
```

PR 1–3 sind unabhängig voneinander und parallelisierbar. PR 4 ist der einzige
PR mit Risiko für bestehende Nutzer und sollte allein reviewt werden.

## Berührte Dateien im Überblick

| Datei | PR | Art |
|---|---|---|
| `src/utils/syncContributions.ts` | 1 | erweitern |
| `src/utils/syncContributions.test.ts` | 1 | neu/erweitern |
| `src/ui/RangeNumberField.tsx` + Test | 2 | neu |
| `src/ui/forms.css`, ggf. `src/App.css` | 2 | erweitern |
| `src/features/inputs/avdBeitragsstufen.ts` + Test | 3 | neu |
| `src/features/inputs/AltersvorsorgedepotInputs.tsx` + Test | 4 | umbauen |
| `src/features/qa-feedback/__tests__/coverage.test.tsx` | 4 | Target-ID ziehen |
| `src/features/produkte/instances/AltersvorsorgedepotInstanceInputs.tsx` | 5 | umbauen |
| `src/features/inventory/InstanceCard.tsx` (AvdCard) | 5 | umbauen |

Nicht angefasst: `src/engine/altersvorsorgedepot.ts` (die benötigten Helfer
`maxAvdMonthlyOwnContribution`, `solveAvdOwnFromNet`, `calculateAvdFunding`
existieren bereits), `src/rules/*`, alle Oracle-Snapshots.
