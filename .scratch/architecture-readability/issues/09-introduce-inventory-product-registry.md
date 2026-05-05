# Introduce inventory product registry

Status: needs-triage

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Introduce an inventory product registry that owns product metadata, default draft construction, draft-to-instance adaptation, label fallback, and add/remove routing for inventory flows. Use it to reduce duplicated product switches across onboarding, inventory editing, and combine-mode sidebar editing.

This slice should preserve existing inventory behavior while making each product's inventory path easier to find.

First-cut target: collapse the product switch inside workspace add-instance behavior and centralize product metadata/default draft/conversion paths. Broad wizard/sidebar rendering switch cleanup can wait for issue 10 or follow-up tickets if needed.

## Acceptance criteria

- [ ] Inventory product metadata is centralized in a registry-style Module.
- [ ] Default draft construction is centralized or routed through the registry.
- [ ] Draft-to-instance conversion is centralized or routed through the registry.
- [ ] Product label fallback behavior is centralized or routed through the registry.
- [ ] The add-instance product switch is collapsed or routed through the registry.
- [ ] Wizard and sidebar product flows consume the shared definitions where practical in this slice.
- [ ] Existing onboarding, inventory editing, and combine sidebar behavior is preserved.
- [ ] Tests verify every supported product has registry metadata, default draft behavior, conversion behavior, and label fallback.

## Blocked by

- .scratch/architecture-readability/issues/01-extract-workspace-identity-and-mutation-module.md
