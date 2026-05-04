---
title: "Turn Luecke schliessen into a focused modal recommender flow"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Mein Plan / recommender / Rentenluecke
---

## What to build

Hide the `Was passiert mit deinem naechsten Euro?` recommender from the initial `Mein Plan` dashboard. Clicking `Luecke schliessen` opens a focused modal wizard that asks for the user's additional monthly savings budget and then shows ranked options.

The modal should not mutate the user's plan until the final save/adopt action.

## Acceptance criteria

- [ ] `Mein Plan` initial load shows the Rentenluecke dashboard but no always-visible next-euro recommender card.
- [ ] Clicking `Luecke schliessen` opens a modal dialog.
- [ ] The modal can be closed without changing baseline or what-if state.
- [ ] Step 1 asks `Wie viel moechtest du zusaetzlich sparen?`.
- [ ] Step 1 includes 100, 200, and 400 EUR presets plus a custom amount field.
- [ ] Step 2 asks whether the user has a bAV employer offer.
- [ ] If no offer is entered, the flow still ranks bAV with standard assumptions from issue 52.
- [ ] Final result step shows ranked options and allows saving/adopting one as a plan.
- [ ] Only the final `Als Plan speichern` / adopt action mutates workspace state.
- [ ] The former recommender budget controls are not duplicated elsewhere on the dashboard.
- [ ] Modal preset buttons and primary buttons match standard input/button height.
- [ ] Component tests cover open, close-without-mutation, budget entry, and save-as-plan mutation.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/features/dashboard/RentenluckeDashboard.tsx`
- `src/features/dashboard/RecommenderCard.tsx`
- new modal component under `src/features/dashboard/`
- `src/App.tsx` wiring
- `src/app/recommender.ts`

This issue can initially reuse existing ranking output. Issues 50-52 refine the result filters, flexibility/effort scoring, and bAV offer branch.

## Blocked by

- Issue 47 - standard monthly Netto-Belastung anchor.
