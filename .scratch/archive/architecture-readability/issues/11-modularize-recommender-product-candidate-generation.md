# Modularize recommender product candidate generation

Status: done

## Parent

.scratch/architecture-readability/PRD.md

## What to build

Turn the recommender into a smaller orchestrator backed by product-specific candidate Modules. Keep ranking, candidate generation, and what-if materialization as distinct concepts while preserving current recommendation behavior.

This slice should follow the engine's product-registry style where practical, so agents can find one product's recommendation behavior without reading the whole recommender.

This issue should start after both the shared combine-context Module and the recommendation rules/copy split have landed.

## Acceptance criteria

- [x] Product-specific candidate generation is moved behind a registry-style structure or equivalent focused Modules.
- [x] Recommender orchestration remains responsible for high-level ranking flow, not per-product implementation details.
- [x] Ranking behavior is preserved.
- [x] What-if materialization behavior is preserved.
- [x] Product-level tests cover visible candidate behavior, reasons, ranking inputs, and materialized what-if effects.
- [x] Existing recommender tests continue to pass.

## Blocked by

- .scratch/architecture-readability/issues/02-centralize-combine-context-construction.md
- .scratch/architecture-readability/issues/12-split-recommendation-rules-from-rendering-copy.md
