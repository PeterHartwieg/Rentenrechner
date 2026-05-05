# Consolidate shared inventory field primitives

Status: needs-triage

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Extract shared inventory field primitives where onboarding and editing currently duplicate numeric, select, text, and evidence-display behavior. Use the shared primitives in the wizard and combine sidebar where it reduces duplicated behavior without forcing a broad UI redesign.

This slice should make existing contract input behavior more consistent.

## Acceptance criteria

- [ ] Common inventory numeric, select, and text field behavior is shared where duplicated today.
- [ ] Evidence display behavior is preserved while using the shared primitives where appropriate.
- [ ] Wizard and combine sidebar inputs remain visually and behaviorally consistent with current expectations.
- [ ] No broad layout redesign is introduced.
- [ ] Focused tests cover field behavior that previously existed in duplicate paths.
- [ ] Existing onboarding and combine sidebar tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/09-introduce-inventory-product-registry.md
