# Schweregrad-Labels auf Deutsch

Status: done
Type: bug
Priority: minor

## Parent

.scratch/qa-feedback-mode/PRD.md

## Problem

The severity dropdown in `QaComposer` uses English labels (Blocker, Major, Minor, Nit) even though the rest of the composer UI is German. The PRD specifies that tester-facing UI copy should be German (implementation decisions, line 79).

The `SEVERITY_PREFIX` map in `buildTitle.ts` also uses English brackets (`[BLOCKER]`, `[Major]`, etc.) in generated ticket titles — those can stay English since tickets target developers, but the composer-facing labels must be German.

## What to change

1. In `src/features/qa-feedback/QaComposer.tsx`, update `SEVERITY_OPTIONS` labels:
   - `blocker` → `Blocker` (same in German)
   - `major` → `Schwerwiegend`
   - `minor` → `Gering`
   - `nit` → `Kleinigkeit`

2. Leave `SEVERITY_PREFIX` in `buildTitle.ts` as-is (English ticket titles are fine per PRD).

3. Update any test assertions that match on the old English labels in the composer.

## Acceptance criteria

- [ ] Severity dropdown in the composer shows German labels.
- [ ] Generated ticket titles still use the English severity prefix.
- [ ] Existing composer tests pass with updated label assertions.

## Blocked by

Nothing — standalone change.
