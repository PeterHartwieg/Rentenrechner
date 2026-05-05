# Split recommendation rules from rendering copy

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Split recommendation rule evaluation from German rendering copy. Rule logic should remain pure and testable, while text templates and phrasing live in a separate copy Module.

This slice should make recommendation behavior easier to review and make copy changes less risky.

## Acceptance criteria

- [x] Recommendation rules are separated from rendering templates and German copy.
- [x] Rule evaluation remains pure and independent of React rendering.
- [x] Copy templates are centralized in a clear Module.
- [x] Stale comments describing older empty-rule phases are removed or updated.
- [x] Rule behavior is unchanged.
- [x] Tests distinguish rule behavior from copy rendering behavior.
- [x] Existing recommendation tests continue to pass.

## Blocked by

None - can start immediately
