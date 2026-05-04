# Group G QA decisions - external review follow-up

Date: 2026-05-04

These decisions came from the external QA feedback grilling session. Use them as product direction for the follow-up issues in this folder.

## Comparison model

- Public comparison uses one standard anchor: monthly net out-of-pocket burden (`Netto-Belastung`).
- Default comparison amount is 200 EUR/month, with simple presets such as 100/200/400 EUR.
- The amount is independent from bAV. bAV, Basisrente, Riester, AVD, etc. should be back-solved so the user's net cash burden is equal.
- Remove visible `Vergleichsmodus` and equal-gross-contribution modes. There is no planned user-facing use case for equal gross contribution.

## Inflation

- Standard mode has no inflation: no inflation input, no real-value toggle, no "heutige Kaufkraft" framing.
- Standard/default scenarios use 0% inflation.
- Expert/details can expose `Inflation beruecksichtigen`.
- When expert inflation is toggled on, the default rate becomes 2% and is editable.
- Expert inflation belongs in Details / Annahmen / Expertenannahmen, not in the main input flow.
- Top-level charts should not add a nominal/real toggle. They reflect the active assumptions.

## Luecke schliessen / next-euro flow

- The `Was passiert mit deinem naechsten Euro?` recommender should not be visible on initial `Mein Plan` load.
- Clicking `Luecke schliessen` opens a focused modal wizard.
- The modal should not mutate plan state until the final save/adopt action.
- Step 1 asks how much the user wants to save additionally.
- Step 2 asks whether the user has a bAV employer offer.
- If a bAV offer exists, collect employer contribution percent, fixed employer contribution EUR/month, optional employer contribution cap, direct implementation path defaulted to Direktversicherung Section 3 Nr. 63, and effective costs.
- Rentenfaktor and payout mode are optional bAV details, not required fields in the main path.
- The app back-solves the employee gross conversion from the user's net monthly budget and employer offer fields.
- Percent and flat employer contributions are additive, capped by the optional maximum if present.
- If no offer exists, bAV remains in the ranked options with standard assumptions: 15% employer contribution, Direktversicherung Section 3 Nr. 63, 1.2% p.a. effective costs, no flat employer contribution, no extra cap beyond statutory caps.
- The modal v1 compares only additional-saving options. It does not suggest surrendering, transferring, or changing existing contracts.

## Recommendation filters and labels

- Use `Beste Option fuer ...` labels based on the active ranking criterion, not generic advice language.
- Default filter: `Beste Option fuer hoechste mittlere Netto-Rente`.
- Supported filters:
  - hoechste mittlere Netto-Rente
  - hoechstes Kapital bei Renteneinstieg
  - Sicherheit
  - Flexibilitaet
  - wenig Aufwand
- `Sicherheit` ranks by the 90%-floor of monthly net pension, i.e. P10 net monthly pension.
- Safety tie-breakers: explicit guarantee floor, lower chance of missing Wunschnetto, then higher median net pension.
- `Flexibilitaet` is an overall badge plus four criteria: kuendigen, Anlage wechseln, Produkt wechseln, Beitrag aendern.
- `Wenig Aufwand` means lowest next-action friction from the user's current state.

## Risiko-Check

- Standard/overview UI should not lead with P10 jargon.
- Use plain language such as `90 % der Simulationen lagen ueber X`.
- Standard Risiko-Check focuses on monthly net pension by default.
- Detailed/expert tables may retain P10/P50/P90 with explanation.
- Guarantee products show the guarantee underneath the visual indicator:
  - capital guarantee: `Garantie: mind. X EUR Kapital zum Rentenbeginn`
  - guaranteed annuity: `Garantierte Rente: mind. Y EUR/Monat`
  - when both exist, show the one relevant to the selected payout mode.

## Mein Plan lifecycle chart

- Reuse the existing Vergleich lifecycle/break-even chart concept for `Mein Plan`.
- Place it directly below the Rentenluecke dashboard.
- Vergleich remains product-alternative only and does not get a portfolio aggregate.
- Mein Plan defaults to `Gesamtportfolio`, with product-type drilldown chips.
- If multiple contracts of the same product type exist, aggregate them into one product-type line, e.g. `bAV (2 Vertraege)`.
- Exclude GRV from the lifecycle chart. GRV stays represented in the Rentenluecke/dashboard income stack.
- Baseline chart includes active and paid-up contracts only, not offered/draft products.
- Chart uses the same core concepts: Netto eingezahlt, Restkapital / modeled contract value, Netto ausgezahlt, break-even.

## Onboarding and wording

- Entgeltpunkte entry becomes an explicit choice:
  - Schaetzen aus Arbeitsjahren und Gehalt
  - Entgeltpunkte aus Renteninformation eingeben
- Only the selected GRV input path is shown.
- Planned children are first-class dated events, not a simplified label only.
- Future child birth years are allowed up to current year + 20.
- Child-dependent calculations use actual birth years: Riester/AVD child allowances begin in eligible years; Pflegeversicherung effects begin from birth year.
- Rename `Mandatorische Altersversorgung` to `Gesetzliche Altersvorsorge`.
- Rename `Wert ist okay` to `Uebernehmen`.
- Clicking `Uebernehmen` keeps the current visible value and marks it user-confirmed.

## Visual declutter rule

- Standard/user-facing surfaces get one short heading and at most one short supporting sentence.
- Primary meaning should come from numbers, charts, labels, icons, and layout.
- Long explanations move to tooltips, details, or expert sections.
- Avoid paragraph-style teaching text in dashboard cards unless legally required.
- Keep the legal disclaimer behavior untouched.

## Future backlog

- Add a separate `Optimiere deine Vorsorge` feature for existing-contract decisions.
- It should audit current contracts and create what-if options such as increase contribution, set paid-up, surrender and invest freely, transfer Riester to AVD, or keep unchanged.
- This is separate from `Luecke schliessen` and likely needs stronger disclaimer handling.
