# Align evidence and provenance presentation vocabulary

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Align evidence and provenance presentation vocabulary across inventory, results, recommendation copy, and exports. Keep this as a human-in-the-loop slice because it touches user-facing German confidence language.

This work should preserve the product guardrail that estimated values are never presented as confirmed values.

## Acceptance criteria

- [x] Evidence and provenance states are mapped through one shared presentation vocabulary or clearly documented adapter layer.
- [x] Inventory confidence labels, result confidence labels, recommendation confidence wording, and export wording use consistent concepts.
- [x] German wording is reviewed by a human before merge. (Maintainer signed off on `Schätzwert` / `Bestätigt` / `lt. Beleg` / `Unbekannt` / `Datenqualität`.)
- [x] Estimated values remain visibly distinct from confirmed values.
- [x] No evidence information is lost during display mapping.
- [x] Tests cover confidence presentation for confirmed, estimated, statement-derived, and mixed-source result cases.

## Blocked by

- .scratch/architecture-readability/issues/09-introduce-inventory-product-registry.md
- .scratch/architecture-readability/issues/10-consolidate-shared-inventory-field-primitives.md
- .scratch/architecture-readability/issues/12-split-recommendation-rules-from-rendering-copy.md
