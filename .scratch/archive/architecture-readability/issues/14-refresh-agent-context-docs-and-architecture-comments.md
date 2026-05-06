# Refresh agent context docs and architecture comments

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Create a compact root CONTEXT.md and update agent-facing docs to point at it plus the existing domain docs. Clean stale architecture comments that describe older issue phases or behavior that has since shipped.

Decision: create a new root CONTEXT.md rather than only updating existing agent docs.

## Acceptance criteria

- [x] A compact root CONTEXT.md exists and describes current concepts: baseline, what-if, product instance, transfer event, evidence state, combine mode, compare mode, and storage migration posture.
- [x] Agent-facing domain docs point to CONTEXT.md and the deeper docs/context files.
- [x] Stale comments discovered during this architecture track are updated or removed.
- [x] Stale or superseded planning docs are retired or annotated, especially `docs/architecture-refactor-session-briefs.md`, so they do not compete with CONTEXT.md as the current architecture map.
- [x] Comments describe current Module ownership rather than historical issue plans.
- [x] No public-facing RentenWiki.de copy is changed unless required to correct an existing typo.
- [x] Documentation changes are easy for future agents to use as a first-read map.

## Blocked by

- .scratch/architecture-readability/issues/07-thin-portfolio-orchestration-and-clean-comments.md
- .scratch/architecture-readability/issues/08-split-storage-migration-validation-persistence.md
- .scratch/architecture-readability/issues/09-introduce-inventory-product-registry.md
- .scratch/architecture-readability/issues/11-modularize-recommender-product-candidate-generation.md
- .scratch/architecture-readability/issues/13-align-evidence-and-provenance-presentation.md
