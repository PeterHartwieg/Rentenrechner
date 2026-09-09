# Lead decisions (binding for all workers)

Companion to `state-contract.md` §10 and `ui-journey-map.md` §5. Code observations beat docs.

## Hosts and routes

- `/` stays landing (fresh) or personal plan (saved). `/vergleich` is the independent comparison journey (setup + result in one page, view state local). Route kinds to add (Opus): `vergleich`, `vorsorge-neu` (`/vorsorge/neu`, contract picker; `?produkt=<productId>` opens the editor for a new instance directly), `vertrag-bearbeiten` (`/vertrag/:instanceId/bearbeiten`, contract editor for an existing instance). `/vertrag/:instanceId` stays the read-only result detail. Every new route: `useRoute` union + constructors + both switches, `App.tsx` dispatch, `chromeRoutes`, `publicRouteRegistry` (only `/vergleich` is public/prerendered; the others are dynamic, not prerendered, like `/vertrag/:id`), `prerender.mjs`.
- Profile and pension editing reuse the onboarding steps: `InventoryWizard` opened with an initial step (`'profile' | 'pension'`) and `returnTo` = plan; "Angaben übernehmen" saves and closes. Onboarding = the same two steps, then straight to the plan. The old contract-checklist wizard step is gone; contracts are added from the plan via `/vorsorge/neu`.
- Contract editor draft state is component-local; cancel/back discards and navigates back to the plan. Saving goes through `addPopulatedInstance` / `updateInstance` only. Direct loads of `/vertrag/:id/bearbeiten` with an unknown id render the existing empty state.

## Comparison without a plan

- `/vergleich` setup shows the compact profile trio (age, income, GKV/PKV) when no saved plan exists, otherwise a button "Angaben aus meinem Plan verwenden" that seeds via `seedCompareFromWorkspace` (explicit, never automatic). Compare inputs are session-scoped compare state (existing compare-mode singleton state under STORAGE_KEY_V1 is acceptable as its persistence; it never writes the combine workspace).
- Only selected products render. Budget field = existing `equalInputAmountEUR` (netto own-money anchor) through the existing sync path. Empty selection is valid and shows the empty state.

## Household scope wording

- The headline is "Gesamt · netto pro Monat ab {Alter}" with a one-line scope note "Deine erfassten Renten nach Steuern und Krankenversicherung" (Opus confirms what `CombinedResult` covers; if partner income is not included, the note must not claim household). Default money basis: heutige Euro via `realDeflator`; nominal shown in the "Angaben & Annahmen prüfen" disclosure.
- PKV: collect the fields the engine actually consumes for retirement PKV cost (Opus names them in the Phase 1 delivery note). Each has an explicit unknown; unknown blocks the total.

## bAV subsidy on the minimum screen

- No merged "Zuschuss" field. Show: statutory 15 % pass-through toggle (existing field) and "Zusätzlicher fester Arbeitgeberbeitrag (€/Monat)" with unknown. Percent match stays under details. Durchführungsweg is on the minimum screen with an "Weiß ich nicht" option that stores the model default as `assumed`.

## Controls that are not wired today

- Ship nothing that does not persist to a real field. Riester/AVD wizard cost sliders, non-ETF Beitragsdynamik in the wizard, Familienstand/Bundesland stay (c) on `/eingaben` and are not added to the new editors. 2B adds a per-instance field only when it exists on the instance type; nothing edits a plan contract through the compare store.

## Target and undo

- Wunschrente is entered in heutigen Euro. Gap only when readiness is available/estimated and both figures are real-basis. Removing the target = `desiredNetMonthlyPension: undefined`; explicit 0 stays 0 and is treated as "no target" for the gap.
- Undo: one level, in memory, shown in the status bar until consumed or superseded by the next mutation. Not persisted.

## Demo and product availability

- No interactive demo. The landing keeps a static, clearly labelled example aside ("So kann ein Ergebnis aussehen … Frei gewähltes Beispiel · nicht dein Ergebnis"). AVD availability text comes from the existing `productAvailabilityCopy` registry; no new legal claims.

## Copy

- Use `ui-journey-map.md` §4 wording. Result kicker "Geschätzt aus deinen Angaben". Storage note per §4. Renteninformation help text may ship only after the implementer checks the DRV Renteninformation layout against a primary source (deutsche-rentenversicherung.de) and records the source in the note.

## Integration backlog (lead-maintained; resolved in Phase 4)

- 2C: `useCalculatorState` loader may auto-import saved-plan state into the compare singleton on load (Astra observation). Verify; `/vergleich` must only seed on explicit "Angaben aus meinem Plan verwenden".
- 2C: `/vergleich` has no `PrintReport` host, so "Drucken" prints nothing there. Mount the compare-mode print mirror on the journey page.
- 2A mechanical: `employment` is not persisted (no domain field); reconstructed from `pensionBaselineType`. Acceptable for now; document in ui docs.
- 2A mechanical: provenance for `retirementHealthStatus` and Versorgungswerk contributions is not carried (non-reserved keys dropped). Consider extending `RESERVED_INPUT_STATUS_KEYS` in Phase 4 if the UI shows those statuses.
- Routing: `storageError` banner lives in Calculator, not AppShell; six-tab chrome density on phones needs a UI check.
- Pre-existing flake: `App.combine-mode.test.tsx` first test times out under full-suite load (8s waitFor vs 5s testTimeout).
- 2A-UI: `src/features/qa-feedback/__tests__/modal-coverage.test.tsx` still constructs the old `InventoryWizard` props (scenario/mode missing) → mechanical test update in Phase 4.
- 2D: alternatives buttons temporarily route to `/eingaben/produkte`; flip to `ROUTES.alternativen` once the Phase 3 UI lands.
- 2B-UI: removal undo cannot travel with navigation; Phase 4 derives the plan's `notification` from `portfolioState.lastUndo` (label + undo) in Calculator → PlanOverview so "Vorsorge entfernt · Rückgängig" appears on the plan after the redirect.
- 2B-UI: reselecting the same product in the picker may retain the previous draft (minor; reset on product change in Phase 4).
