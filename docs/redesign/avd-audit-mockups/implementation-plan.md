# AVD-Beitragseingabe — Audit der Referenzmockups + Umsetzungsplan

**Datum:** 2026-08-02
**Grundlage:** [`docs/finanzfluss-avd-frontend-audit.md`](../../finanzfluss-avd-frontend-audit.md) und die Mockups in diesem Ordner.
**Status:** Plan — noch nichts implementiert.
**Revision 3** — nach zwei unabhängigen Gegenreviews (siehe 1.8).

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

`useSimulationResult` ([src/app/useSimulationResult.ts:45](../../../src/app/useSimulationResult.ts)) berechnet in einem `useMemo` über
`[profile, assumptions]` — also bei jeder Eingabeänderung — alle
Produktbeiträge neu aus dem einen Anker `equalInputAmountEUR`:

```ts
activeAssumptions = syncMonthlyContributions(equalInputAmountEUR, assumptions, profile, rules)
```

`syncMonthlyContributions` ([src/utils/syncContributions.ts](../../../src/utils/syncContributions.ts)) löst daraus per Bisektion
`bav.monthlyGrossConversion`, `basisrente.monthlyGrossContribution`,
`altersvorsorgedepot.monthlyOwnContribution` und `riester.monthlyOwnContribution`.

Folge: **`assumptions.altersvorsorgedepot.monthlyOwnContribution` ist im
Vergleichsmodus kein Eingabewert, sondern ein abgeleiteter Wert.** Ein direkt
hineingeschriebener Wert bliebe zwar im State und im localStorage stehen
([useCalculatorState.ts:96](../../../src/app/useCalculatorState.ts)), würde aber von
`activeAssumptions` sofort verdeckt und beim nächsten
`setSyncedMonthlyContribution` bzw. beim `harmonizeOnLoad` nach einem Reload
([useCalculatorState.ts:57](../../../src/app/useCalculatorState.ts)) überschrieben. Ein simples
Feld-Tauschen (Netto-Aufwand raus, Eigenbeitrag rein) funktioniert deshalb nicht.

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

Sichtbar wird die Drift nicht sofort: `NumberField` rendert
`Number(value.toFixed(decimals))` ([NumberField.tsx:99](../../../src/ui/NumberField.tsx)), 149,728
erscheint also als „150". Die realen Symptome sind (a) die Beitragsstufen-Karte
wählt sich selbst ab, sobald die Auswahl per `===` geprüft wird — genau das tut
das Mockup —, und (b) ab etwa 300 € wird die Drift auch bei 0 Nachkommastellen
sichtbar (300 → 298).

**Zweite Folge, die in die Copy muss:** ein Klick auf eine AVD-Beitragsstufe
schreibt den globalen Anker um und damit alle anderen Produkte. Gemessen:
Anker 200 € → bAV-Brutto 352,89 €, Basisrente 314,09 €, Riester 249,50 €.
Nach Klick auf AVD-Stufe 150 € (Anker 122,58 €) → bAV-Brutto 222,78 €,
Basisrente 194,75 €, Riester 172,92 €. Das ist im Einklang mit der
Fair-Comparison-Invariante und mit dem Mockup-Hinweis („wird automatisch
übernommen"), aber die aktuelle Formulierung erwähnt nur ETF.

#### Der Umsetzungsweg

Zwei Wege wurden geprüft. **Weg B ist der richtige**; Weg C ist verworfen.

**Verworfen — Weg C: Anker-Rückwärtssuche.** Der Anker bliebe die einzige
Wahrheit, ein Helper `solveAnchorForAvdOwn` würde per Bisektion über
`syncMonthlyContributions` denjenigen Anker suchen, der den gewünschten
Eigenbeitrag liefert. Das scheitert an zwei Plateaus, die eine grobe
25er-Abtastung übersieht:

1. **Förderschwelle bei 120 €/Jahr.** `calculateAvdFunding` gewährt den §10a-
   Steuervorteil auch *unterhalb* des Mindestbeitrags — die Eligibility-Prüfung
   sitzt nur in den Zulagen (`computeBasicAllowance`,
   [altersvorsorgedepot.ts:58](../../../src/engine/altersvorsorgedepot.ts)), nicht in der
   Günstigerprüfung. Gemessen springt der Netto-Aufwand deshalb:
   `net(9,99 €) = 6,24 €`, `net(10 €) = 9,42 €`. Anker zwischen 6,24 € und
   9,42 € haben **kein Urbild**; alle Anker von 6,25 € bis 9,00 € liefern
   `own = 10,0000`.
2. **AltZertG-Deckel.** Ab Anker ≈ 502,58 € liefert jeder Anker `own = 525,0000`
   (Clamp in [syncContributions.ts:56](../../../src/utils/syncContributions.ts)).

Bisektion konvergiert dort zwar, die Lösung ist aber nicht eindeutig — und die
gewählte Lösung verletzt genau die Invariante, die der PR zu wahren behauptet:
für Ziel 10 € fand die Suche Anker **7,14 €**, während der AVD real **9,42 €**
netto kostet. Alle anderen Produkte würden also 7,14 € investieren.
Ausgerechnet an den beiden Karten, die die Oberfläche am prominentesten
bewirbt (Mindestbeitrag und Vertragsrahmen), wäre der Vergleich unfair.

**Gewählt — Weg B: Eigenbeitrag festschreiben, Anker bei jedem Sync neu ableiten.**

- Neues Feld in `ScenarioAssumptions`, als **diskriminierte Union**, nicht als
  `ProductId`:

  ```ts
  contributionInput?: { kind: 'net' } | { kind: 'avd-own'; monthlyOwn: number }
  ```

  Ein generisches `ProductId` wäre ein Fußangel: `'bav'` als Origin würde ETF
  und Versicherung vom Anker abkoppeln, weil beide `bavFunding.monthlyNetCost`
  konsumieren ([products/etf.ts:27](../../../src/engine/products/etf.ts),
  [products/insurance.ts:35](../../../src/engine/products/insurance.ts)), und `'etf'` /
  `'versicherung'` / `'grv'` haben gar kein editierbares Beitragsfeld. Heute
  gibt es genau einen sinnvollen Wert; die Union lässt sich später erweitern.
- Fehlt das Feld (alle Bestandsstände, alle Share-Links), gilt `{ kind: 'net' }`
  — Verhalten exakt wie heute.
- **Der Fixpunkt gehört in `syncMonthlyContributions` hinein, nicht an die
  Schreibstelle.** Bei `kind: 'avd-own'` leitet der Sync den Anker bei *jedem*
  Aufruf aus `monthlyOwn` ab; `equalInputAmountEUR` wird zum abgeleiteten
  Anzeige-/Cache-Wert. Damit ziehen alle fünf Aufrufer automatisch mit
  ([useSimulationResult.ts:47](../../../src/app/useSimulationResult.ts),
  [useAngabenState.ts:532](../../../src/app/useAngabenState.ts),
  [buildAllProductsSimulation.ts:44](../../../src/app/buildAllProductsSimulation.ts),
  [api/comparison.ts:198](../../../src/api/comparison.ts), `harmonizeOnLoad`).

  **Warum das der Kern ist:** würde der Anker nur beim Klick berechnet und
  gespeichert, veraltet er. Gemessen: `own = 150` festschreiben (Anker 122,75 €),
  danach das Gehalt um 20 000 € erhöhen → der echte AVD-Netto fällt auf
  **113,08 €**, während alle anderen Produkte weiter die gespeicherten
  **122,75 €** investieren. **9,67 €/Monat Fairness-Lücke**, dauerhaft, über
  Speichern und Neuladen hinweg. Das ist exakt der Fehler, wegen dem Weg C
  verworfen wurde — nur über das State-Modell wieder hereingeholt.
- Ebenfalls in den Sync gehört das **Nachklemmen gegen
  `maxAvdMonthlyOwnContribution`**: wer 525 € festschreibt und danach zwei
  Kinder erfasst, überschreitet den auf 475 € gefallenen Rahmen. Der heutige
  Clamp sitzt im Rücklöse-Pfad ([syncContributions.ts:56](../../../src/utils/syncContributions.ts)),
  den der Origin-Zweig gerade überspringt.
- Die Gehaltsbasis hängt selbst vom Anker ab, der Anker ist also ein Fixpunkt
  `a = net_{salary(a)}(own)` — gelöst vorwärts, **keine** Inversion, deshalb
  keine Unstetigkeit und keine unerreichbaren Ziele.

Gemessen:

| Eigenbeitrag | Anker | Iterationen | selbstkonsistent | Zeit |
|---:|---:|---:|---|---:|
| 10 € | 9,2500 € | 1 | ja | 1,3 ms |
| 30 € | 27,9167 € | 2 | ja | 0,1 ms |
| 150 € | 122,7500 € | 2 | ja | 0,3 ms |
| 300 € | 274,5000 € | 3 | ja | 0,2 ms |
| 525 € | 500,6667 € | 2 | ja | 0,2 ms |
| 9 € (unter Mindestbeitrag) | 5,5833 € | 2 | ja | 0,1 ms |

Der Eigenbeitrag trifft exakt, es gibt keine unerreichbaren Ziele und keine
Plateaus. Zum Vergleich an den beiden kritischen Karten: Weg C hätte bei
10 € den Anker auf 7,14 € gesetzt (statt 9,25 €) und bei 525 € auf 502,58 €
(statt 500,67 €) — einmal zu niedrig, einmal zu hoch.

**Aber: die Iteration konvergiert nicht überall.** Dichter Sweep
(own = 0…525 in 2,5er-Schritten, Default-Profil): **30 von 211 Punkten (14,2 %)**
erreichen die Toleranz 1e-6 nie, sondern laufen in einen 2-Zyklus mit
Amplitude **exakt 1/12 € = 0,0833**:

```text
own=35:   31,8333 ↔ 31,7500
own=55:   47,4167 ↔ 47,3333
own=72,5: 61,2083 ↔ 61,1250
```

Ursache: `floorEuro(zvE)` quantisiert die Jahres-Steuerersparnis in
1-€-Schritten, `f(a)` ist also eine Treppenfunktion; liegt der Fixpunkt auf
einer Stufenkante, springt die Iteration ewig zwischen den zwei Nachbartritten.
Die sechs ursprünglich getesteten Punkte lagen zufällig alle auf Tritten. Das
zweite Review fand dieselben Zyklen bei anderen Gehältern (30 000 €, 69 750 €,
101 400 €) — das Phänomen ist nicht profilspezifisch.

Divergenz gibt es nicht: der Fehler bleibt in jedem gemessenen Fall unter
0,0833 € und ist bei Anzeige mit 0 Nachkommastellen unsichtbar. Aber der Solver
muss das **explizit** behandeln:

- Toleranz **> 1/12 €**. Gemessen reicht 0,05 € **nicht** — bei 0,05 fallen
  weiterhin alle 30 Punkte durch. Also ≥ 0,09 €, oder besser:
- **Zykluserkennung**: wiederholt sich ein Iterat, abbrechen und den *größeren*
  der beiden Werte nehmen. Der größere Anker unterschätzt den AVD-Netto nicht —
  die Richtung, in der ein Restfehler die Fair-Comparison-Invariante nicht
  verletzt.
- Der Test „Selbstkonsistenz" darf **nicht** auf `===` prüfen (siehe PR 1).

Zusätzlicher Vorteil gegenüber Weg C: der gewählte Eigenbeitrag ist
**persistent**. Bei Weg C wäre nur der Anker gespeichert; jede spätere Änderung
an Gehalt, bAV, Kindern oder Berechtigung hätte den Eigenbeitrag stillschweigend
von der gewählten Stufe weggezogen.

**Invariante — ehrlich formuliert.** Die P1-Invariante in CLAUDE.md lautet
konkret: ETF und Versicherung investieren `bavFunding.monthlyNetCost`. Das
bleibt mechanisch erfüllt. Sie ist aber **keine Konstruktionsgarantie**, sondern
eine *numerische Nachbedingung* des Solvers — deshalb der Regressionstest in
PR 1. Und CLAUDE.md sagt zusätzlich „There is no 'custom amount' toggle in
compare-mode"; `contributionInput` ist bei wörtlicher Lesart genau das. Der
Satz muss in **derselben** PR angepasst werden, sonst blockt der nächste
P1-Review zu Recht.

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

### 1.6 Weitere Fallstricke (aus dem Gegenreview)

1. **Kinder haben zwei Quellen — und die Eingabe im AVD-Panel verliert.**
   `buildContext` reicht `{ profile }` an `calculateAvdFunding`
   ([simulationContext.ts:231](../../../src/engine/simulationContext.ts)); die Funktion
   überschreibt dann `eligibility.eligibleChildren` mit
   `childBirthYearsUnder25InYear(profile.childBirthYears, …)`
   ([altersvorsorgedepot.ts:200](../../../src/engine/altersvorsorgedepot.ts)). Gemessen: mit
   `eligibleChildren = 2` und leerem `profile.childBirthYears` liefert die
   Funktion **600 € Kinderzulage ohne** und **0 € mit** Profil-Option — das
   Profil gewinnt. `syncMonthlyContributions`, `solveAvdOwnFromNet` und
   `maxAvdMonthlyOwnContribution` benutzen dagegen `eligibility.eligibleChildren`.
   Das Feld ist damit aber **nicht bloß wirkungslos — es ist schlimmer**:
   `solveAvdOwnFromNet` und `maxAvdMonthlyOwnContribution` reichen die
   Profil-Option *nicht* durch ([altersvorsorgedepot.ts:300](../../../src/engine/altersvorsorgedepot.ts),
   [syncContributions.ts:51](../../../src/utils/syncContributions.ts)) und benutzen weiter die
   Panel-Zahl. Der gelöste Beitrag und der Vertragsrahmen richten sich also nach
   der einen Quelle, die angezeigte Förderung nach der anderen. Zwei Teile
   derselben Oberfläche rechnen mit unterschiedlichen Rechtstatsachen.
   **Vor der Stufen-PR zu entscheiden:** Welche Quelle ist kanonisch? Danach
   müssen *beide* Pfade sie benutzen.

2. **Live-Rechnen am Slider ist nicht gratis.** Die 2,4 ms für 40 Sync-Läufe
   messen nur den Solver. Jeder Anker-Schreibvorgang löst zusätzlich die volle
   `simulateRetirementComparison` **plus 1 000 Monte-Carlo-Läufe** aus
   (`monteCarlo.enabled: true, runs: 1_000`,
   [defaultScenario.ts:128](../../../src/data/defaultScenario.ts)). Der Slider muss lokal
   ziehen und erst beim Loslassen committen — das ist in PR 2 zu entscheiden,
   nicht in PR 4 zu entdecken.

3. **Der globale Ankerwert wird sichtbar „krumm".** `NettoBelastungControl` in
   Schritt 1 zeigt `equalInputAmountEUR`. Nach Klick auf die 150-€-Stufe steht
   dort 122,75 €. Das ist rechnerisch richtig, braucht aber eine Erklärung.

4. **QA-Screenshot-Schwärzung.** `NumberField` setzt `data-qa-sensitive="true"`
   per Default ([NumberField.tsx:95](../../../src/ui/NumberField.tsx)). Slider-Position,
   ausgewählte Karte und `aria-valuetext` verraten den Beitrag genauso — das
   ganze `RangeNumberField` ist als sensitiv zu markieren.

5. **Fehlende Eligibility-Prüfung in der Günstigerprüfung → eigener
   Engine-Bug, nicht UI-Copy.** Beide Reviews kommen zum selben Schluss, und der
   klare Beleg ist nicht der Mindestbeitrag, sondern die Berechtigung selbst:
   mit `directlyEligible: false, indirectSpouseEligible: false` und 150 €/Monat
   liefert `calculateAvdFunding` **Zulagen 0 €, aber Günstigerprüfung
   +684 €/Jahr**. Jemand außerhalb des begünstigten Personenkreises bekommt
   einen §10a-Abzug, den §10a Abs. 1 EStG nicht vorsieht.
   Der Unterschreitungs-Fall (unter 120 €/Jahr) ist der weichere Bruder und
   möglicherweise legal korrekt — `ALTERSVORSORGEDEPOT_2027_RESEARCH.md:55-61`
   und `:165-175` legen nahe, dass der Mindestbeitrag die *Zulage* gattert, nicht
   den Sonderausgabenabzug. Das Forschungsdokument entscheidet, nicht die
   Intuition.
   **Separat als Engine-Issue geführt** (Wrong-number-Preflight, eigener PR,
   Oracle-Guardrail). Weg B ist gegen den Ausgang unempfindlich, weil er nicht
   invertiert — der Plan hängt nicht daran. Nur die Ledger-Copy für den
   berechtigten Unter-Minimum-Fall wartet auf das Ergebnis.
   Es gibt heute **keinen** Funding-Regressionstest unterhalb der Schwelle
   ([products/altersvorsorgedepot.test.ts:23](../../../src/engine/products/altersvorsorgedepot.test.ts)).

6. **Commit-Semantik ändert sich.** Heute synchronisiert das Netto-Feld bei
   *jedem Tastendruck* ([AltersvorsorgedepotInputs.tsx:108](../../../src/features/inputs/AltersvorsorgedepotInputs.tsx),
   `NumberField` `onChange`). Mit Commit-auf-Blur löst „150" nicht mehr
   zwischendurch bei „1" und „15" aus. Das ist eine Verbesserung, aber eine
   Verhaltensänderung — nicht „Semantik bewahren".

**Korrektur (Revision 3):** In Revision 2 stand hier, Export, Share-URL,
Scenario-Library und `workers/simulate` seien nicht betroffen. **Das war falsch.**
Beide Export- und API-Pfade rufen denselben Sync auf:
[buildAllProductsSimulation.ts:44](../../../src/app/buildAllProductsSimulation.ts) (CSV/Print) und
[api/comparison.ts:198](../../../src/api/comparison.ts) (Simulate-Worker). Sobald der Sync das
neue Feld kennt, sind beide betroffene Flächen und brauchen eine
Vertragsentscheidung plus Tests — der Worker-Validator
([api/validation.ts](../../../src/api/validation.ts)) prüft es heute nicht.

Ebenfalls betroffen und in Revision 2 übersehen: der Compare-Modus wird durch
den v2-Workspace projiziert. `WorkspaceAssumptionsV2` führt den Anker separat
([domain/workspace.ts:40](../../../src/domain/workspace.ts)), und sowohl
`singletonViewOfWorkspace` ([portfolioProjection.ts:556](../../../src/engine/portfolioProjection.ts))
als auch `projectSingletonAssumptionsToWorkspace`
([useAngabenState.ts:175](../../../src/app/useAngabenState.ts)) kopieren die Felder **einzeln
und namentlich**. Ein neues Feld verschwindet dort stillschweigend, wenn es
nicht in allen drei ergänzt wird.

Weiterhin **nicht** betroffen: Recommender (setzt `monthlyOwnContribution` auf
Engine-Ebene), Monte-Carlo-Verteilung, Oracle-Snapshots,
`printReportRows.ts` (sagt bereits „Eigenbeitrag pro Monat").

### 1.7 Noch offene Fallstricke (aus dem zweiten Gegenreview)

1. **Ausgeblendetes AVD steuert weiter den Vergleich.** Produkt-Entfernen
   filtert nur `visibleProducts`
   ([ProdukteEingabenPanel.tsx:299](../../../src/features/produkte/ProdukteEingabenPanel.tsx)); der Sync läuft
   *vor* dem Filtern ([useSimulationResult.ts:45](../../../src/app/useSimulationResult.ts)) und
   `simulateRetirementComparison` baut den Funding-Kontext bewusst auch für
   versteckte Produkte. Verlässt AVD `visibleProducts`, muss
   `contributionInput` auf `{ kind: 'net' }` zurückfallen — sonst dimensioniert
   ein unsichtbares Produkt alle sichtbaren.
2. **Zurückschalten auf `net` betrifft mehr als das Schritt-1-Feld.**
   `BavInputs`, `BasisrenteInputs` und `RiesterInputs` rufen denselben
   Ein-Argument-Callback `onSyncMonthlyContribution`. Wer dort etwas eingibt,
   während AVD gepinnt ist, erzeugt denselben Konflikt. Der State-Owner braucht
   eine explizite „Netto-Modus"-Aktion; eine Änderung nur in
   `AltersvorsorgedepotInputs.tsx` kann das nicht sicher umsetzen.
3. **Der Übergang muss atomar sein.** Eigenbeitrag, Modus und Anker über
   getrennte Setter zu schreiben erzeugt Zwischenrenders mit inkonsistentem
   State — und jeder davon kostet eine volle Simulation samt 1 000 MC-Läufen.
4. **Beiträge oberhalb des Vertragsdeckels haben ungeklärte Semantik.** Das
   Funding deckelt den Vertragszufluss, berechnet den Netto-Aufwand aber aus dem
   vollen Eigenbeitrag ([altersvorsorgedepot.ts:229](../../../src/engine/altersvorsorgedepot.ts)),
   während der Simulator nur den gedeckelten Betrag investiert. Einen solchen
   Wert festzuschreiben macht einen vom Anbieter abgelehnten Beitrag zur
   Vergleichsbasis. Braucht eine Policy-Entscheidung, nicht nur einen Test.
5. **QA-Target-IDs sind nicht geschwärzt.** `data-qa-sensitive` verpixelt nur
   den Screenshot ([capture/redact.ts:36](../../../src/features/qa-feedback/capture/redact.ts)); Target-ID
   und sichtbarer Text landen unredigiert im Report
   ([report/buildMarkdown.ts:52](../../../src/features/qa-feedback/report/buildMarkdown.ts)). Ein Target
   `…stufe.<value>` würde den Beitrag also exportieren. Die Stufen-Targets
   dürfen den Wert **nicht** kodieren — Index statt Betrag.
6. **`<label htmlFor>` kann nicht zwei Controls beschriften**, und `NumberField`
   rendert bereits sein eigenes umschließendes `<label>`
   ([NumberField.tsx:139](../../../src/ui/NumberField.tsx)). Ein äußeres Label erzeugt
   verschachtelte Labels. Richtig ist `fieldset` + `legend` bzw. eine
   Gruppenbeschriftung mit eigenen Labels je Control. `role="radio"`-Karten
   brauchen zusätzlich `aria-checked` und Roving-Tabindex mit Pfeiltasten —
   Buttons liefern keine Radio-Semantik.
7. **Touch-Lifecycle:** `pointerup` allein verpasst das Loslassen außerhalb des
   Elements und `pointercancel`. Pointer-Capture plus Blur-/Cancel-Fallback,
   und Tests für Drag-nach-außen, nicht nur Pfeiltasten.
8. **Der Wizard hat bereits ein Beitragsfeld.** `AvdCard` bekommt es über
   `UniversalFields` ([InstanceCard.tsx:148](../../../src/features/inventory/InstanceCard.tsx)).
   PR „Kombi + Wizard" muss es **ersetzen**, nicht ein zweites danebenstellen,
   und die Evidence-Markierung `user_confirmed` weiterführen.
9. **Das Label „Ende der 50-%-Stufe" enthält selbst eine gesetzliche Zahl.**
   Die 50 % sind `basicAllowanceTier1Rate`. Wenn schon der Betrag aus den Regeln
   abgeleitet wird, muss es der Prozentsatz auch — sonst bleibt genau der P0
   stehen, den 1.3.1 beseitigt.

### 1.8 Herkunft dieser Revision

Der Plan lief durch zwei unabhängige Gegenreviews. Beide fanden — ohne
voneinander zu wissen — dieselben drei Kernfehler: den veraltenden Anker, die
2-Zyklen der Iteration und den `mergeDeep`-Verlust des neuen Feldes. Das zweite
Review fand zusätzlich die oben stehenden Punkte 1–9 sowie die falsche Aussage
„Export/API nicht betroffen" (Korrektur in 1.6).

Erstes Review deckte auf: Plateau-Problem von Weg C, Kinder-Doppelquelle,
Slider-Kosten, QA-Schwärzung, Commit-Semantik. Zweites Review deckte auf:
Workspace-Projektion, `ProductId` zu breit, versteckte Origin, Atomarität,
Über-Deckel-Semantik, Target-ID-Leck, Label-Verschachtelung.

### 1.9 Bewusst außerhalb des Umfangs

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

Revision 3 hat die Reihenfolge umgebaut. Aus sechs PRs werden **vier plus eine
Vorbedingung**; der frühere „weitere Slider"-PR entfällt (kein konkreter
Umfang, keine Testzusage). Der frühere Zuschnitt trennte Primitive und
Konsument, wodurch PR 2 ohne Nutzer reviewt worden wäre — beide Reviews haben
das bemängelt.

### PR 0 — Vorbedingung, eigener Track: Engine/Recht

Kein Teil dieses Plans, muss aber **vorher** entschieden sein:

1. **Kanonische Kinderquelle** (Fallstrick 1.6/1). Danach müssen
   `calculateAvdFunding`, `solveAvdOwnFromNet` und
   `maxAvdMonthlyOwnContribution` dieselbe benutzen.
2. **§10a-Eligibility-Gate** (Fallstrick 1.6/5) — separates Engine-Issue,
   Wrong-number-Preflight nach CLAUDE.md, kein Oracle-Update.

Ändern sich dabei Zahlen, greifen die Cron-Guardrails 1 und 2 (Invariante
benennen, sichtbare Fläche benennen, gepaarte Compare-/Combine-Tests).

### PR 1 — State-Modell und Ankerableitung

Der größte und einzige riskante Infrastruktur-PR. Kein UI.

**Zustand**

- `contributionInput?: { kind: 'net' } | { kind: 'avd-own'; monthlyOwn: number }`
  in `ScenarioAssumptions` **und** `WorkspaceAssumptionsV2`.
- Durchreichen in: `defaultAssumptions`, `defaultWorkspace`, v1→v2-Migration,
  `singletonViewOfWorkspace`, `projectSingletonAssumptionsToWorkspace`,
  `scenarioSchema`, `urlShare`, `api/validation.ts`.
- **Expliziter Post-Merge-Carry in `migrateAndValidateState`.** `mergeDeep`
  iteriert nur `Object.keys(defaults)` und übernimmt Primitive nur bei
  Typgleichheit ([storage.ts:60](../../../src/storage.ts)) — ein optionales Feld geht
  sonst beim Laden verloren, und ein Default `undefined` hilft nicht
  (`typeof 'avd-own' !== typeof undefined`). Genau dafür gibt es den
  `compareSubMode`-Präzedenzfall ([storage.ts:130](../../../src/storage.ts)).
  Die Behauptung aus Revision 2, das Feld sei „mergeDeep-tauglich", war falsch.

**Ableitung**

- `syncMonthlyContributions` leitet bei `kind: 'avd-own'` den Anker **bei jedem
  Aufruf** aus `monthlyOwn` ab; `equalInputAmountEUR` wird Ausgabe, nicht
  Eingabe. Damit ziehen alle fünf Aufrufer automatisch mit.
- Fixpunkt-Solver mit **Zykluserkennung**: Abbruch bei Wiederholung eines
  Iterats, Rückgabe des größeren der beiden. Toleranz ≥ 0,09 € (0,05 € reicht
  gemessen nicht — Amplitude ist 1/12 €). Kein `===`-Vergleich, nirgends.
- Nachklemmen von `monthlyOwn` gegen `maxAvdMonthlyOwnContribution` im
  Origin-Zweig.
- Rückfall auf `{ kind: 'net' }`, wenn AVD `visibleProducts` verlässt.
- Keine Rundung im Rückgabewert (UI-Rundungsgrenze).

**Doku**

- Die Fair-Comparison-Absätze in `CLAUDE.md` und `CONTEXT.md` in **derselben**
  PR anpassen — insbesondere „There is no 'custom amount' toggle in
  compare-mode".

**Tests** (`src/utils/syncContributions.test.ts`, `src/storage.test.ts`)

- **Nicht-Regression:** ohne das Feld ist das Ergebnis bit-identisch zu heute
  (bAV / Basisrente / Riester).
- **Selbstkonsistenz mit Toleranz:** `|anchor − calculateAvdFunding(salary(anchor), own).monthlyNetCost| < 0,09`
  für 10 / 30 / 150 / 300 / 525 €. Das ist der Regressionstest gegen den
  Weg-C-Fehler.
- **Anti-Stale:** pinnen, dann Gehalt / Kinder / bAV ändern → Anker zieht mit,
  Lücke bleibt unter Toleranz. Der Test, der den 9,67-€-Fehler fängt.
- **Zyklus:** mindestens ein bekannter Zykluspunkt (own = 35) terminiert
  deterministisch.
- **Sweep** über Gehälter (0 / 12k / 30k / 69 750 / 95k / 101 400 / 250k) —
  kein Fall divergiert, keiner überschreitet die Toleranz.
- **Deckel:** pin 525 € → zwei Kinder erfassen → Nachklemmen auf 475 €.
- **Sichtbarkeit:** AVD aus `visibleProducts` → Modus fällt auf `net` zurück.
- **Storage:** Round-Trip durch `migrateAndValidateState`, Scenario-Library,
  Share-URL und v2-Projektion; Altstand ohne Feld lädt unverändert.

**Invariante:** Fair-Comparison (Compare-Mode) — als numerische Nachbedingung
getestet, nicht als Konstruktionsbehauptung.
**Fläche:** noch keine sichtbare; Export- und API-Ausgabe ändern sich nur, wenn
das Feld gesetzt ist.

### PR 2 — `RangeNumberField` **mit** AVD-Beitragsstufen

Zusammengelegt, damit das Primitive mit echtem Konsumenten reviewt wird.

**Neu:** `src/ui/RangeNumberField.tsx`, `src/features/inputs/avdBeitragsstufen.ts`,
je mit Test.

- `buildAvdBeitragsstufen(rules, effectiveEligibility)` — Werte **und
  Prozentsätze** aus `rules.altersvorsorgedepot` abgeleitet
  (`minimumOwnContributionAnnual / 12`, `basicAllowanceTier1MaxContribution / 12`,
  `basicAllowanceTier2MaxContribution / 12`, Label-Prozent aus
  `basicAllowanceTier1Rate`), Obergrenze über `maxAvdMonthlyOwnContribution`.
  Stufen über dem Rahmen und Duplikate entfallen.
- Slider zieht auf lokalem State, committet erst beim Loslassen —
  Pointer-Capture, `pointercancel`- und Blur-Fallback. Grund: jeder Commit
  kostet Simulation + 1 000 MC-Läufe.
- Karten-Auswahl über Toleranz, nie `===`.
- A11y: `fieldset` + `legend`, **kein** äußeres `<label htmlFor>` (NumberField
  bringt sein eigenes mit), Karten mit `aria-checked` + Roving-Tabindex,
  `aria-valuetext` mit Einheit.
- QA: ganzes Control `data-qa-sensitive`; Stufen-Targets tragen den **Index**,
  nicht den Betrag.
- CSS mit vorhandenen Tokens; `--rw-positive` / `--rw-rule-faint` in
  `src/App.css` ergänzen.

**Tests:** Stufenwerte gegen Regeln (auch mit offenem Berufseinsteigerbonus und
mittelbarer Berechtigung); keine gesetzlichen Literale im Modul; Tastatur;
Drag-nach-außen und `pointercancel`; Karten-Toleranz; QA-Targets ohne Betrag.

**Invariante:** „Statutory values hardcoded outside `src/rules/`" (P0) +
UI-Rundungsgrenze.
**Fläche:** noch keine.

### PR 3 — Vergleichsmodus

**Ändert:** `AltersvorsorgedepotInputs.tsx`, der State-Owner
(`useAngabenState` / `useCalculatorState`), `NettoBelastungControl` bzw.
`AngabenAnnahmenSection`.

1. Primärfeld ist der Eigenbeitrag, angezeigt aus
   `avdFunding.monthlyOwnContribution`.
2. Änderung setzt Eigenbeitrag und Modus **atomar in einer Aktion** — nicht
   über getrennte Setter.
3. Ledger ausschließlich aus `avdFunding`; Copy sagt, dass der Netto-Aufwand die
   Vergleichsbasis **aller** Produkte ist.
4. Sichtbar bleiben Kinder, beide Berechtigungs-Checkboxen, Auszahlungsform und
   je nach Auszahlungsform Rentenfaktor bzw. Entnahmeplan-Endalter.
5. Unter „Erweitert": Produktvariante samt Garantie-Hinweis, Aktienanteil,
   Sicherheitsrendite, Teilkapital, Übertragungskosten, andere Renteneinkommen,
   Kosten.
6. Beide Warnungen (`validateAvdPayoutAge`, `cappedAtContractMax`) bleiben.
7. Zurück auf `{ kind: 'net' }` bei Eingabe im globalen Netto-Feld **und** in
   `BavInputs` / `BasisrenteInputs` / `RiesterInputs`.
8. QA-Target `inputs.avd.monthlyNetCost` → `inputs.avd.monthlyOwnContribution`.

**Tests:** Integrationstest auf dem tatsächlichen `monthlyUserCost` je Produkt
(nicht nur auf dem Callback); Reset über das globale Feld; Reset über ein
anderes Produktfeld; Verhalten bei ausgeblendetem AVD; CSV-/Print-Ausgabe;
`coverage.test.tsx` auf die neue Target-ID.

**Invariante:** Fair-Comparison (Compare-Mode).
**Fläche:** `/eingaben/produkte`, AVD-Zeile; CSV- und Print-Export.

### PR 4 — Kombi-Modus und Bestandsaufnahme

**Ändert:** `AltersvorsorgedepotInstanceInputs.tsx`, `InstanceCard.tsx`
(`AvdCard`).

- Beide bekommen die kompakte Variante desselben Controls mit denselben Stufen.
  **Kein** Anker, kein `contributionInput` — im Kombi-Modus ist
  `monthlyOwnContribution` ein echter Eingabewert pro Instanz.
- Der Wizard muss das vorhandene `UniversalFields`-Beitragsfeld **ersetzen**,
  nicht danebenstellen, und `monthlyContribution` weiter als `user_confirmed`
  markieren.
- `paid_up` deaktiviert Slider und Karten.
- **Bestandsdaten:** das heutige Feld erlaubt `max 5000` gegen einen Rahmen von
  ~525 €. Gespeicherte Instanzen darüber nicht stillschweigend kappen — Slider
  endet am Rahmen, Zahlenfeld nicht, `cappedAtContractMax` erklärt es.
- Semantik oberhalb des Deckels (Fallstrick 1.7/4) muss vorher entschieden sein.

**Tests:** Stufenwahl; `paid_up`; Altbestand über dem Rahmen; Wizard-Draft →
Instanz mit Evidence; Mobile/Touch.

**Invariante:** Registry als einzige Quelle der Produktidentität.
**Fläche:** Kombi-Instanz-Editor, Bestandsaufnahme Schritt 2.

---

## Reihenfolge

```text
PR 0 (Engine/Recht, eigener Track)
   └─→ PR 1 (State + Anker) ─┐
       PR 2 (Control+Stufen) ─┼─→ PR 3 (Vergleichsmodus)
                             └─→ PR 4 (Kombi + Wizard)
```

PR 1 und PR 2 sind parallelisierbar. PR 3 braucht beide, PR 4 nur PR 2.
PR 3 und PR 4 sind parallel, tragen aber beide Nutzerrisiko und werden einzeln
reviewt.

**Vor dem Start zu klären:** kanonische Kinderquelle (PR 0/1), §10a-Gate
(PR 0/2), Semantik oberhalb des Vertragsdeckels (PR 4).

## Berührte Dateien

| Datei | PR | Art |
|---|---|---|
| `src/domain/` (`ScenarioAssumptions`), `src/domain/workspace.ts` | 1 | Feld |
| `src/utils/syncContributions.ts` (+ Test) | 1 | Kern |
| `src/storage.ts`, `src/utils/scenarioSchema.ts`, `src/utils/urlShare.ts` | 1 | Carry + Validierung |
| `src/engine/portfolioProjection.ts`, `src/app/useAngabenState.ts` | 1 | Projektion |
| `src/api/validation.ts` | 1 | Worker-Vertrag |
| `CLAUDE.md`, `CONTEXT.md` | 1 | Invariantentext |
| `src/ui/RangeNumberField.tsx` (+ Test), `src/ui/forms.css`, `src/App.css` | 2 | neu |
| `src/features/inputs/avdBeitragsstufen.ts` (+ Test) | 2 | neu |
| `src/features/inputs/AltersvorsorgedepotInputs.tsx` (+ Test) | 3 | umbauen |
| State-Owner + `NettoBelastungControl` / `AngabenAnnahmenSection` | 3 | Modus-Reset |
| `src/features/qa-feedback/__tests__/coverage.test.tsx` | 3 | Target-ID |
| `src/features/produkte/instances/AltersvorsorgedepotInstanceInputs.tsx` | 4 | umbauen |
| `src/features/inventory/InstanceCard.tsx` (`AvdCard`) | 4 | ersetzen |

Nicht angefasst: `src/engine/altersvorsorgedepot.ts` (Helfer existieren),
`src/rules/*`, Oracle-Snapshots, Recommender.

**Konfliktlage:** auf dem aktuellen Branch sind `src/engine/products/altersvorsorgedepot.ts`,
`src/engine/portfolioFunding.ts`, `src/engine/simulationContext.ts`,
`src/app/recommenderCandidates/altersvorsorgedepot.ts`, `src/app/contractDecisions.ts`,
`src/App.css` und die Riester-Dateien in Arbeit. PR 1 liegt an der
Funding-Kette, PR 2 will `src/App.css` anfassen — die laufende Arbeit sollte
erst landen.
