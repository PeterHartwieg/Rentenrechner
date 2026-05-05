# Plan - Architecture readability implementation

Status: draft, ready for triage. Source PRD: `.scratch/architecture-readability/PRD.md`. Issues live in `.scratch/architecture-readability/issues/`.

## 1. Planning principles

- Preserve behavior. Every issue is a refactor/readability slice unless its issue explicitly says otherwise.
- Prefer deep Modules over file-count churn. A split is successful only if it creates a smaller, stable Interface.
- Keep parallel agents on disjoint write sets. If two issues must touch the same large file, use a coordinator or sequence them.
- Run `npm run verify` after each merged implementation slice.
- Do not update oracle or integration snapshots without written justification in the issue or PR. Do not use snapshot updates or `vitest -u` as a refactor shortcut.
- Do not mix cleanup from unrelated tracks into these PRs.
- Treat docs and comments as part of architecture only after the code shape has settled.

## 2. Code-area groups

### Group A - Workspace foundation

Issues:

- `01-extract-workspace-identity-and-mutation-module.md`

Primary code area:

- Workspace IDs, pure workspace mutations, app state, inventory helper dependency direction.

Notes:

- This is an unblocker for inventory registry work.
- It should be safe to run in parallel with portfolio, combine-context, storage, and recommendation-rule work.

### Group B - Storage and validation

Issues:

- `08-split-storage-migration-validation-persistence.md`

Primary code area:

- Storage migration, v2 validation, transfer-event backfill assumptions, local persistence.

Notes:

- Starts after issue 03 lands. `storage.ts` currently imports `singletonViewOfWorkspace` from the portfolio adapter for legacy/share projection; issue 03 moves that Interface to the new projection Module.
- Keep this lane separate from workspace mutation work unless both agents agree on shared helper names.
- User decision: malformed v2 workspaces are repaired only for known migration/backfill cases; otherwise local persisted data falls back to defaults.
- Preserve the exported `migrateAndValidateState` pipeline used by the scenario library.
- Distinguish local persistence from share-URL ingest: local malformed v2 data may fall back to defaults, but malformed share URLs should produce an invalid-link/null result for the caller to surface.
- Coordinate transfer-event key helpers with issue 04 so storage backfill and portfolio transfer collection use the same domain helper.

### Group C - Portfolio engine adapter

Issues:

- `03-extract-portfolio-projection-module.md`
- `04-extract-portfolio-transfer-capital-policy-module.md`
- `05-extract-portfolio-funding-apportionment-module.md`
- `06-extract-sparerpauschbetrag-allocation-module.md`
- `07-thin-portfolio-orchestration-and-clean-comments.md`

Primary code area:

- Portfolio adapter, projection, transfer/capital policy, cross-instance funding, Sparerpauschbetrag allocation, portfolio tests.

Notes:

- Issue 03 must land first.
- Issue 03 creates the new projection home, tentatively `src/engine/portfolioProjection.ts`, and moves `singletonViewOfWorkspace` there so storage can depend on projection without importing the full adapter.
- Issues 05 and 06 can start after 03. Issue 04 starts after 03 and 08 so transfer-event key handling is shared with storage.
- Issues 04, 05, and 06 are conceptually parallel once their blockers land, but all may touch the adapter call site. Prefer one portfolio coordinator, or three agents with very strict ownership of new extracted Modules and minimal adapter edits.
- Issue 07 is the integration cleanup and should be last in this group.

Portfolio helper ownership map:

- Issue 03 owns projection helpers: neutralized defaults, product-slot detection, common-key stripping, paid-up projection overrides, projection-time paid-up fee handling, `projectInstanceToScenarioAssumptions`, and `singletonViewOfWorkspace`.
- Issue 04 owns transfer/capital-policy helpers: transfer collection, event-year to contract-year conversion, instance lookup by ID, surrender-tax handling, and instance capital-policy construction.
- Issue 05 owns funding helpers: paid-up bAV funding, cross-instance funding apportionment, and product-specific funding maps.
- Issue 06 owns allowance helpers: Sparerpauschbetrag demand calculation, cross-instance allowance apportionment, and ETF re-run orchestration.
- Issue 07 owns only final adapter call-site cleanup and stale comments after the extracted Modules exist.

### Group D - Combine and recommender

Issues:

- `02-centralize-combine-context-construction.md`
- `11-modularize-recommender-product-candidate-generation.md`

Primary code area:

- Combine-context construction, recommender orchestration, product candidate generation.

Notes:

- Issue 02 must land before issue 11.
- Issue 02 should create `src/engine/combineContext.ts` as the shared home. If the `CombineContext` type moves, `portfolioCombine` should import it from there.
- Issue 11 depends on both issue 02 and issue 12 so candidate modularization builds on the shared combine context and the split rules/copy shape.
- This group can run in parallel with portfolio and inventory work.

### Group E - Recommendation rules and copy

Issues:

- `12-split-recommendation-rules-from-rendering-copy.md`

Primary code area:

- Recommendation atom rules, rule registry, German copy templates.

Notes:

- Can start immediately.
- Issue 12 must land before issue 11 begins, so recommender modularization builds on the new rules/copy shape rather than moving old structure around.

### Group F - Inventory UI architecture

Issues:

- `09-introduce-inventory-product-registry.md`
- `10-consolidate-shared-inventory-field-primitives.md`

Primary code area:

- Inventory wizard, combine sidebar, instance cards, draft-to-instance conversion, shared input primitives.

Notes:

- Issue 09 depends on issue 01.
- Issue 10 depends on issue 09.
- This group touches large React Modules; keep it as one lane to avoid merge conflicts.
- Issue 09's first-cut target is the product metadata/default draft/conversion path, especially collapsing the `addInstanceToWorkspace` product switch. Broad wizard/sidebar rendering switch cleanup can wait for issue 10 or follow-ups.

### Group G - Evidence/provenance presentation

Issues:

- `13-align-evidence-and-provenance-presentation.md`

Primary code area:

- Evidence state presentation, provenance labels, confidence copy across inventory/results/recommendations/exports.

Notes:

- Depends on issues 09, 10, and 12.
- HITL: German confidence wording needs human review before merge.

### Group H - Agent docs and architecture comments

Issues:

- `14-refresh-agent-context-docs-and-architecture-comments.md`

Primary code area:

- Root `CONTEXT.md`, agent docs, stale architecture comments.

Notes:

- Depends on issues 07, 08, 09, 11, and 13.
- User decision: create a compact root `CONTEXT.md`.
- This should be the final wave so docs describe the final Module shape.
- Include stale or superseded planning docs in the cleanup pass, especially `docs/architecture-refactor-session-briefs.md`, so it does not compete with `CONTEXT.md` as the current architecture map.

## 3. Dependency phases

### ARCH Phase 0 - Coordinator preflight

Goal: prepare parallel work without changing behavior.

Tasks:

- Confirm the current worktree state and avoid unrelated user changes.
- Optionally run `npm run verify` once to establish the baseline before refactors.
- Assign one integration owner for Group C because the portfolio adapter is the highest-conflict lane.
- Agree that each agent uses its issue file as scope and does not opportunistically fix adjacent architecture.

Parallelism: one coordinator only.

### ARCH Phase 1 - Independent unblockers

Goal: land the clean foundation slices that unlock later work.

Parallel agents:

- Agent A: Issue 01 - workspace identity and mutation Module.
- Agent B: Issue 02 - shared combine-context construction.
- Agent C: Issue 03 - portfolio projection Module.
- Agent D: Issue 12 - recommendation rules/copy split.

Follow-on in this phase:

- Agent E: Issue 08 - storage migration/validation/persistence split, after issue 03 lands.

Merge guidance:

- Issues 01, 02, 03, and 12 can be implemented in parallel.
- Merge issue 01 before starting issue 09.
- Merge issue 02 before starting issue 11.
- Merge issue 03 before starting issue 08 and before starting issues 05 and 06.
- Merge issue 08 before starting issue 04.
- Merge issue 12 before starting issues 11 and 13.

Verification:

- Each issue runs its focused tests plus `npm run verify` before merge.
- After all ARCH Phase 1 work lands, run a full `npm run verify` on the combined branch.

### ARCH Phase 2 - Parallel feature-area extractions

Goal: extract the largest high-friction Modules while ARCH Phase 1 foundations are fresh.

Parallel lanes:

- Portfolio lane:
  - Issue 04 - transfer and capital-policy Module, after issue 08.
  - Issue 05 - funding apportionment Module.
  - Issue 06 - Sparerpauschbetrag allocation Module.
- Inventory lane:
  - Issue 09 - inventory product registry.
- Recommender lane:
  - Issue 11 - recommender product candidate Modules.

Portfolio lane options:

- Recommended safest option: one portfolio agent implements issues 04, 05, and 06 sequentially on one branch, then opens three commits or stacked PRs.
- Faster option: three agents implement 04/05/06 in parallel, each owns its new Module and tests, and the coordinator integrates adapter call-site edits. This is faster but has higher merge-conflict risk.

Merge guidance:

- Issue 09 can run while portfolio and recommender work happen.
- Issue 11 should begin only after issues 02 and 12 have landed.
- Do not start issue 07 until issues 04, 05, and 06 are merged.

Verification:

- Portfolio lane must run the portfolio adapter tests and full verify after each extraction.
- Recommender lane must run recommender tests and full verify.
- Inventory lane must run inventory/UI tests and full verify.

### ARCH Phase 3 - Integration cleanup and UI primitive consolidation

Goal: reduce remaining duplication after the big Modules exist.

Parallel lanes:

- Portfolio integration lane:
  - Issue 07 - thin portfolio orchestration and stale adapter comments.
- Inventory lane:
  - Issue 10 - shared inventory field primitives.

Merge guidance:

- These can run in parallel because they should touch different code areas.
- Issue 07 should not reopen design questions from issues 04, 05, and 06. It is an integration cleanup.
- Issue 10 should stay small and avoid a visual redesign.

Verification:

- Run `npm run verify` for each issue.
- After both merge, run a combined full verify before starting ARCH Phase 4.

### ARCH Phase 4 - Confidence vocabulary alignment

Goal: make evidence/provenance presentation consistent after inventory and recommendation copy structures settle.

Work:

- Issue 13 - align evidence and provenance presentation vocabulary.

Parallelism:

- Do not parallelize this with issue 10 or 12. It depends on their final shapes.
- One implementation agent plus one human review pass for German confidence wording.

Verification:

- Run confidence/evidence tests, relevant result/export tests, and `npm run verify`.

### ARCH Phase 5 - Final documentation and comment map

Goal: make the repo easier for future agents to enter.

Work:

- Issue 14 - root `CONTEXT.md`, agent-doc links, stale comment cleanup.

Parallelism:

- One doc agent after ARCH Phase 4.

Verification:

- Check links and referenced Module names.
- Run `npm run verify` if comments/docs touched files that affect lint or tests; otherwise a docs-only sanity pass is enough.

## 4. Suggested parallel agent assignments

### Fast-but-safe wave

Start four agents in ARCH Phase 1:

- Workspace agent: issue 01.
- Combine agent: issue 02.
- Portfolio projection agent: issue 03.
- Recommendation rules agent: issue 12.

Start the storage agent on issue 08 after issue 03 lands.

Then start three implementation lanes in ARCH Phase 2:

- Portfolio coordinator: issues 04, 05, 06, then 07 later.
- Inventory agent: issue 09, then 10 later.
- Recommender agent: issue 11.
- Storage agent is done unless follow-up fixes are needed from issue 08.

Then close with:

- Evidence/copy agent: issue 13.
- Docs agent: issue 14.

### Maximum-parallel wave

Use only if merge-conflict coordination is strong:

- ARCH Phase 1 same as above.
- ARCH Phase 2 splits portfolio into three agents:
  - Transfer/capital-policy agent owns issue 04 and its new Module/tests.
  - Funding agent owns issue 05 and its new Module/tests.
  - Allowance agent owns issue 06 and its new Module/tests.
- A portfolio coordinator owns the final adapter integration branch and issue 07.

Risk:

- Higher chance of conflicts in the adapter and tests.
- Requires agents to avoid opportunistic edits outside their issue.

## 5. Merge order

Recommended merge order:

1. Issue 01.
2. Issue 02.
3. Issue 03.
4. Issue 12.
5. Issue 08 after 03.
6. Issues 05 and 06 in any order after 03; issue 04 after 03 and 08.
7. Issue 09 after 01.
8. Issue 11 after 02 and 12.
9. Issue 07 after 04, 05, and 06.
10. Issue 10 after 09.
11. Issue 13 after 09, 10, and 12.
12. Issue 14 after 07, 08, 09, 11, and 13.

This order maximizes useful parallelism while keeping dependent cleanup at the end.

## 6. Integration checkpoints

Run a combined `npm run verify` at these checkpoints:

- After ARCH Phase 1 all unblockers merge.
- After portfolio issues 04, 05, 06 merge.
- After ARCH Phase 2 all lanes merge.
- After ARCH Phase 3 cleanup merges.
- After issue 13 merges.
- Before closing issue 14.

At each checkpoint, explicitly check:

- Oracle and integration tests still pass.
- Oracle and integration snapshots were not updated unless the issue/PR explains exactly why behavior changed.
- Storage/share-URL behavior still loads valid saved workspaces, and malformed share URLs do not silently become defaults.
- Combine-mode recommender behavior still matches existing tests.
- Inventory wizard and combine sidebar still allow adding/editing existing contracts.
- No new public-facing Rentenrechner copy was introduced.

## 7. Branch and PR strategy

- Use one branch per issue for low-conflict lanes.
- For portfolio issue 04/05/06, prefer stacked branches or one coordinated branch with separate commits.
- Keep PRs small enough to review the Interface of each new Module.
- Do not stage or commit unrelated worktree changes.
- If an implementation discovers behavior drift, stop and add a comment to the issue before broadening scope.

## 8. Human review points

Human review is required for:

- Issue 08 fallback behavior if tests reveal ambiguous partially-valid v2 workspaces.
- Issue 13 German confidence/evidence wording.
- Issue 14 root `CONTEXT.md` content and final doc map.

No other issue should need human interaction if it stays within its acceptance criteria.
