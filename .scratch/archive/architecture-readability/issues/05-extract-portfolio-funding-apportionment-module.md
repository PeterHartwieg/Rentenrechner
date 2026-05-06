# Extract portfolio funding apportionment Module

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract cross-instance funding apportionment from the portfolio adapter into a focused Module. The Module should own how bAV, Basisrente, Altersvorsorgedepot, and Riester funding are apportioned across instances while preserving statutory cap behavior.

This slice should make funding behavior testable without running the full portfolio simulation.

## Acceptance criteria

- [x] Cross-instance funding apportionment no longer lives inline in the portfolio adapter.
- [x] Funding helper ownership is explicit: paid-up bAV funding, cross-instance funding apportionment, and product-specific funding maps belong to this slice.
- [x] bAV funding behavior is preserved across multiple instances.
- [x] Basisrente, Altersvorsorgedepot, and Riester funding behavior is preserved across multiple instances.
- [x] Existing statutory cap and headroom behavior remains unchanged.
- [x] Focused tests cover single-instance and multi-instance apportionment for each affected product family.
- [x] Existing portfolio adapter, simulation, and oracle tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/03-extract-portfolio-projection-module.md
