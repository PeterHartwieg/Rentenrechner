# Consolidate shared inventory field primitives

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract shared inventory field primitives where onboarding and editing currently duplicate numeric, select, text, and evidence-display behavior. Use the shared primitives in the wizard and combine sidebar where it reduces duplicated behavior without forcing a broad UI redesign.

This slice should make existing contract input behavior more consistent.

## Acceptance criteria

- [x] Common inventory numeric, select, and text field behavior is shared where duplicated today.
- [x] Evidence display behavior is preserved while using the shared primitives where appropriate.
- [x] Wizard and combine sidebar inputs remain visually and behaviorally consistent with current expectations.
- [x] No broad layout redesign is introduced.
- [x] Focused tests cover field behavior that previously existed in duplicate paths.
- [x] Existing onboarding and combine sidebar tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/09-introduce-inventory-product-registry.md
