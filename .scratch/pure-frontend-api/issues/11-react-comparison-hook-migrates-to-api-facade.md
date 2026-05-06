# Post-v1: useSimulationResult migrates to API facade

Status: needs-triage
Type: follow-up

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Migrate only the existing comparison-mode `useSimulationResult` hook to call the new pure Comparison API facade internally. The UI should continue to behave exactly as before, but the app and non-UI callers should now share the same canonical comparison pipeline.

This is a post-v1 follow-up with no user-visible benefit by itself. It should happen only after the API facade is stable and parity-tested. It must not broaden into `useSimulationViewModel`, `useDerivedViews`, `useWorkspaceUiState`, storage, share links, exports, or combine-mode hooks. The existing `useMemo` boundaries are performance-sensitive and must be preserved or intentionally replicated.

## Acceptance criteria

- [ ] Only `useSimulationResult` is migrated; compatibility facades and downstream derived-view hooks are not refactored in this ticket.
- [ ] The hook delegates normalization, contribution sync, simulation, selected-scenario resolution, tax-mode diagnostics, and optional Monte Carlo to the API facade.
- [ ] Public hook return shape remains compatible with existing callers or is adapted with a thin compatibility wrapper.
- [ ] Existing `useMemo` boundaries and dependency behavior are preserved or covered by regression tests.
- [ ] Existing compare-mode UI tests pass.
- [ ] Existing simulation integration snapshots remain unchanged.
- [ ] Existing export and derived-view behavior remains unchanged.
- [ ] Tests prove the hook output still matches the prior behavior for defaults, custom net anchor, custom scenario, and empty visible products.
- [ ] The API facade remains React-free; only the hook imports React.

## Blocked by

- .scratch/pure-frontend-api/issues/07-comparison-api-summary-tracer-bullet.md
- .scratch/pure-frontend-api/issues/08-comparison-api-detail-levels-and-heavy-results.md
- .scratch/pure-frontend-api/issues/09-comparison-api-monte-carlo-option.md
- Post-v1 only; not required for the first API facade release.
