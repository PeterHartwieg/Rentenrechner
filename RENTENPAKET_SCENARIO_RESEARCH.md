# Rentenpolitik scenarios: audit and implementation design

Last researched: 2026-09-08

Two questions:

1. Is the **Rentenpaket 2025** (in force since 1.1.2026) fully reflected in the calculator?
   Answer: no. Two measures are missing entirely, one adjacent bAV change is also missing.
2. How would we implement the **Rentenkommission 2026** package as a user-selectable scenario?
   Answer: three slices, six unresolved modelling questions, designed below.

Not legal, tax, or financial advice. Sources per section so a later audit can re-check them.

## 1. The three tranches (they get conflated in press coverage)

| Tranche | Status on 2026-09-08 |
|---|---|
| **Rentenpaket 2025** | Law. Bundestag 5.12.2025, Bundesrat 19.12.2025, in force 1.1.2026. |
| **Frühstartrente** | Regierungsentwurf 12.8.2026. Bundestag and Bundesrat pending, planned for 1.1.2027. |
| **Rentenkommission 2026** (Alterssicherungskommission) | 33 recommendations handed to BMAS 23.6.2026. No Referentenentwurf as of today; the September date reported earlier is now treated as open. |

## 2. Audit: Rentenpaket 2025 against the code

| Measure | In force | In the calculator? |
|---|---|---|
| Haltelinie Rentenniveau 48 % bis 2031 | 1.1.2026 | **Implicitly yes.** `aktuellerRentenwert: 42.52` in `de2026.ts` is the post-July-2026 value, which already carries the Haltelinie-supported 2026 Anpassung. Nothing further to do while the rule year is 2026. |
| **Mütterrente III** (+6 Kindererziehungsmonate = +0,5 EP per pre-1992 child) | 1.1.2027, paid from 2028 | **No.** Zero occurrences of Mütterrente, Kindererziehungszeit, or a 1992 cohort split anywhere in `src/`. |
| **Aktivrente** (2.000 EUR/Monat steuerfrei ab Regelaltersgrenze) | 1.1.2026 | **No.** There is no retirement-phase earned-income input at all. `calculateRetirementTax` has an `otherTaxableAnnual` channel, but nothing feeds it with Arbeitsentgelt and there is no 24.000 EUR Freibetrag. |
| Anschlussverbot entfällt (befristete Weiterbeschäftigung) | 1.1.2026 | n/a, not a calculation. |
| Nachhaltigkeitsrücklage 0,2 → 0,3 Monatsausgaben | 1.1.2026 | n/a, not user-visible. |
| **§100 EStG Geringverdiener-Förderbetrag** (raised by BRSG II, in force 22.1.2026) | 2026/2027 | **No.** `BAV_RESEARCH.md:40` researched it and `BAV_RESEARCH.md:206` lists it as an open recommendation. Not implemented. Adjacent to the Rentenpaket rather than part of it, but it is the other 2026 pension law that moves numbers. |

### Gap 1: Mütterrente III

Cheapest real win in the whole document. `PersonalProfile.childBirthYears` already exists (it
drives the Pflegeversicherung Beitragsabschlag), so the uplift is derivable with no new input:

```
bonusEP = 0.5 × childBirthYears.filter(y => y < 1992).length
```

At the current Rentenwert that is 21,26 EUR/Monat brutto per child.

Two things to get right:

- **Only in EP mode.** A Renteninformation issued before 2027 does not contain the uplift; one
  issued after does. Applying it on top of `manualMonthlyGross` silently double-counts for
  anyone with a recent letter. Gate on `manualMonthlyGross === null`, or ask explicitly.
- **Only one parent gets it.** Kindererziehungszeiten are credited to one parent, normally the
  mother. `childBirthYears` says nothing about who was credited, so the uplift needs an opt-in
  ("Mir wurden die Kindererziehungszeiten angerechnet"), defaulting off.

### Gap 2: Aktivrente

More work, and it is the measure most likely to change a decision, because it prices "arbeite
ich nach 67 weiter?".

Routing per CLAUDE.md is fixed: extend `calculateRetirementTax`, never bypass it.

- Income tax: earned income after the Regelaltersgrenze, tax-free up to 24.000 EUR/Jahr, the
  excess taxable at the marginal rate on top of all other retirement income.
- KV/PV: this is the part people get wrong. Arbeitsentgelt is in the KVdR assessment base, so
  it competes for BBG headroom with the pension in `calculateRetirementKvPv`. The Steuerfreiheit
  does **not** extend to social security. Past the Regelaltersgrenze the employee pays no RV and
  no AV share, but KV and PV are still due.
- New inputs: monthly Arbeitsentgelt after retirement, and for how many years.

### Gap 3: §100 EStG Geringverdiener-Förderbetrag

Employer-side, so it only matters for the bAV product and only for gross salaries under the
threshold. `BAV_RESEARCH.md` already carries the 2026 numbers. Lowest priority of the three.

## 3. Rentenkommission 2026: the parameters

Source of record is the BMAS Faktenpapier of 23.6.2026. Numbers below are quoted from it
directly rather than from press summaries, which disagreed with each other on dates.

### Gesetzliche Kapitalrente

- Obligatory for all Versicherte. Current pensioners unaffected.
- **+2,0 Beitragssatzpunkte on top of the RV-Beitrag**, phased in **0,5 pp per year** (from 2028
  per press reporting, so full effect from 2031).
- **Paritätisch**: 1,0 pp employee, 1,0 pp employer. Collected via the
  Gesamtsozialversicherungsbeitrag.
- Accounts administered by the Deutsche Rentenversicherung. Capital invested in a **Staatsfonds**.
- Paid back "eins zu eins, zuzüglich der Rendite, **in Form von Renten**". So an annuity, not a
  lump sum and not an Auszahlplan.

### Übergangsfaktor

Guarantees a **Zugangsrentenniveau of at least 48 %** for every new pensioner during the
build-up phase, funded from the Bundeshaushalt. The commission expects it to bind only in
exceptional cases.

### Regelaltersgrenze

Current phase-in completes in 2031 at 67 for cohort 1964 and later. From 2032 the RAG is coupled
to life expectancy at a 2:1 split between working and retirement phase, which the Faktenpapier
translates as roughly **half a year per decade**:

| Year of retirement | RAG |
|---|---|
| ≤ 2031 | 67 |
| 2032–2041 | 67 |
| 2042–2051 | 67,5 |
| 2092 | 70 |

That is exactly `67 + 0.5 × floor((retirementYear − 2032) / 10)`, capped at 70. The
Faktenpapier's own worked examples check out against it: Jahrgang 1979 retires in 2046 at 67,5;
Jahrgang 1965 retires in 2032 at 67.

### Vorgezogener Renteneintritt

- Altersrente für langjährig Versicherte (35 Versicherungsjahre): **63 → 64 in one step**, then
  rising with the RAG.
- Altersrente für besonders langjährig Versicherte (45 Beitragsjahre, the "Rente ab 63"):
  **abolished**, replaced by a Schutzrente conditional on a health assessment.

### Laufende Renten ab 2032

The Rentenanpassungsformel with Nachhaltigkeits- and Beitragssatzfaktor applies again, with the
Nachhaltigkeitsfaktor "moderat stärker" than under current law. Pensions keep rising but slower
than wages.

### The counterfactual the commission is arguing against

Under current law past 2031, per the same paper: Rentenniveau falls from 48 % to **46,1 % by
2050**, Beitragssatz rises to **21,5 % by 2050**.

That gives a defensible derived constant for a "no reform" comparison:
46,1 / 48 over 19 years is **−0,21 % per year relative to wages**.

## 4. Implementation design

### What the engine can and cannot express today

Good news: `rules: GermanRules` is a parameter at every level (`simulateRetirementComparison`,
`runCombineSimulation`, `simulatePortfolio`, `buildContext`, `projectStatutoryPension`). Only two
production call sites hardcode the concrete object, `src/app/useSimulationResult.ts:74` and the
default parameter in `src/app/useCombineSimulation.ts:116`. A policy variant is a small change.

Bad news, and it is load-bearing for this package:

- **No Zugangsfaktor.** `projectStatutoryPension` computes `EP × Rentenwert` with an implicit
  factor of 1,0, and `AssumptionsPanel.tsx:93` says so out loud. Without it, "die
  Regelaltersgrenze steigt auf 67,5, du gehst trotzdem mit 67" cannot be priced at all.
- **`GermanRules` is a single snapshot** held constant across the horizon. Every phased measure
  here (Kapitalrente 0,5 pp/Jahr, RAG per decade, Niveau after 2031) is time-dependent. A
  snapshot variant says "assume the fully phased-in world applied to your whole career", which
  overstates the contribution side for anyone far from retirement.
- **No indexation during the payout phase.** The GRV pension is one number, so "Renten steigen
  langsamer als Löhne" is not expressible and currently not modelled either way.

### Slice 1: Zugangsfaktor and Regelaltersgrenze (engine)

Worth building regardless of this scenario. It is the answer to the most common user question
there is, which is "was kostet es mich, zwei Jahre früher zu gehen?".

- Add `regelaltersgrenzeForRetirementYear(year)` to `src/rules/`. Statutory, so it belongs
  there. Baseline returns a flat 67; the policy variant returns the step function.
- Add the §77 SGB VI Zugangsfaktor to `projectStatutoryPension`: −0,3 % per month before the
  RAG, +0,5 % per month after it, applied as a multiplier on personal EP.
- Update the `AssumptionsPanel.tsx:93` copy, which currently promises 1,0.
- Oracle check: `externalGoldenFixtures.ts:74` pins the Regelaltersrente formula, where the
  factor stays 1,0, so the golden should not move. Verify rather than assume, and per CLAUDE.md
  do not touch the oracle if it breaks.

### Slice 2: policy variant plus scenario preset

- `src/rules/policyVariants.ts` exporting named `GermanRules` overlays spread from
  `de2026Rules`. For `rentenkommission2026`: `pensionEmployeeRate` and `pensionEmployerRate`
  raised by 0,01 each, a new `kapitalrente` block, and the RAG step function.
- Both production call sites read the variant from state.
- A scenario preset producing a named what-if in combine mode (the `addWhatIf` path already
  exists) plus one or two rows in `sensitivitySelectors.ts`, which is exactly this shape
  already: clone workspace, perturb one axis, re-run, diff.
- Map the Niveau effects onto `rentenwertGrowthRate`, which is the only lever we have:
  reform means the Rentenwert tracks wages (Niveau held at 48 % by the Übergangsfaktor);
  no reform means wages minus 0,21 pp.
  Caveat worth stating in the copy: the baseline defaults both `rentenwertGrowthRate` and
  `annualSalaryGrowthRate` to 0, which is an internally consistent "today's euros" model.
  Turning on Rentenwert growth without salary growth manufactures a free lunch.

### Slice 3: the Kapitalrente payout

Not a `PRODUCT_REGISTRY` product. It sits inside the gesetzliche Rente, so it belongs next to
`projectStatutoryPension` in `grv.ts` and surfaces as an extra field on
`StatutoryPensionResult`, flowing through `combineContext.ts` so the recommender and combine
simulation cannot drift.

- Accumulate 2 pp (both shares) of capped gross per year with `projectAccumulation` on the
  selected return scenario.
- Annuitize with `computeGrossMonthlyPayout` in `leibrente` mode.
- Route the payout through `calculateRetirementTax` as `statutoryPensionAnnual` and through
  `calculateRetirementKvPv` on the §249a half-rate channel, same as the GRV pension.

### Six modelling questions the commission has not answered

Slice 3 cannot be built without deciding these, and none of them is settled law. Each one needs
a documented default and a visible caveat:

1. Is the Kapitalrente-Beitrag deductible under §10 Abs. 1 Nr. 2 EStG and does it enter the
   Vorsorgepauschale? Proposed default: yes, which is what routing it through
   `pensionEmployeeRate` gives us for free.
2. Is the payout taxed nachgelagert under §22 Nr. 1 Satz 3 a aa with the cohort table, or as
   Ertragsanteil? Proposed default: nachgelagert.
3. KV/PV on the payout: §249a half rate like the GRV pension, or §229 Versorgungsbezug at the
   full rate? Proposed default: §249a.
4. Staatsfonds return and cost. No statutory value exists. Proposed default: the user's selected
   return scenario, with a 0,2 % p.a. cost drag as an explicit modelling choice.
5. Does the 2 pp apply up to the RV-BBG? Proposed default: yes.
6. Übergangsfaktor formula. Unknown. Proposed default: model it as a floor, i.e. the Rentenwert
   tracks wages.

Because these literals are policy defaults and not statute, they belong beside
`sensitivityConfig.ts` rather than in `src/rules/`, following the precedent that file already
sets.

## 5. Content and compliance shape

Guardrail 1 (illustration, never advice) does real work here. A commission recommendation with
six invented parameters must never be presented the way enacted law is.

- **Measure registry.** `src/content/policyMeasures.ts`, one entry per measure carrying
  `status: 'in_force' | 'draft' | 'recommendation'`, `effectiveFrom`, `sourceUrl`, `asOf`. The
  status badge renders next to every row; `/methode` gets a section listing the sources and the
  six assumptions above.
- **Freshness owner.** Add the registry to `docs/seo/yearly-update-checklist.md` and re-check it
  whenever a Referentenentwurf lands. Tranche 3 could be law, watered down, or dead by spring
  2027.

Backend boundary is untouched: local computation, no fetch, no PII.

## 6. Recommended order

1. **Mütterrente III** (Gap 1). Enacted law, no new input needed, about 43 EUR/Monat brutto for a
   user with two pre-1992 children.
2. **Slice 1, Zugangsfaktor and RAG.** Useful on its own and a prerequisite for the interesting
   half of the Rentenkommission scenario.
3. **Measure registry and the `/methode` section.** Ship before the speculative measures, so the
   compliance shape exists when they arrive.
4. **Slice 2, policy variant and scenario preset.** First user-visible Rentenkommission scenario.
5. **Slice 3, Kapitalrente payout.** Only with all six assumptions written down and rendered.
6. **Aktivrente** (Gap 2).
7. **§100 EStG Geringverdiener-Förderbetrag** (Gap 3).

Frühstartrente stays out. It is a child's Standarddepot with a state contribution, mechanically
our existing Altersvorsorgedepot, and it does not touch the user's own retirement. If we want
it, it is a separate small calculator.

## Sources

- [BMAS Faktenpapier zur Alterssicherungskommission, 23.06.2026 (PDF)](https://www.portal-sozialpolitik.de/uploads/sopo/pdf/2026/2026-06-23_BMAS_Faktenpapier_ASK.pdf)
- [Rentenkommission 2026 (BMAS)](https://www.bmas.de/DE/Soziales/Rente-und-Altersvorsorge/Rentenreform-2025/Rentenkommission-2026/rentenkommission-2026.html)
- [FAQ zur Rentenkommission 2026 (BMAS)](https://www.bmas.de/DE/Soziales/Rente-und-Altersvorsorge/Rentenreform-2025/Rentenkommission-2026/Fragen-und-Antworten/fragen-und-antworten-zur-rentenkommission-2026.html)
- [Rentenpaket 2025: Was steckt drin? (Deutsche Rentenversicherung)](https://www.deutsche-rentenversicherung.de/SharedDocs/FAQ/Gesetzesaenderungen/rentenpaket-2025/Rentenpaket-2025.html)
- [Bundestag beschließt das Rentenpaket (Deutscher Bundestag, KW49 2025)](https://www.bundestag.de/dokumente/textarchiv/2025/kw49-de-rentenpaket-1128720)
- [Mütterrente III FAQ (Deutsche Rentenversicherung)](https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/Allgemeine-Informationen/Wissenswertes-zur-Rente/FAQs/Rente/Muetterrente_KEZ/KEZ_Muetterrente-III.html)
- [Aktivrente 2026: bis zu 2.000 Euro monatlich steuerfrei (lohnsteuer-kompakt)](https://www.lohnsteuer-kompakt.de/steuerwissen/aktivrente-2026-bis-zu-2-000-euro-monatlich-steuerfrei-im-ruhestand)
- [Rentenkommission 2026: 33 Empfehlungen (Zuversichtsberatung)](https://www.zuversichtsberater.de/blog/rentenkommission-2026-empfehlungen-altersvorsorge)
- [Prognose: Rentenbeiträge 2028 bei 19,9 Prozent (Ihre Vorsorge)](https://www.ihre-vorsorge.de/rente/nachrichten/prognose-rentenbeitraege-2028-bei-19-9-prozent)
- [Fragen und Antworten zur Frühstart-Rente (BMF)](https://www.bundesfinanzministerium.de/Content/DE/FAQ/fruehstart-rente.html)
