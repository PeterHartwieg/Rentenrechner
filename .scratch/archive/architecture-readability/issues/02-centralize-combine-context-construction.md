# Centralize combine-context construction

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Move combine-context construction into one shared engine-adjacent Module. The new home should be `src/engine/combineContext.ts`. If the `CombineContext` type needs to move, `portfolioCombine` should import it from that Module.

The combine simulation hook and recommender should both use this same Implementation for statutory pension, tax routing, retirement health status, and KV/PV routing.

This slice should preserve all current combine-mode calculations while removing duplicated logic.

## Acceptance criteria

- [x] Combine simulation and recommender use the same combine-context construction Module.
- [x] The shared Module lives at `src/engine/combineContext.ts` or the issue comments document why that home was not viable.
- [x] Statutory pension taxable-share routing is built in one place.
- [x] Retirement health status and KV/PV routing are built in one place.
- [x] Existing combine-mode results and recommender results remain behaviorally unchanged.
- [x] Focused tests pin the shared combine-context output for representative GKV, PKV, KVdR, and freiwillig cases.
- [x] Existing portfolio combine and recommender tests continue to pass.

## Blocked by

None - can start immediately
