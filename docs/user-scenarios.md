# User Scenarios — Rentenrechner UX Redesign Brief

## Why this document exists

Today the calculator assumes a **clean-slate user with a low monthly contribution** and asks them to compare ETF / bAV / pAV / Basisrente / AVD / Riester from scratch. In reality almost every German adult past their mid-twenties is already enrolled in some combination of:

- GRV (statutory) by default if employed
- A bAV from a current or previous employer (often defaulted in by HR)
- A Riester contract sold around 2008–2014
- An old private Rentenversicherung from before 2005 (Halbeinkünfte!) or after
- An ETF Sparplan they started themselves
- A Basisrente sold by their tax advisor
- Soon: an Altersvorsorgedepot (AVD) launched 2026

Because these products **interact** (bAV reduces zvE which lowers the marginal tax saving on Basisrente; Riester Mindesteigenbeitrag is a function of gross salary that bAV-Entgeltumwandlung lowers; ETF and AVD share the Sparerpauschbetrag; KV/PV pathways differ between KVdR and freiwillig), the right answer is rarely "Product X is best." It is "Given what you already have, this is the best place to put your **next** euro / next raise / windfall, and here is what your retirement income looks like with the **whole portfolio**."

The scenarios below describe ten realistic users, what they want from the tool, and the path they need through it. They are written so that future feature work (existing-portfolio entry, household mode, "next euro" recommender, payout decision wizard, etc.) can be sequenced against them. The closing capability matrix lists which capabilities each scenario stresses.

---

## Cross-cutting capabilities every scenario assumes

These are not story-specific; they are baseline UX expectations once the redesign accepts that users have history and household context.

1. **Persistent profile.** Returning users (annual check-in, after a salary change) reload their full state from the URL or local storage and see what changed since last visit.
2. **Existing-portfolio entry.** Every product can be added either as "new contract starting now" or "existing contract with these characteristics" (start year, current value, current monthly contribution, paid-up flag, fee structure if known).
3. **Baseline + scenarios.** A user always has one **baseline** (their current setup, do nothing) and one or more **what-if scenarios** (add €X to product Y, switch from A to B, retire two years later). Comparison is always baseline-vs-scenario, never scenario-vs-scenario alone.
4. **Mix-and-match within a scenario.** A scenario contains a *portfolio* (multiple active products), not a single product. The simulator accounts for cross-product effects (zvE → marginal tax → Basisrente saving; bAV deferral → Riester Mindesteigenbeitrag base; etc.).
5. **Retirement income view, not just product comparison.** End-state shows monthly net pension from all sources combined (GRV + bAV + pAV + Basisrente + AVD + Riester + ETF withdrawal) for each scenario, with a target-gap callout if the user set a Wunschnetto.
6. **One-screen recommendation.** The first thing the user sees after entering their data is a plain-language summary: "If you add €X/month, do Y; if you have a windfall of €Z, do W; your biggest risk is …".
7. **Shareable, printable, exportable.** URL share, PDF print, CSV export — already exists, must keep working through the redesign.

---

## Persona spread

The ten scenarios are deliberately spread across these axes:

| # | Name      | Age | Family       | Employment        | KV  | Income     | Portfolio depth | Trigger              |
|---|-----------|-----|--------------|-------------------|-----|------------|-----------------|----------------------|
| 1 | Anna      | 26  | single       | first job         | GKV | mid (52k)  | none            | HR onboarding        |
| 2 | Bernd     | 38  | married, 2 K | employee          | GKV | high (95k) | thick           | promotion / raise    |
| 3 | Clara     | 41  | single       | self-employed     | PKV | var (~75k) | thin            | tax advisor tip      |
| 4 | Dilan     | 34  | partner      | new employer      | GKV | mid (68k)  | two bAV         | job change           |
| 5 | Eva+Frank | 45/47 | married, 1 K | both employed   | GKV | 70k+110k   | thick           | mid-life check       |
| 6 | Gabi      | 55  | divorced     | employee          | GKV | mid (58k)  | thin + windfall | inheritance + age    |
| 7 | Hans      | 49  | married      | hospital employee | switching GKV→PKV | high (115k) | thick | PKV broker quote |
| 8 | Inge      | 60  | single       | employee          | GKV | mid (48k)  | thick           | retirement runway    |
| 9 | Jens      | 44  | married      | partner law firm  | PKV | very high (180k)| thin (only bAV maxed) | spotted tax leak |
| 10 | Karin    | 52  | single       | employee          | GKV | mid (65k)  | one old gem     | broker pitch         |
| 11 | Lena     | 33  | 2 kids       | employee, 60% part-time | GKV | low (22k) | none | Zulagen-leverage on tight budget |
| 12 | Markus   | 38  | single       | Beamter (Lehrer Bayern) | PKV | mid (65k) | none | Beamtenpension + Schicht-1 supplement |

---

## Scenario 1 — Anna, 26, Berufseinsteigerin: "Where do I even start?"

**Persona.** First job after Master's, software engineer, single, no kids, GKV. Lives in a shared flat, has €4k savings, no debt. Reads Finanztip and the r/Finanzen subreddit; knows that bAV "exists" and that ETFs are popular but does not yet understand the differences.

**Starting situation.**
- €52,000 brutto/Jahr (~€2,950 netto/Monat).
- No retirement products at all.
- HR mentioned during onboarding that the company offers a **Direktversicherung (bAV)** with **15 % statutory employer subsidy plus an additional 50 % match up to €100/Monat** Eigenbeitrag.
- She can comfortably set aside ~€200/Monat from her salary for retirement.

**Trigger.** The HR signup form for bAV is on her desk. She has 30 days to decide.

**Search intent.** She googles *"bAV oder ETF was ist besser 26 Jahre"* and lands on the calculator after an article links to it. She wants a fast, opinionated recommendation, not a 40-input form.

**First impression she needs.** A landing screen that asks two things only:
1. *"Hast du schon Verträge oder fängst du bei Null an?"* → she clicks **"Ich fange neu an."**
2. *"Was ist dein Anlass?"* → choices like *"Mein Arbeitgeber bietet bAV"*, *"Ich will einen ETF-Sparplan starten"*, *"Ich vergleiche allgemein"*.

**Path through the tool.**

1. Lands on the start screen, picks **"Mein Arbeitgeber bietet bAV"**. Tool opens a 4-question flow: age, brutto, child-status, available monthly budget.
2. She enters 26 / 52000 / 0 / €200. Tool defaults the rest from typical 26-year-old assumptions and silently sets retirement age to 67.
3. Tool asks for the **bAV offer details** (3 fields): "Was zahlt dein Arbeitgeber dazu?" with the three common patterns pre-baked (only statutory 15 %, statutory + match %, statutory + flat €). She picks "statutory + 50 % match bis €100".
4. Tool runs the simulation immediately and shows a **single-page recommendation** above the fold:
   - "Wenn du €100 in bAV gibst, bekommst du €115 Arbeitgeber-Zuschuss und sparst €X Steuern + SV. Das ist effektiv kostenlos für dich."
   - "Lege die übrigen €100 in einen ETF-Sparplan — höhere Rendite-Erwartung, voller Zugriff."
   - Plus a one-line caveat: *"Bei extrem schlechtem Marktverlauf …"*.
5. Below the fold she sees:
   - A **lifecycle chart** comparing three scenarios: (A) Alles in ETF, (B) €100 bAV + €100 ETF, (C) Alles in bAV.
   - A **monatliche Rente in Rente** bar showing her GRV + scenario contribution.
6. She clicks "Was ist mit Riester?" — tool answers in-line: *"Ohne Kinder und mit 26 Jahren ist Riester selten optimal — die Kosten sind hoch und die Förderung gering."* No need to add the product to the comparison, the answer is in plain language.
7. She copies the share-URL into a WhatsApp to her dad for a sanity check.

**Desired end-state.** She walks away with a concrete decision (€100 bAV + €100 ETF), knows roughly what to fill into the HR form, and trusts the answer enough to act on it within a week.

**Tool capabilities required.**
- Onboarding flow that branches on **"clean slate" vs "I already have things"**.
- Trigger-typed entry points (*bAV-Angebot*, *ETF starten*, *Allgemeiner Vergleich*).
- bAV-offer mini-form that maps the three common employer patterns to the existing assumption fields.
- One-page recommendation block that names a specific action (€X bAV, €Y ETF), not just a winner chart.
- In-line Q&A for products that are *not* in the comparison (Riester, Basisrente) so she does not have to add them to dismiss them.

---

## Scenario 2 — Bernd, 38, Mid-Career: "I have all this stuff; where does my next €400 go?"

**Persona.** Senior software engineer, married, two kids (4 and 6), spouse part-time. Reads finance content on lunch breaks. Comfortable with terms like *Vorabpauschale* and *Höchstrechnungszins*. Knows what he has but is not sure if it's still optimal.

**Starting situation.**
- €95,000 brutto/Jahr, GKV, Steuerklasse IV (spouse Steuerklasse IV).
- **Riester** since 2010, currently €100/Monat Eigenbeitrag inkl. Zulagen (allowances applied, not yet for the second child because the contract was sold before).
- **Old paid-up bAV** (€15,000 Deckungskapital) at his former employer's Pensionskasse.
- **Active bAV** at current employer: €150/Monat Entgeltumwandlung + €100/Monat Arbeitgeber-Zuschuss (already includes statutory 15 %).
- **ETF Sparplan** running 4 years, current depot value €28,000, €500/Monat MSCI World.
- Got promoted; net €400/Monat extra to allocate.

**Trigger.** First paycheck with the raise hits. Wants to lock in the allocation before lifestyle creep eats it.

**Search intent.** He googles *"bestehende Riester bAV ETF Optimierung 2026"*. Wants a tool that lets him **enter what he already has** and tells him where the marginal euro goes furthest.

**First impression he needs.** A clear "Ich habe schon Verträge" path that takes a portfolio inventory before showing any chart, plus a "Wo soll mein nächster Euro hin?" recommender once the inventory is in.

**Path through the tool.**

1. Picks **"Ich habe bereits Verträge"** on the landing screen.
2. Tool opens a **portfolio inventory wizard**: six product slots (GRV, bAV, pAV, Basisrente, AVD, Riester, ETF) with a checklist *"Hast du das?"*. He ticks GRV (default on), Riester, ETF, and **two** bAV (one paid-up, one active).
3. For each ticked product the tool renders a compact card asking only the fields needed to anchor the simulation:
   - **Riester:** start year (2010), current Deckungskapital (€18,500), Eigenbeitrag/Monat (€100), Zulagen-Status (auto-derived from his entered child birth years, but he overrides because the second child is not on the contract).
   - **bAV alt (paid-up):** Anbieter type (Pensionskasse), aktueller Wert (€15,000), Vertragsbeginn (2014), Durchführungsweg, **paid-up = ja**.
   - **bAV neu (aktiv):** Entgeltumwandlung (€150), AG-Zuschuss (€100), Vertragsbeginn (2022).
   - **ETF:** depot value (€28,000), Sparrate (€500/Monat), TER (0.20 %).
4. Tool computes the **Baseline** (do nothing differently) and shows an inline summary: "Aktueller Plan ergibt netto ~€2,140/Monat in Rente (Wunsch: nicht gesetzt)."
5. He clicks **"Wo lege ich €400/Monat extra an?"**. Tool offers four pre-built what-if scenarios as cards he can add or remove:
   - **A.** +€400 in seinen ETF-Sparplan (auf €900/Monat).
   - **B.** +€188 bAV Entgeltumwandlung (Rest bis §3 Nr. 63 EStG-Cap = 4 % BBG) + €212 ETF.
   - **C.** Riester pausieren, in AVD übertragen, +€400 in AVD.
   - **D.** +€400 in Basisrente (Steuer-Hebel).
6. The recommendation block names the winner ("B liefert die höchste Netto-Rente bei deinem Steuersatz, weil der bAV-Cap noch nicht ausgeschöpft ist. Riester behältst du wegen der Zulagen für die Kinder.") and explains the **interaction** ("Mehr bAV senkt zvE → der Steuerspar-Hebel von Basisrente sinkt → Szenario D verliert relativ.").
7. He toggles "Was ändert sich, wenn die Inflation 3 % statt 2 % ist?" — Monte-Carlo runs through the same four scenarios with new params.
8. Saves the winning scenario as **"Plan 2026"** in the scenario library and bookmarks the share-URL.

**Desired end-state.** Knows he should fill out a bAV-Erhöhung form for €188/Monat and bump his ETF Sparplan by €212/Monat. Understands *why* (cap headroom + tax interaction).

**Tool capabilities required.**
- **Portfolio inventory wizard** with a "do you have this?" checklist plus per-product anchor fields (start year, current value, current contribution, paid-up flag).
- Baseline auto-computed from inventory.
- **"Where does my next €X go?"** recommender that auto-generates the obvious what-if scenarios rather than making the user build them.
- Cross-product interaction surfacing in plain language ("more bAV lowers your Basisrente tax saving").
- Scenario library naming and persistence.

---

## Scenario 3 — Clara, 41, freelance UX designer: "GRV doesn't apply to me. Now what?"

**Persona.** Self-employed since 28, no Versorgungswerk (UX design is not a Pflichtkammer profession), variable income, PKV. Has been "meaning to figure this out" for three years.

**Starting situation.**
- ~€75,000 Gewinn/Jahr (variable: €50–95k).
- **PKV** (Beitrag €620/Monat KV + €60/Monat PV).
- **Old private Rentenversicherung** sold to her in 2008: €200/Monat, current Rückkaufswert ~€38,000, Garantiezins 2.25 %.
- **ETF/Geldmarkt-Sparplan ad-hoc** ~€80,000 portfolio (built up irregularly).
- **No GRV** — voluntarily opted out years ago.

**Trigger.** Her Steuerberater mentions: "Mit deiner Marge solltest du Basisrente machen, das spart dir 4-5k Steuern pro Jahr."

**Search intent.** She googles *"Basisrente Selbständig sinnvoll 2026"*. Wants a tool that **does not assume she has GRV** and that lets her plug in her existing pAV without rebuilding it from scratch.

**First impression she needs.** A clearly visible "Selbstständig" toggle that *removes* GRV and bAV from the comparison instead of leaving them as zero-filled placeholders. She also needs the tool to recognise her old contract's pre-2005-or-not status.

**Path through the tool.**

1. Onboarding: picks **"Selbstständig"** in the Beschäftigungsstatus question. Tool removes GRV-Eingabe and bAV from the product picker.
2. Picks **"Ich habe bereits Verträge"** and opens the portfolio inventory.
3. Adds the **pAV (2008)** with start year, current Rückkaufswert, monatlicher Beitrag, Garantiezins. Tool detects: contract start 2008 → §20 Abs. 1 Nr. 6 EStG, **Halbeinkünfte-Regime**, age and 12-year run-time check ✓ → marks the contract as *"halbe Einkünfte am Auszahlungsende"* in the result panel.
4. Adds her **ETF Depot** with current value €80,000 and current monthly Sparrate (she enters €0 because she sparpläne nicht regelmäßig; tool offers a "ad-hoc Einlagen" mode — see capability list below).
5. Tool computes Baseline: "Bei Status quo zahlst du 2026 ca. €X Einkommensteuer, in Rente bleiben dir netto ca. €Y/Monat aus pAV + ETF-Entnahme."
6. Now she opens **"Was-wäre-wenn: Basisrente einbauen"**. Tool generates three Basisrente scenarios at €500, €1000, €1500 monatlich, computes the marginal Steuerersparnis at her current zvE, and shows the netto-Rente effect.
7. Because her income is **variable**, she clicks the **"Stress-Test Einkommen"** button. Tool re-runs Basisrente at €40k Gewinn (low-income year) and shows that the Steuerersparnis collapses.
8. Tool surfaces the structural caveat: *"Basisrente ist nicht kapitalauszahlbar. Bei deinem unregelmäßigen Einkommen bietet ETF-Sparen auf gleicher Höhe **mehr Flexibilität bei niedrigerer Steuerförderung**. Empfehlung: Basisrente €600 (vorsichtig), Rest in ETF."*
9. Saves "Plan: Basisrente €600 + ETF" and prints to PDF for her Steuerberater meeting.

**Desired end-state.** Walks into the next Steuerberater meeting with a **printed PDF** showing two plans: aggressive Basisrente (€1500) and conservative Basisrente (€600 + ETF), with the trade-off in plain language.

**Tool capabilities required.**
- **Beschäftigungsstatus toggle** that **structurally removes** product categories (GRV, bAV) instead of zeroing them.
- Existing-pAV anchor with **automatic Halbeinkünfte/Pre-2005 detection** based on entered start year and run-time.
- **Variable-income mode** — a "stress income to €X" button that re-runs without forcing the user to rebuild scenarios.
- "Ad-hoc / unregelmäßiger Sparplan" mode for ETF depots that don't have a fixed Sparrate.
- Plain-language explanation of structural trade-offs (Basisrente has no Kapitalwahl) instead of just a number on a chart.

---

## Scenario 4 — Dilan, 34, Job Change: "What do I do with the old bAV?"

**Persona.** Mechanical engineer, switched jobs 6 months ago. New job pays better, new employer offers a Pensionskasse instead of his old Direktversicherung. Mid-knowledge — knows what bAV is, has heard of "Übertragung" but is not sure what it costs.

**Starting situation.**
- €68,000 brutto, GKV, single, no kids.
- **Old bAV (Direktversicherung, Versicherer A, 2018):** Deckungskapital €25,000, was €150/Monat Entgeltumwandlung. Currently *paid-up* (no contributions since job change).
- **New bAV (Pensionskasse, Versicherer B):** automatic Entgeltumwandlung €100/Monat + statutory 15 % AG-Zuschuss. Started 2 months ago.
- **ETF Sparplan** €200/Monat for 5 years, current value €15,000.

**Trigger.** Letter from Versicherer A asking: *"Übertragung in Ihren neuen Vertrag — bitte zurücksenden bis 30.6."*

**Search intent.** He googles *"bAV alt Übertragung neuer Arbeitgeber sinnvoll"*. Wants an answer in 5 minutes.

**First impression he needs.** A **"Job gewechselt"** trigger card on the landing screen that opens a focused 3-question wizard: old contract, new contract, decision.

**Path through the tool.**

1. Picks **"Ich habe den Job gewechselt"** on landing. Tool opens a job-change wizard.
2. **Step 1 — Old contract:** Anbieter (Direktversicherung), Vertragsbeginn (2018), Aktueller Wert (€25,000), Status (paid-up).
3. **Step 2 — New contract:** Pensionskasse, Vertragsbeginn (2026), Entgeltumwandlung (€100), AG-Zuschuss (€15 statutory).
4. **Step 3 — Frage:** Drei Karten *Alten Vertrag stehen lassen* / *In neuen Vertrag übertragen* / *Beim alten Anbieter weiterführen* (depending on whether his old employer allows it).
5. Tool computes all three over the 33-year horizon to age 67:
   - **Stehen lassen:** beide Verträge laufen separat, getrennte Auszahlung in Rente, getrennte Verwaltungsgebühren.
   - **Übertragen:** Wert €25,000 fließt als Einmal-Übertrag in den neuen Pensionskassen-Vertrag, Kostenstruktur des neuen Anbieters greift, im Rentenfall ein Vertrag.
   - **Beim alten Versicherer freiwillig weiterzahlen** (privat ohne AG-Zuschuss, oft schlechter): tool warns this kills the §3 Nr. 63 EStG benefit.
6. Recommendation block: "**Stehen lassen** ergibt €X mehr Netto-Rente, weil dein alter Vertrag bessere Garantie (2018: 0.9 % Höchstrechnungszins) hat als der neue (2026: 1.0 %, aber höhere laufende Kosten). Übertragung lohnt nur, wenn du Kontoführungs-Vereinfachung wichtiger findest als ~€Y Rente."
7. He toggles "Was wäre wenn ich €100 mehr in den neuen Vertrag stecke?" — tool adds this as a fourth scenario without losing the first three.
8. Returns the form to Versicherer A confirming "kein Wechsel".

**Desired end-state.** Has a clear, defensible answer to the letter on his desk, in under 10 minutes.

**Tool capabilities required.**
- **Multiple instances of the same product type** in one scenario (two bAV contracts, possibly more).
- A **paid-up** flag on bAV that switches the simulator to the appropriate phase (no new contributions, accumulation continues on existing capital, future Leibrente sized off the smaller capital).
- Detection of **contract-vintage assumptions** (Höchstrechnungszins by year) that surface in the recommendation, not just buried in the assumption panel.
- A **trigger-card landing** ("Job gewechselt", "Erbschaft erhalten", "Bald in Rente", …) that opens a focused wizard rather than the generic input drawer.

---

## Scenario 5 — Eva (45) and Frank (47): "Optimise as a household, not as two individuals"

**Persona.** Married couple, one kid (12), Steuerklasse IV/IV (could switch to III/V). Both employed, Frank earns notably more. Use a shared spreadsheet for budgets but neither has done a proper retirement plan.

**Starting situation.**
- **Eva:** €70,000 brutto, GKV, **bAV €150/Monat + AG-Zuschuss**.
- **Frank:** €110,000 brutto (above BBG-West for KV/PV), GKV (still under JAEG), **Riester** since 2012 with kid Zulage on his contract, €175/Monat Eigenbeitrag.
- Joint **ETF depot** €60,000, €400/Monat Sparrate, in Eva's name.
- One kid, geboren 2014.
- Wunschnetto in Rente: €4,000/Monat zusammen.

**Trigger.** A mid-life check after Eva's mum retired and they realised "we should do this too."

**Search intent.** They search *"Altersvorsorge Ehepaar gemeinsam planen"*. Want a tool that lets them plan **as a household**, not as two solo simulations they have to mentally combine.

**First impression they need.** A "**Ich plane mit Partner:in**" toggle right at the start that opens **two profile blocks** side by side and computes joint tax via Ehegattensplitting.

**Path through the tool.**

1. Toggle **"Mit Partner:in planen"** on landing. Two profile blocks appear: **Person A (Eva)** and **Person B (Frank)**.
2. Both fill their profile (age, salary, KV-Status, existing products) into their respective blocks. Kid Zulage is a household-level field, not per-person.
3. Tool computes joint zvE under **Ehegattensplitting** automatically; warns about Steuerklassen-Wahl (IV/IV vs III/V vs IV-mit-Faktor) but treats annual joint tax as the truth.
4. Baseline shows **two pension columns** side by side and a **household total** column with the Wunschnetto gap.
5. Tool flags an **inter-spouse optimisation**: *"Die Riester-Zulage für euer Kind ist auf Franks Vertrag. Auf Evas Vertrag wäre das gleiche Geld förderwirksamer (sie hat die niedrigere Steuerprogression — Zulage wirkt voll, ohne dass die Sonderausgaben-Günstigerprüfung zu Frank's Gunsten ausfällt)."* Plus a note about Riester-Übertragung beim selben Anbieter.
6. Tool also flags: *"Frank ist im 42 % Grenzsteuersatz. Basisrente €1000/Monat würde rund €4,200/Jahr Steuern sparen. Bei Eva (28 %) wäre derselbe Betrag deutlich weniger wirksam."*
7. They build three scenarios:
   - **A. Status quo.**
   - **B. Riester-Zulage auf Eva übertragen + Frank macht Basisrente €800.**
   - **C. Beide bAV maxen + ETF reduzieren.**
8. The household-level result panel shows joint Netto-Rente, Lücke zum Wunschnetto, und Wer-zahlt-wieviel.
9. They print PDF for the next family budget meeting.

**Desired end-state.** Decision: shift Riester to Eva, Frank starts Basisrente €800. Both walk away with a one-page summary that names the action items per spouse.

**Tool capabilities required.**
- **Household / dual-profile mode** with two synchronised profile blocks.
- **Ehegattensplitting** in the income-tax pipeline (already exists for the underlying tax engine — surface it in the UI).
- **Per-spouse product attribution** (whose Riester, whose bAV).
- **Inter-spouse optimisation hints** (Riester to lower-income spouse, Basisrente to higher-tax spouse, etc.).
- Household-total result columns + per-spouse columns.

---

## Scenario 6 — Gabi, 55, Late starter with windfall: "I'm late. What still helps?"

**Persona.** Office manager at a mid-size company, divorced 8 years ago, kids out of the house. Pragmatic, cautious. Knows nothing technical about retirement products beyond "Riester ist doch tot, oder?"

**Starting situation.**
- €58,000 brutto, GKV, Steuerklasse I.
- **GRV** with ~30 EP from her career (she was part-time for 8 years).
- **Old Riester** worth €8,000 from her marriage settlement, paid-up.
- **€30,000** in Tagesgeld (emergency + slack).
- **Inherited €60,000** six months ago, sitting in a separate account.
- Wunschnetto in Rente: €1,800/Monat (modest).

**Trigger.** She did a back-of-envelope calculation and panicked: "12 years to 67. Is that enough time?"

**Search intent.** She googles *"Altersvorsorge mit 55 Erbschaft anlegen"*. Wants a tool that lets her enter both **a one-off lump sum** and a **monthly contribution**, and that does not punish her for being late.

**First impression she needs.** A "**Ich starte spät / habe Einmalbetrag**" path that visibly accepts a lump-sum input and a monthly amount per product.

**Path through the tool.**

1. Picks **"Ich habe bereits Verträge und Erspartes"** on landing.
2. Inventory: GRV (30 EP), Riester (€8,000 paid-up), ETF (€0), Tagesgeld (€30,000), **Einmalbetrag verfügbar (€60,000)** as a household-level field.
3. Tool offers a **"Einmalbetrag-Allokations-Wizard"** because the household-level field is non-zero. Three sliders: ETF / AVD / Basisrente / Tagesgeld-Reserve. She drags €30k ETF, €25k Basisrente, €5k bleibt liquide. Tool also asks for her **monatliche Sparrate** (she enters €400).
4. Tool surfaces the **late-starter caveat**: *"Bei 12 Jahren Restlaufzeit ist Marktrisiko spürbar — Glidepath empfohlen."* Suggests AVD-Standarddepot or a glidepath ETF strategy.
5. Tool runs Baseline (do nothing different, leave €60k in Tagesgeld) and three scenarios:
   - **A. €60k all in ETF + €400/Monat ETF.**
   - **B. €25k Basisrente Einmal + €30k ETF + €5k cash + €600/Monat (€400 ETF + €200 Basisrente).**
   - **C. AVD Standarddepot mit Glidepath, €60k Einmal + €400/Monat.**
6. Recommendation: "Bei deinem Steuersatz und 12 Jahren Restlaufzeit liefert **B** das beste Verhältnis aus Steuerförderung (sofortige Auszahlung der Steuerersparnis als Sondertilgung in den ETF) und Flexibilität. **Achtung:** Basisrente ist nicht kapitalauszahlbar. Sicherheits-Reserve bleibt in Cash."
7. She runs the **Monte-Carlo-Stresstest**: Tool shows Median, P10, P90 monatliche Netto-Rente; in der P10-Welt liegt sie unter Wunschnetto, in der P50-Welt darüber.
8. Decides to do B, walks away with three concrete actions.

**Desired end-state.** Has an action plan: Basisrente-Beratung vereinbaren, €30k ETF-Einmalanlage, €400/Monat Sparplan starten.

**Tool capabilities required.**
- **Lump-sum input** at household level (separate from per-product current balances) with an allocation wizard.
- **Glidepath** suggestion for late starters (UI surfacing of an existing engine capability, AVD-Standarddepot).
- **Monte-Carlo stress test** wired to the recommendation, not just the Details tab.
- Plain-language late-starter caveats ("12 Jahre Restlaufzeit, Marktrisiko spürbar") that adapt to the user's age.

---

## Scenario 7 — Hans, 49, Doctor, GKV → PKV switch: "How does PKV change my retirement plan?"

**Persona.** Hospital doctor, employed (not self-employed). Has been over the JAEG for years; broker just sent him a PKV quote that would save him ~€350/Monat now. Knows enough to be dangerous.

**Starting situation.**
- €115,000 brutto, currently GKV (~€520 KV-Beitrag/Monat employee share + Zusatzbeitrag).
- **Bestehende bAV** €200/Monat + AG-Zuschuss, gestartet 2017, current value €38,000.
- **ETF Sparplan** €1,000/Monat, current depot €120,000.
- Verheiratet, Frau verdient €50k.

**Trigger.** PKV-Angebot in der Hand: €620/Monat KV-Beitrag (mit AG-Zuschuss netto teurer), aber besseres Leistungsspektrum.

**Search intent.** He googles *"PKV Wechsel Altersvorsorge Auswirkung"*. Wants to know if the short-term Beitragsersparnis is offset by **higher KV-Beiträge in retirement** (no §249a SGB V Halbsatz for non-KVdR-Mitglieder).

**First impression he needs.** A **GKV/PKV toggle** that visibly changes the retirement-phase numbers, plus a side-by-side over the full lifecycle (today to 90).

**Path through the tool.**

1. Loads existing portfolio (he's a returning user, his profile is already there).
2. Opens **"Was-wäre-wenn: Wechsel zu PKV"** scenario.
3. Tool prompts for PKV-Beitrag heute (€620 KV + €60 PV) and the assumed PKV-Beitrag-Steigerung (default 4 %/Jahr, configurable).
4. Computes:
   - **Salary phase:** Differenz aus aktuellem GKV-Beitrag + Zusatzbeitrag und PKV-Beitrag minus §257-Zuschuss → tool routes this into the "fair-comparison net cash" so the ETF-Sparrate would benefit from any monthly Ersparnis (+€280/Monat in his case for the first 5 Jahre, dann sinkend).
   - **Retirement phase:** PKV-Beitrag steigt weiter, **kein KVdR-Halbsatz** auf bAV/pAV-Auszahlung, voller Beitrag auf Versorgungsbezüge → bAV-Netto ist deutlich kleiner als im GKV-Szenario.
5. Tool produces a **Lifetime-Vergleich**: Summe Netto-Auszahlungen über alle Jahre 49 → 90 für GKV-Path vs PKV-Path. PKV gewinnt um ~€X gesamt, *aber* nur wenn er das eingesparte Geld konsequent investiert (UI-Hinweis macht das explizit).
6. Tool warnt: *"PKV-Wechsel ist quasi irreversibel ab 55. Diese Rechnung ist nur die Geld-Komponente — Leistungsumfang, Familien-Mitversicherung, etc. sind nicht modelliert."*
7. He saves both Szenarien, verschiebt die Entscheidung um 4 Wochen für mehr Recherche.

**Desired end-state.** Knows the financial Differenz quantitativ, kann die Entscheidung jetzt ehrlich gegen die nicht-finanziellen Faktoren (Familie, Wechsel-Sperre) abwägen.

**Tool capabilities required.**
- **GKV/PKV toggle** that flows through both salary phase (Vorsorgepauschale, §257-Zuschuss) and retirement phase (KVdR-Status, bAV/pAV/Riester payout deductions).
- **PKV-Beitrag-Eingabe heute + Steigerung p.a.** as separate inputs.
- **Lifetime sum view** (sum of net cash across all 41 years), not just monthly Rente at age 67.
- Caveat block highlighting **non-modelled factors** (Leistungsumfang, Familien-Mitversicherung, Sperre).

---

## Scenario 8 — Inge, 60, Pre-Retirement Stress Test: "Can I actually afford to retire?"

**Persona.** Kindergarten-Verwaltung, 7 years to retirement. Single. Has saved deliberately for 25 years. Never used a calculator like this; her bank advisor's PowerPoint last year said "alles im grünen Bereich" but she does not trust it.

**Starting situation.**
- €48,000 brutto, GKV, Steuerklasse I.
- **GRV** mit 35 EP (und 7 Jahre laufend hinzu).
- **Old Direktversicherung 1998** (Halbe-Steuer-Privileg, §3 Nr. 63 EStG nicht relevant für Altverträge — §40b a.F. eligible, lump-sum tax-free): aktueller Wert €45,000, kein neuer Beitrag.
- **Riester** seit 2003: aktueller Wert €20,000, €80/Monat Eigenbeitrag.
- **ETF Depot** €120,000, €600/Monat Sparrate.
- Wunschnetto in Rente: €1,900/Monat.

**Trigger.** Liest in der Zeitung über Marktrisiko und Inflation; bekommt Angst.

**Search intent.** Sucht *"Rente Auszahlung Sicherheit Marktrisiko Rechner"*. Will eine **ehrliche, defensive Antwort**, nicht ein optimistisches Szenario.

**First impression she needs.** Eine sichtbare **Worst-Case / P10 / Median**-Darstellung im Recommendation-Block, nicht versteckt im Details-Tab.

**Path through the tool.**

1. Inventory: GRV (35 EP), bAV alt (paid-up, €45k, **§40b a.F. flag**), Riester (€20k, €80/M), ETF (€120k, €600/M).
2. Tool detects das alte bAV-Privileg automatisch und markiert: *"Lump-sum auf alten Vertrag steuerfrei, sofern §40b-Eligibility erfüllt."* Bittet sie um Bestätigung mit einer kurzen Erklärung.
3. Baseline-Recommendation block zeigt **drei Zahlen**: P10 (€1,520), Median (€1,950), P90 (€2,340) Netto-Rente und sagt: *"In der pessimistischen Hälfte der Szenarien erreichst du dein Wunschnetto knapp; im schlechten Zehntel fehlen ~€380/Monat."*
4. Tool schlägt drei Maßnahmen vor:
   - **A. Glidepath jetzt einleiten:** ETF schrittweise in defensivere Klasse umschichten — reduziert P10-Risiko, kostet etwas Median.
   - **B. Riester teilweise als Einmalbetrag (§93 Abs. 2: bis 30 %) entnehmen** und in Tagesgeld als Sicherheits-Puffer halten.
   - **C. 2 Jahre länger arbeiten:** Tool verschiebt Renteneintritt auf 69 und zeigt den Unterschied.
5. Sie wählt eine Kombi aus A + C; Tool zeigt das Resultat: P10 €1,820, Median €2,180. Wunschnetto in P10-Welt fast erreicht.
6. Sie bittet ihren Neffen (er kennt sich aus) per Share-URL um eine zweite Meinung.

**Desired end-state.** Verstanden, dass sie wahrscheinlich okay ist, aber dass **2 Jahre länger arbeiten** den Unterschied zwischen "knapp" und "komfortabel" macht.

**Tool capabilities required.**
- **Monte-Carlo Highlights** an prominenter Stelle (P10/Median/P90 in der Recommendation, nicht erst nach Scrollen).
- **Auto-Erkennung von Alt-bAV-Privilegien** (§40b a.F., pre-2005-Halbeinkünfte) basierend auf Vertragsbeginn.
- **"Was wäre wenn ich später in Rente gehe"-Schieberegler** (z.B. +1, +2, +3 Jahre) ohne komplettes Reset.
- **§93 Abs. 2 Teilkapital-Optionen** für Riester (und AVD/bAV) als Was-wäre-wenn.
- **Glidepath-Vorschlag** als ausführbare Empfehlung, nicht nur als Diagramm.

---

## Scenario 9 — Jens, 44, Großverdiener: "Where do I get max tax leverage?"

**Persona.** Anwalt in einer Kanzlei, gerade Partner geworden, 42 % Spitzensteuersatz. Verheiratet, Frau verdient €40k. Knows the basics, optimises aggressively, time-poor.

**Starting situation.**
- €180,000 brutto, PKV.
- **bAV maxed:** Entgeltumwandlung am §3 Nr. 63 EStG-Cap (8 % BBG steuerfrei, davon 4 % BBG SV-frei).
- Sonst nichts an Altersvorsorge.
- Cash + Tagesgeld €120,000.
- Hat 5 Jahre lang das Maximum in bAV gemacht; aktueller bAV-Wert €68,000.

**Trigger.** Sieht den Steuerbescheid und realisiert: zu viel Steuer, zu wenig Vorsorge.

**Search intent.** Sucht *"Maximale Steuer-Hebel Altersvorsorge Spitzensteuersatz"*. Will eine harte Empfehlung in 5 Minuten.

**First impression he needs.** Tool soll erkennen, dass bAV bereits am Cap ist, und sofort Basisrente als nächsten Schicht-1-Hebel vorschlagen.

**Path through the tool.**

1. Inventory: bAV mit aktuellem Cap-Hinweis, sonst nichts.
2. Tool flagt sofort: *"Dein bAV-Cap ist ausgeschöpft. Nächster Steuer-Hebel: Basisrente (§10 Abs. 1 Nr. 2 EStG). Cap 2026 für Verheiratete: ~€56,000/Jahr."*
3. Tool schlägt drei Szenarien vor:
   - **A. Basisrente €1,500/Monat + ETF €1,500/Monat aus dem Cash.**
   - **B. Basisrente €2,500/Monat (näher am Cap), ETF €500/Monat.**
   - **C. Nur ETF €3,000/Monat.**
4. Recommendation: "Bei deinem Grenzsteuersatz spart **B** etwa €X mehr Steuern/Jahr als A. ABER: Basisrente ist nicht kapitalauszahlbar und nicht vererbbar (außer Hinterbliebenen-Rente). Wenn du Flexibilität wertschätzt, ist A das bessere Verhältnis."
5. Tool zeigt **Cashflow-Tabelle Steuerersparnis Jahr-für-Jahr**, die er an seinen Steuerberater forwarden will.
6. Er macht A, vereinbart Beratungstermin für Basisrente €1,500/Monat.

**Desired end-state.** Konkrete Zahl für die Basisrente-Beratung, plus ETF-Sparplan, in 10 Minuten beschlossen.

**Tool capabilities required.**
- **Cap-Erkennung** über Produkte hinweg (bAV §3 Nr. 63 EStG, Basisrente §10 Abs. 3 EStG, AVD-Cap, Riester-Cap, Sparerpauschbetrag) mit aktiver Empfehlung "nächster Hebel".
- **Cashflow-Tabelle Steuerersparnis** als Ausgabe für Steuerberater-Forward.
- **Trade-off-Hinweise zu Strukturmerkmalen** (Kapitalwahl ja/nein, Vererbbarkeit, Sperre) prominent in der Recommendation.

---

## Scenario 10 — Karin, 52, Old insurance health check: "Should I trust my broker's pitch?"

**Persona.** Project Managerin, single, methodisch. Hat 2002 von ihren Eltern eine private Rentenversicherung "geschenkt" bekommen — ein **Bruttotarif mit 4 % Höchstrechnungszins**. Bezahlt seither durchgängig €250/Monat ein.

**Starting situation.**
- €65,000 brutto, GKV, Steuerklasse I.
- **GRV** mit ~28 EP.
- **pAV von 2002:** €250/Monat, aktueller Vertragswert €58,000, **4 % Garantiezins** auf Beiträge bis 2024 (heute deutlich darunter), Kostenstruktur Bruttotarif (hoch).
- **ETF Depot** €40,000, €300/Monat Sparrate.

**Trigger.** Ein Versicherungsvertreter ruft an: *"Ihr Vertrag ist veraltet, ich habe ein moderneres Produkt mit ETF-Auswahl, Garantieverzicht und besseren Renditen."* Er drückt auf einen Wechsel.

**Search intent.** Sucht *"alte Lebensversicherung kündigen oder behalten 2002"*. Will eine ehrliche zweite Meinung **nicht von einem Vertreter**.

**First impression she needs.** Eine klare Anerkennung: *"Verträge vor 2005 haben oft das Halbeinkünfte-Privileg — das ist viel wert."* — bevor sie überhaupt anfängt zu vergleichen.

**Path through the tool.**

1. Inventory: GRV, pAV alt (2002).
2. Beim Eintragen des **Vertragsbeginn 2002** erkennt das Tool sofort:
   - **Halbeinkünfte-Regime** (§20 Abs. 1 Nr. 6 EStG i.d.F. 2004), nur halber Steuerertrag bei Auszahlung.
   - **4 % Höchstrechnungszins** als implizite Garantie auf bisherige Beiträge.
   - **Kapitalauszahlung steuerlich extrem günstig** im Vergleich zu Neuverträgen.
   Tool zeigt das **prominent als grüne Hinweise** auf der Vertragskarte.
3. Tool schlägt drei Szenarien vor:
   - **A. Vertrag weiterführen** (Status quo).
   - **B. Beitragsfrei stellen** und €250/Monat in ETF umlenken.
   - **C. Vertrag kündigen, Rückkaufswert €52,000 (nach Stornoabzug) in ETF investieren.**
4. Recommendation: "Bei deinem Vertrag ist **A** mit Abstand am besten. Die Steuer-Vorteile am Auszahlungsende sind real und durch keinen modernen Vertrag wieder herstellbar. Der Vertreter verdient an der Provision für den neuen Vertrag — diese geht auf deine Kosten."
5. Tool macht eine **Sensitivitätsanalyse**: "Selbst wenn der Vertrag in den nächsten 15 Jahren nur 1,5 % p.a. erwirtschaftet (statt der erwarteten 2,5 %), schlägt er den Wechsel."
6. Karin macht Print-PDF und **kündigt den Termin mit dem Vertreter ab**.

**Desired end-state.** Sicherheit, dass sie nichts ändern muss. Ein PDF zum Selbst-Schutz für den Fall, dass der Vertreter wieder anruft.

**Tool capabilities required.**
- **Pre-2005-pAV-Erkennung** mit prominenter Hervorhebung des Halbeinkünfte-Privilegs und 4 %-Höchstrechnungszins-Hinweis.
- **"Kündigen / Beitragsfrei / Weiterführen" als drei-Szenario-Schablone** für jeden bestehenden Vertrag.
- **Stornoabzug-Modell** für Kündigung (ungefähre Größenordnung; der genaue Wert kommt aus Versicherungsschein).
- **Sensitivitäts-Range pro Szenario** ("auch bei pessimistischer Rendite gewinnt A") für defensive Empfehlungen.

---

## Scenario 11 — Lena, 33, Erzieherin (60 % Teilzeit): "Riester is worth it for me — but how much?"

**Persona.** Kindergarten educator, 60 % part-time, two children (born 2020 and 2023), GKV, single. Low gross income (~€22,000/year at 60 %) but high state-subsidy leverage through Riester Kinderzulage. Has heard "Riester ist tot" but also knows she gets €300/child/year — she is not sure how much she needs to contribute herself to get the full allowances.

**Starting situation.**
- ~€22,000 brutto/Jahr (60 %-Stelle as Erzieherin, TVöD equivalent).
- No retirement products.
- Two children: geboren 2020 and 2023 (both under the new €300/Kind/Jahr Kinderzulage threshold).
- Monthly budget for retirement: ~€100/Monat.

**Trigger.** A colleague mentions that with two kids she can get over €770/Jahr from the state for Riester. Lena googles *"Riester Kinderzulage 2026 Teilzeit"* and lands on the calculator.

**First impression she needs.** A trigger card "Ich spare mit Kindern und kleinem Budget" that opens a wizard asking only part-time percentage, child birth years, and monthly budget. The result should immediately show how much the state contributes versus her own euro.

**Path through the tool.**

1. Picks **"Ich spare mit Kindern und kleinem Budget"** on landing.
2. Wizard: age (33), gross salary (22,000), Teilzeitquote (60 %), Sparbudget (€100/Monat), Geburtsjahr Kind 1 (2020), Kind 2 (2023).
3. Tool computes Mindesteigenbeitrag: max(60 EUR, 4 % × 22,000 − (175 + 300 + 300)) = max(60, 105) = €105/Monat to get full allowances. Budget of €100 is slightly under — she gets prorated allowances or she rounds up.
4. Tool shows Riester vs AVD vs ETF over the 34-year horizon. Recommendation: "Bei €100/Monat eigenem Beitrag leistet der Staat ~€650/Jahr — das entspricht einem Förderquotienten von 54 %. Das übertrifft jeden anderen Sparweg bei deinem Einkommen."
5. She can add another €25/Monat to clear the Mindesteigenbeitrag and get full allowances.

**Desired end-state.** Knows she should open a Riester-Fondssparplan, contribute €125/Monat, and will receive ~€775/Jahr state subsidy (175 Grundzulage + 2 × 300 Kinderzulage). Understands AVD as the modern alternative but recognises the child Zulagen tip the balance for her.

**Tool capabilities required.**
- `low_income_parent` trigger card + 5-question wizard (age, salary, Teilzeitquote, budget, child birth years).
- Riester Zulagen-leverage callout: state euro / own euro ratio surfaced prominently.
- Mindesteigenbeitrag gap indicator: "Du brauchst €X mehr für volle Zulagen."
- visibleProducts preset: Riester + AVD + ETF.

---

## Scenario 12 — Markus, 38, Lehrer Bayern (Beamter): "I have no GRV. Where does my extra euro go?"

**Persona.** Gymnasium teacher in Bavaria, civil servant (Beamter), single, PKV. No GRV, no bAV — his primary retirement income will be the Beamtenpension from the Bavarian Versorgungsgesetz (~72 % of final salary after full career). Has some savings capacity (~€300/Monat) and wants to know whether Basisrente or ETF makes more sense at his tax rate.

**Starting situation.**
- €65,000 brutto (A13 equivalent), PKV (~€500/Monat KV + PV).
- **No GRV** (never contributed, opted out on entry).
- **No bAV** (Beamte cannot do §3 Nr. 63 EStG Direktversicherung via Dienstherr).
- **No existing retirement products.**
- Estimated Beamtenpension at 67: ~€3,200/Monat brutto (Vollversorgung ~72 % of last salary).
- Monthly savings capacity: ~€300/Monat.

**Trigger.** His tax advisor mentions: "Basisrente würde bei deinem Steuersatz ~€1,500 Steuern pro Jahr sparen. Lohnt sich das?" He googles *"Basisrente Beamter Bayern sinnvoll"*.

**First impression he needs.** A **"Ich bin Beamter oder im Versorgungswerk"** trigger card that removes GRV and bAV affordances, sets the pension baseline to Beamtenpension, and puts Basisrente front and centre.

**Path through the tool.**

1. Picks **"Ich bin Beamter oder im Versorgungswerk"** on landing.
2. Wizard: age (38), retirementAge (67), gross (65,000), Versorgungsart (Beamtenpension), estimated Versorgung (€3,200/Monat), KV (PKV → toggle GKV off).
3. Tool opens workspace with: `pensionBaselineType: 'beamtenpension'`, Basisrente + ETF + pAV in `visibleProducts`. GRV/bAV removed from the product picker.
4. Baseline shows: "Deine Beamtenpension: ~€3,200 Brutto/Monat (ca. €2,400 netto nach §19 EStG Versorgungsfreibetrag + PKV). Zusätzliches Sparprodukt nicht eingestellt — Lücke zum Wunschnetto (nicht gesetzt)."
5. Tool generates three what-if scenarios:
   - **A. €300/Monat in ETF.**
   - **B. €300/Monat in Basisrente** (§10 Abs. 1 Nr. 2 EStG, Schicht-1).
   - **C. €150/Monat Basisrente + €150/Monat ETF.**
6. Recommendation: "Basisrente spart dir ~€1,440/Jahr Einkommensteuer (Grenzsteuersatz ~33 % bei 65k brutto). Über 29 Jahre summiert sich das auf ~€42,000 Steuerersparnis. ABER: Basisrente ist nicht kapitalauszahlbar. Wenn du Flexibilität willst, ist C das bessere Verhältnis."
7. He saves "Plan B: Basisrente €300" for the advisor meeting.

**Desired end-state.** Has a concrete plan for the advisor conversation: Basisrente €300/Monat, with a side note that C (split) is the more flexible alternative.

**Tool capabilities required.**
- `beamter` trigger card + wizard (age, salary, Versorgungsart, estimated pension, GKV/PKV toggle).
- `pensionBaselineType: 'beamtenpension'` wired to the existing engine code path in `grv.ts`.
- GRV and bAV removed from `visibleProducts` and from the comparison picker affordances.
- Basisrente as primary Schicht-1 product (front of visible list).
- Beamtenpension displayed as baseline income in the retirement summary (not a product to compare, but the floor).

---

## Capability matrix

Each row is a capability surfaced by the scenarios; columns are the scenarios that need it. ✓ = central, • = nice-to-have.

| Capability | 1 Anna | 2 Bernd | 3 Clara | 4 Dilan | 5 Eva+Frank | 6 Gabi | 7 Hans | 8 Inge | 9 Jens | 10 Karin | 11 Lena | 12 Markus |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Onboarding split: clean-slate vs existing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | • | ✓ | ✓ | ✓ | ✓ | ✓ |
| Trigger-typed entry cards (bAV-Angebot, Job-Wechsel, Erbschaft, …) | ✓ | • | • | ✓ | • | ✓ | • | • | • | ✓ | ✓ | ✓ |
| Portfolio inventory wizard (per-product anchor fields) |   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |   | ✓ |   |   |
| Multiple instances of same product type (e.g. two bAV) |   | ✓ |   | ✓ | • |   |   |   |   |   |   |   |
| Paid-up flag on contracts |   | ✓ |   | ✓ |   | ✓ |   | ✓ |   | ✓ |   |   |
| Auto-detect contract-vintage privileges (§40b a.F., Halbeinkünfte) |   |   | ✓ | • |   |   |   | ✓ |   | ✓ |   |   |
| Beschäftigungsstatus toggle (Selbstständig removes GRV/bAV) |   |   | ✓ |   |   |   |   |   |   |   |   | ✓ |
| Beamter/Versorgungswerk baseline (removes GRV/bAV, sets pension type) |   |   |   |   |   |   |   |   |   |   |   | ✓ |
| Riester Zulagen-leverage callout (state € / own € ratio) |   | • |   |   | ✓ |   |   |   |   |   | ✓ |   |
| Child birth years → Kinderzulage (Riester + AVD) |   | ✓ |   |   | ✓ |   |   |   |   |   | ✓ |   |
| Mindesteigenbeitrag gap indicator |   |   |   |   |   |   |   |   |   |   | ✓ |   |
| Variable-income / income-stress button |   |   | ✓ |   |   |   |   |   |   |   |   |   |
| Lump-sum / windfall input + allocation wizard |   |   |   |   |   | ✓ |   | • | • |   |   |   |
| Household / dual-profile mode + Ehegattensplitting |   |   |   |   | ✓ |   | • |   | • |   |   |   |
| Inter-spouse optimisation hints |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| GKV/PKV toggle that flows through salary + retirement phases | • |   |   |   |   |   | ✓ |   |   |   |   | • |
| Cap-detection across products (bAV cap, Basisrente cap, …) |   | ✓ | • |   |   |   |   |   | ✓ |   |   | ✓ |
| "Where does my next €X go?" recommender | • | ✓ |   |   |   | ✓ |   |   | ✓ |   | ✓ | ✓ |
| Cross-product interaction explanations in plain text |   | ✓ | ✓ |   | ✓ | • |   | • | • | • | • | ✓ |
| Three-card per-contract template (Weiterführen / Beitragsfrei / Kündigen) |   |   |   | ✓ |   |   |   |   |   | ✓ |   |   |
| Glidepath suggestion for late starters |   |   |   |   |   | ✓ |   | ✓ |   |   |   |   |
| Monte-Carlo P10/Median/P90 prominent in recommendation |   | • | • |   | • | ✓ |   | ✓ |   | • | ✓ |   |
| "Retire later" slider | • |   |   |   | • | • |   | ✓ |   |   |   |   |
| Lifetime-sum view (49 → 90, sum of all net cash) |   |   |   |   |   |   | ✓ |   |   |   |   |   |
| Cashflow table of yearly tax saving |   |   | • |   |   |   |   |   | ✓ |   |   | ✓ |
| Wunschnetto + per-product gap-fill (already shipped, surface more) | • | ✓ | • |   | ✓ | ✓ | • | ✓ | • | • | • | • |
| Print-PDF + share-URL (already shipped, must keep working) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Suggested development sequencing

Drawn from the capability matrix above. Each item below maps to a vertical slice that lights up multiple scenarios.

1. **Onboarding split + portfolio inventory wizard.** Without this, scenarios 2 / 3 / 4 / 5 / 6 / 8 / 10 cannot start. Highest-leverage single change. Includes: existing-product anchor fields (start year, current value, current contribution, paid-up flag), per-product compact card layout, baseline auto-computed.
2. **Trigger-typed landing cards.** Bolts onto step 1. Scenarios 1, 4, 6, 10 each match a card. The card opens a focused 2–4 question wizard instead of dumping the user into the full input drawer.
3. **Multiple instances of the same product type + paid-up flag.** Required by 4 (two bAV) and 8 (paid-up Direktversicherung). Implementation note: this is an `assumptions.bav` becoming `assumptions.bav: BavInstance[]` change — large blast radius across schema, validators, simulator, and UI; do it deliberately and in one commit.
4. **Auto-detect contract-vintage privileges.** Add detection logic for §40b a.F. and Halbeinkünfte (already in engine — surface in UI on inventory cards). Lights up 3, 8, 10.
5. **"Where does my next €X go?" recommender.** Generates 3–4 obvious what-if scenarios from the baseline. Lights up 1, 2, 6, 9. Implementation: scenario-template generator that takes the baseline + a marginal-budget input and emits scenarios `+€X to product Y` for every product where the user has cap headroom.
6. **Cap-detection + cross-product interaction text.** Tied to step 5. Pre-computed per-product cap ratios feed both the "next euro" recommender and the trade-off explanations.
7. **Beschäftigungsstatus toggle (Selbstständig/Beamter/Versorgungswerk).** Smaller change, unblocks Clara (and the existing Versorgungswerk/Beamtenpension code paths that are not exposed in onboarding).
8. **GKV/PKV decision view.** Already supported by the engine; needs a dedicated *"Wechsel zu PKV"* scenario UI with PKV-Beitrag-Steigerung input and lifetime-sum view. Lights up Hans.
9. **Lump-sum / windfall input + allocation wizard.** Lights up Gabi; also benefits 8 (Riester-Teilkapital), 9 (deploy cash).
10. **Household / dual-profile mode.** Largest UX surface change. Two profile blocks, joint zvE in tax pipeline (already there), per-spouse product attribution. Lights up Eva+Frank, partly Hans and Jens.
11. **"Retire later" slider + Monte-Carlo highlights in the recommendation.** Surface existing engine capability. Lights up 8 cleanly, helps 1, 5, 6.
12. **Three-card per-contract template (Weiterführen / Beitragsfrei / Kündigen).** Per-product UI affordance for inventoried contracts. Lights up 4 (bAV) and 10 (pAV); reusable for Riester (paused/active), Basisrente (rare), AVD (rare).

Items 1–6 cover seven of the original ten scenarios; 7–12 cover the rest. Scenarios 11 (Lena) and 12 (Markus) are partially addressed by the existing trigger seeds — the wizard entry flow and visibleProducts preset are in place; the Mindesteigenbeitrag gap callout and Beamtenpension income card are follow-on combine-mode items tracked under "Decision views and UX expansion" in `BACKLOG.md`. A reasonable first milestone is "ship 1 + 2 + 5" — that alone changes the tool from "compare six products from scratch" to "tell me what to do given what I already have."

---

## Open design questions worth pulling into a separate doc

These are not part of the scenarios above but came up while writing them. Capture and decide later.

- **How many active products in one scenario?** Today the comparison picker treats products as alternatives. The scenarios above treat them as portfolio components. Both views are needed (compare vs combine). The picker needs a mode switch or a different metaphor (e.g., "add to portfolio" vs "compare against").
- **How is the "Baseline" persisted?** A scenario in the library can be "the baseline" or "a what-if". Need a flag, default-pinned status, and a "what changed since baseline?" diff in the result panel.
- **Per-spouse storage shape.** Today `useCalculatorState` has one `PersonalProfile`. Dual-profile mode means `{ a: PersonalProfile, b?: PersonalProfile }` — schema migration via `mergeDeep` will need to default `b` to `undefined` (or a sentinel) cleanly.
- **Trigger-card to wizard mapping** — should this be data-driven (`src/content/triggers.ts` listing the cards and their target wizards) or hard-coded? Data-driven scales better and makes a/b testing easier.
- **Recommendation text generation.** Many scenarios want plain-language explanations that depend on the *result* of a comparison ("B wins because your bAV cap has headroom"). This is real work — rules engine over `ProductResult[]` + portfolio metadata. Worth a dedicated module (`src/app/recommendations.ts`) rather than scattering string templates through components.
