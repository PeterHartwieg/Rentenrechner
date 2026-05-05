# Extract portfolio projection Module

Status: needs-triage

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract instance-to-singleton projection, inverse singleton view projection, and neutralized scenario defaults from the portfolio adapter into a focused portfolio projection Module. The new home should be `src/engine/portfolioProjection.ts`.

The extracted Module should own the mapping from portfolio instances to scenario assumptions while preserving legacy singleton compatibility. It should also own `singletonViewOfWorkspace`, because storage currently needs that Interface for legacy/share projection without importing the full portfolio adapter.

This is the first portfolio adapter split and should prepare later slices for transfer, funding, and allowance extraction.

## Acceptance criteria

- [ ] Portfolio instance projection is readable without loading the full portfolio adapter.
- [ ] `singletonViewOfWorkspace` is exported from the projection Module and storage no longer needs to import it from the portfolio adapter.
- [ ] Neutralized defaults live with projection behavior or in a directly related helper.
- [ ] Projection helper ownership is explicit: product-slot detection, common-key stripping, paid-up projection overrides, projection-time paid-up fee handling, `projectInstanceToScenarioAssumptions`, and `singletonViewOfWorkspace` belong to this slice.
- [ ] Existing singleton compatibility behavior is preserved for every product type.
- [ ] Projection handles current value, paid-up state, and product-specific fields exactly as before.
- [ ] Focused projection tests cover each product family and length-one legacy behavior.
- [ ] Oracle and integration snapshots are not updated unless the issue/PR explains a justified behavior change.
- [ ] Existing portfolio adapter and integration tests continue to pass.

## Blocked by

None - can start immediately
