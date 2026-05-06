# Split storage migration, validation, and persistence

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Split storage behavior into clearer migration, validation, and persistence Modules. Route production v2 workspace loading through validation after merge and backfill.

Policy decision: malformed v2 workspaces should be repaired only for known migration/backfill cases. Otherwise, local persisted data should fall back to defaults rather than partially loading invalid data. Share-URL ingest should return an invalid/null result so the caller can surface an invalid-link state instead of silently showing defaults.

This issue starts after issue 03, because storage currently imports `singletonViewOfWorkspace` from the portfolio adapter and issue 03 moves that Interface to the projection Module.

## Acceptance criteria

- [x] Storage keys, legacy migration, workspace migration, transfer-event backfill, validation, and local persistence are easier to inspect independently. (Implemented as clearly-marked sections inside `src/storage.ts` rather than separate physical files — see CLAUDE.md "src/storage.ts" entry for the deliberate scope decision.)
- [x] Production v2 workspace loading runs workspace validation after merge and backfill.
- [x] Known repairable migration/backfill cases are repaired and tested.
- [x] Unknown malformed localStorage v2 workspaces fall back to defaults rather than partially loading invalid data.
- [x] Unknown malformed share-URL v2 workspaces return an invalid/null parse result so the caller can surface an invalid-link state.
- [x] The exported `migrateAndValidateState` pipeline remains available for scenario library loading, or all scenario library callers are migrated in this same issue.
- [x] What-if snapshots are validated deeply enough for transfer backfill assumptions.
- [x] Transfer-event duplicate detection uses a shared neutral helper rather than duplicating key construction with portfolio transfer collection.
- [x] Stale comments about storage writer versions and validation flow are updated.
- [x] Storage migration tests cover valid v2 load, repairable v2 load, malformed v2 fallback, and legacy v1 migration.
- [x] Existing share-URL, scenario library, and storage tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/03-extract-portfolio-projection-module.md
