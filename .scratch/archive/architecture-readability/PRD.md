# PRD - Architecture simplification for agent readability

Status: done

## Problem Statement

RentenWiki.de has grown from a singleton product comparison calculator into a scenario-led portfolio tool with multi-instance products, what-ifs, transfer events, recommendations, evidence states, and combine-mode results. The shipped behavior is valuable, but several modules now combine many reasons to change.

This makes the codebase harder for agents and maintainers to read safely. A future contributor often has to load large orchestration modules before they can make a narrow product, storage, recommendation, or inventory change. Some comments and agent-facing docs also describe older architecture states, which makes it harder to know whether docs or code are authoritative.

The user-facing risk is indirect but real: slower implementation, less confident reviews, more duplicated logic, and a higher chance that small changes regress statutory routing, storage migration, recommendation ranking, evidence display, or cross-instance portfolio behavior.

## Solution

Simplify the architecture by extracting deeper Modules with small, stable Interfaces from the current high-friction areas. The goal is not to redesign product behavior or change calculator math. The goal is to make existing behavior easier to understand, test, and extend.

The main refactoring themes are:

- Split the portfolio adapter into focused Modules for projection, funding, transfer/capital policy, Sparerpauschbetrag allocation, and orchestration.
- Centralize combine-context construction so statutory pension, tax, and KV/PV routing are built in one place.
- Turn the recommender into a small orchestrator backed by product-specific candidate Modules.
- Add an inventory product registry so wizard, sidebar, draft conversion, labels, and add/remove behavior do not drift.
- Move workspace IDs and pure workspace mutation helpers into a neutral Module to remove import cycles.
- Separate storage migration, workspace validation, and local persistence.
- Split recommendation rules from recommendation copy.
- Refresh agent-facing context docs and stale module comments so agents can trust the map.

The expected user-visible outcome is that future changes land faster and with fewer regressions, while current calculator behavior remains stable.

## User Stories

1. As a maintainer, I want the portfolio adapter split into focused Modules, so that I can change transfer behavior without reading unrelated projection and funding logic.
2. As a maintainer, I want instance-to-scenario projection to have its own Module, so that legacy singleton compatibility is easy to inspect.
3. As a maintainer, I want cross-instance funding apportionment to have its own Module, so that statutory cap behavior can be tested directly.
4. As a maintainer, I want transfer events and capital policy isolated, so that paid-up, surrender, and transfer behavior are easier to reason about.
5. As a maintainer, I want Sparerpauschbetrag allocation isolated, so that ETF allowance behavior can be changed without touching full portfolio simulation.
6. As a future agent, I want a small portfolio orchestration Module, so that I can see the whole simulation flow in one reading pass.
7. As a reviewer, I want portfolio refactors to preserve existing oracle behavior, so that architecture cleanup does not hide math changes.
8. As a maintainer, I want combine-context construction centralized, so that statutory pension tax and KV/PV routing cannot drift between views.
9. As a future agent, I want the recommender to delegate product-specific candidate generation, so that adding a product recommendation is a local change.
10. As a maintainer, I want recommender ranking and candidate materialization separated, so that scoring changes do not affect what-if persistence accidentally.
11. As a maintainer, I want product recommendation Modules to follow a registry pattern, so that recommendation routing matches the engine's product routing style.
12. As a reviewer, I want each product candidate Module tested through public behavior, so that candidate ranking remains explainable.
13. As a maintainer, I want inventory product metadata centralized, so that product labels, defaults, add/remove behavior, and draft conversion do not live in several places.
14. As a future agent, I want the inventory wizard and combine sidebar to share the same inventory definitions, so that I do not have to synchronize duplicated card behavior.
15. As a maintainer, I want common inventory field primitives extracted, so that numeric, select, and evidence UI behavior remains consistent.
16. As a user, I want existing contract inputs to behave consistently across onboarding and later editing, so that the tool feels predictable.
17. As a maintainer, I want workspace ID generation centralized, so that instance and scenario identifiers keep one format.
18. As a future agent, I want app state and inventory helpers to have a one-way dependency direction, so that import cycles do not obscure ownership.
19. As a maintainer, I want pure workspace mutation helpers outside React hook modules, so that add/remove/fork behavior can be tested without rendering UI.
20. As a maintainer, I want storage keys, migration, validation, and local persistence split, so that load-path changes have clear ownership.
21. As a reviewer, I want v2 workspace validation to run in the production load path, so that malformed saved workspaces are rejected consistently.
22. As a maintainer, I want what-if snapshots validated deeply enough for transfer backfill, so that storage migration cannot assume missing structure.
23. As a future agent, I want storage comments to match current behavior, so that I do not follow stale migration notes.
24. As a maintainer, I want recommendation rules split from display copy, so that a copy change does not look like a rule change.
25. As a content reviewer, I want recommendation templates in one copy Module, so that German phrasing can be checked without reading rule logic.
26. As a maintainer, I want evidence and provenance display vocabulary aligned, so that confidence labels do not diverge across inventory, results, and exports.
27. As a user, I want confidence indicators to remain consistent, so that estimated values are never presented as confirmed values.
28. As a future agent, I want a compact current-context document, so that I can understand baseline, what-if, instance, transfer event, evidence, and combine mode before opening code.
29. As a maintainer, I want stale architecture comments removed, so that comments remain useful signposts rather than historical traps.
30. As a reviewer, I want each refactor delivered in small vertical slices, so that behavior preservation is easy to verify.
31. As a maintainer, I want no public copy or brand behavior changed by this work, so that architecture cleanup does not affect launch surfaces.
32. As a maintainer, I want no backend, fetch, cookie, or analytics work introduced, so that the frontend-only guardrail remains intact.
33. As a future agent, I want deep Modules with narrow Interfaces, so that I can modify one concept without loading the entire application.
34. As a maintainer, I want the refactor sequence documented before implementation issues are cut, so that dependency order is explicit.
35. As a project owner, I want the architecture to be easier for agents to navigate, so that future AI-assisted work becomes safer and cheaper.

## Implementation Decisions

- Treat this PRD as a refactoring and readability effort. It must preserve current user-visible behavior unless a follow-up issue explicitly changes behavior.
- Prioritize deep Modules over shallow file splitting. Each extracted Module should encapsulate meaningful behavior behind a small, testable Interface.
- Refactor the portfolio adapter first. This is the highest-friction Module and currently mixes projection, funding, transfer/capital policy, Sparerpauschbetrag allocation, and simulation orchestration.
- Keep portfolio orchestration thin. It should coordinate the extracted Modules rather than hold product-specific details inline.
- Move combine-context construction into one shared engine-adjacent Module. Recommender and combine simulation should use the same Implementation.
- Refactor the recommender after combine-context construction is centralized. Product candidate generation should move behind a registry-style Module shape.
- Keep recommender ranking, candidate generation, and what-if materialization as distinct concepts.
- Add an inventory product registry before further inventory UI work. The registry should own product metadata, default draft construction, draft-to-instance adaptation, label fallback, and add/remove routing.
- Extract shared inventory field primitives only where they reduce duplicated behavior across onboarding and editing.
- Move workspace ID generation and pure workspace mutations into a neutral Module that does not import React or inventory UI.
- Remove the app/inventory import cycle as an explicit milestone.
- Split storage into migration, validation, and persistence concepts. The production workspace load path should validate v2 workspaces after merge and backfill.
- Keep recommendation rules pure and separate from German rendering copy.
- Align evidence/provenance presentation only after the inventory and recommendation refactors reveal the final shared vocabulary.
- Refresh agent-facing docs as part of the work. The repo should either provide the advertised current-context document or point agents to the actual domain docs that exist today.
- Do not introduce new commercial-license gating, backend behavior, telemetry, cookies, or network calls.
- Do not change statutory constants, tax math, payout math, or product assumptions as part of this PRD.
- Do not introduce new public "Rentenrechner" copy. Public surfaces should continue to use RentenWiki.de / RentenWiki according to repo guidance.
- Keep implementation slices small enough that each can be reviewed independently.

## Testing Decisions

- Tests should assert external behavior and stable contracts, not private helper structure.
- Existing oracle and integration tests must remain green throughout the refactor. They are the safety net for payroll, retirement tax, bAV funding, and scenario simulation behavior.
- Add focused unit tests for extracted portfolio projection behavior, especially singleton compatibility and neutralized defaults.
- Add focused unit tests for cross-instance funding apportionment across bAV, Basisrente, AVD, and Riester.
- Add focused unit tests for transfer/capital policy, including paid-up, surrender, partial transfer, and residual capital cases.
- Add focused tests for Sparerpauschbetrag allocation, especially multi-ETF and allowance-exhaustion cases.
- Add tests for the shared combine-context builder that pin statutory pension, retirement health status, tax routing, and KV/PV routing.
- Add product-level recommender tests for candidate generation. These should compare visible candidate behavior, reasons, ranking inputs, and materialized what-if effects.
- Add inventory registry tests that verify every product has metadata, default draft behavior, conversion behavior, and label fallback.
- Add workspace mutation tests for adding, removing, forking, and ID generation without rendering React.
- Add storage load-path tests proving v2 workspaces are merged, backfilled, validated, and rejected or repaired consistently.
- Add recommendation rule tests separately from copy rendering tests.
- Use existing tests as prior art where possible: portfolio adapter tests for portfolio behavior, recommender tests for ranking behavior, storage migration tests for compatibility, and integration tests for end-to-end simulation preservation.
- Run `npm run verify` after each implementation slice.

## Out of Scope

- Changing calculation results, statutory rules, product assumptions, fee semantics, or rounding policy.
- Redesigning the user interface beyond small adjustments required to share inventory primitives.
- Adding new retirement products.
- Adding OCR, uploads, accounts, backend storage, telemetry, cookies, analytics, or remote persistence.
- Adding commercial-license enforcement or broker-only gating.
- Rewriting the app router or introducing a routing framework.
- Replacing the existing local issue tracker.
- Renaming the npm package, internal code identifiers, or historical design-doc references to Rentenrechner.
- Creating implementation issues in this PRD step. Those should be created after triage agrees on sequencing.

## Further Notes

Suggested implementation order:

1. Portfolio adapter split.
2. Shared combine-context Module.
3. Workspace ID and mutation Module, removing the import cycle.
4. Inventory product registry and shared inventory primitives.
5. Recommender product candidate Modules.
6. Storage migration and validation split.
7. Recommendation rules/copy split.
8. Evidence/provenance presentation alignment.
9. Agent-context doc refresh and stale-comment cleanup.

The highest-risk areas are portfolio simulation, storage loading, and recommendation materialization. These should receive the strongest test coverage before and after extraction.

The main success signal is not fewer lines by itself. Success means a future agent can answer "where do I change this?" quickly, read one focused Module, run a small relevant test set, and trust that broad compatibility tests still protect the calculator.
