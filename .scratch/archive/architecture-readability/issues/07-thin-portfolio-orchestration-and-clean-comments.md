# Thin portfolio orchestration and clean stale adapter comments

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

After the projection, transfer/capital-policy, funding, and Sparerpauschbetrag slices land, simplify the remaining portfolio orchestration so it reads as a high-level flow. Clean stale comments that describe older portfolio adapter behavior, especially comments that claim transfer events are not handled.

This slice is the final portfolio adapter cleanup pass.

## Acceptance criteria

- [x] Portfolio orchestration delegates projection, transfer/capital policy, funding, and allowance work to focused Modules.
- [x] The remaining orchestration path is short enough to read as a flow from workspace input to portfolio result.
- [x] Stale comments about unimplemented transfer behavior are removed or updated.
- [x] Comments describe current architecture rather than historical issue phases.
- [x] No user-visible behavior changes.
- [x] Oracle and integration snapshots are not updated unless the issue/PR explains a justified behavior change.
- [x] `npm run verify` passes.

## Blocked by

- .scratch/architecture-readability/issues/04-extract-portfolio-transfer-capital-policy-module.md
- .scratch/architecture-readability/issues/05-extract-portfolio-funding-apportionment-module.md
- .scratch/architecture-readability/issues/06-extract-sparerpauschbetrag-allocation-module.md
