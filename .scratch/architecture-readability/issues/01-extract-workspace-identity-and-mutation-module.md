# Extract workspace identity and mutation Module

Status: needs-triage

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Create a neutral workspace identity and mutation Module that owns scenario IDs, instance IDs, and pure workspace add/remove/fork operations. Use it from app state and inventory helpers so the app/inventory import cycle disappears and duplicate ID-generation logic is removed.

This slice should not change user-visible behavior. It should make the dependency direction clearer and give future agents one place to inspect workspace mutations.

## Acceptance criteria

- [ ] App state and inventory helpers no longer import each other.
- [ ] Scenario and instance ID generation live in one neutral Module and are used by existing workspace mutation paths.
- [ ] Duplicate inline instance ID generation is removed or routed through the shared helper.
- [ ] Existing add/remove/fork behavior is preserved for baseline and what-if workspaces.
- [ ] Focused tests cover ID generation shape and pure workspace add/remove/fork operations without rendering React.
- [ ] Existing storage, portfolio, and recommender tests continue to pass.

## Blocked by

None - can start immediately
