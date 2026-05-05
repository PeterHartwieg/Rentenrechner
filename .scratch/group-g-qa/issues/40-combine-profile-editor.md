---
title: "Mein Plan has no editor for personal details after onboarding"
Status: done
Severity: P1
Type: AFK
Area: Group G / combine mode / profile
---

## What to build

Add an editable profile section for combine mode so users can change personal details after onboarding without archiving/restarting and without deleting what-if scenarios.

The wizard collects personal details in step 1, but after onboarding `App.tsx` renders `CombineDashboardSidebar` instead of `InputsPanel`. The sidebar only receives contract assumptions, not a profile patch API, so the user cannot edit salary, age, retirement age, health insurance status, children, Ehegattensplitting, or pension baseline.

## Fields to support

- Birth year or age.
- Gross salary per year.
- Desired retirement age.
- Public/private health insurance.
- Ehegattensplitting / partner profile toggle.
- Child birth years.
- Pension baseline: GRV, Beamtenpension, Versorgungswerk.
- Manual monthly gross pension for non-GRV baselines.

## Acceptance criteria

- [ ] Combine mode contains a visible `Persoenliche Angaben` / `Profil` editor.
- [ ] Editing salary updates the combine-mode simulation and derived Rentenluecke target behavior without switching to compare-mode state.
- [ ] Editing retirement age updates product projections in combine mode.
- [ ] Editing child years affects Riester and Pflege-related calculations where applicable.
- [ ] Editing pension baseline updates `workspace.baseline.assumptions.statutoryPension`.
- [ ] Existing what-if scenarios are not deleted when profile fields are edited.
- [ ] Profile edits persist through reload.
- [ ] Regression tests cover at least salary, retirement age, and a non-GRV manual pension baseline update.

## Red test

Run:

```bash
npx vitest run src/App.combine-mode.test.tsx
```

Relevant test:

- `renders an editable personal-details section in combine mode`

## Implementation notes

Likely direction:

- Extract the wizard's `PersonalDetailsStep` field set into a reusable component, or create a compact sidebar variant backed by the same mapping logic.
- Add a `patchBaseline` path for profile and partner changes, not only assumption changes.
- Keep compare-mode `useCalculatorState` separate; combine-mode profile edits must update `portfolioState.workspace.baseline.profile`.

## Blocked by

None - can start immediately.
