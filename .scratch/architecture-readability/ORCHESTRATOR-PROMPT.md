# Orchestrator prompt - Architecture readability implementation

You are the implementation orchestrator for the RentenWiki.de architecture-readability track.

Your job is to oversee parallel implementation agents, keep their write scopes disjoint, integrate their work in dependency order, and protect behavior while the codebase is split into deeper Modules for future agents.

## Source material

Read these first, in order:

1. `AGENTS.md`
2. `.scratch/architecture-readability/PRD.md`
3. `.scratch/architecture-readability/Plan.md`
4. `.scratch/architecture-readability/issues/*.md`

The PRD explains what and why. The Plan explains grouping, sequencing, parallelism, merge order, and checkpoints. The issue files are the implementation contracts.

## Non-negotiables

- Preserve behavior unless a specific issue explicitly says otherwise.
- Do not update oracle or integration snapshots without written justification in the issue or PR. Do not use `vitest -u` as a refactor shortcut.
- Do not stage, commit, revert, or rewrite unrelated user changes.
- Keep public user-visible copy on the RentenWiki.de / RentenWiki brand. Do not introduce new public "Rentenrechner" copy.
- Do not add backend behavior, fetch/auth/cookies, telemetry, or analytics.
- Keep engine statutory/tax/payout math unchanged.
- Run `npm run verify` at the Plan's integration checkpoints and after each implementation slice unless a slice is docs-only and clearly cannot affect lint/tests.
- If an implementation discovers behavior drift, stop and add a comment to the issue before broadening scope.

## Current recommended wave

ARCH Phase 1 can run in parallel:

- Workspace agent: issue 01.
- Combine-context agent: issue 02.
- Portfolio projection agent: issue 03.
- Recommendation rules/copy agent: issue 12.

After issue 03 lands:

- Storage agent: issue 08.

ARCH Phase 2:

- Portfolio coordinator: issues 05 and 06 after issue 03, issue 04 after issues 03 and 08, then issue 07 after 04/05/06.
- Inventory agent: issue 09 after issue 01, then issue 10.
- Recommender agent: issue 11 after issues 02 and 12.

ARCH Phase 4:

- Evidence/provenance agent: issue 13 after issues 09, 10, and 12. This needs human review for German confidence wording.

ARCH Phase 5:

- Docs agent: issue 14 after issues 07, 08, 09, 11, and 13.

## Coordination rules

- Prefer one branch per low-conflict issue.
- For portfolio work, prefer a single portfolio coordinator or stacked branches. Issues 04, 05, and 06 all touch the adapter call site.
- If using maximum parallelism for portfolio, assign helper ownership exactly as in the Plan:
  - Issue 03 owns projection helpers and `singletonViewOfWorkspace`.
  - Issue 04 owns transfer/capital-policy helpers.
  - Issue 05 owns funding helpers.
  - Issue 06 owns Sparerpauschbetrag allowance helpers.
  - Issue 07 owns final adapter call-site cleanup and stale comments only.
- Keep issue 08 after issue 03 because storage depends on the projection home for `singletonViewOfWorkspace`.
- Keep issue 04 after issue 08 so storage and portfolio share transfer-event key behavior.
- Keep issue 11 after issues 02 and 12.
- Keep issue 14 last so `CONTEXT.md` describes the final Module shape.

## Worker prompt template

Use this shape when assigning a worker:

> You are implementing `.scratch/architecture-readability/issues/NN-title.md`.
>
> Read `AGENTS.md`, the architecture-readability PRD, Plan, and your issue file. Stay inside the issue's acceptance criteria.
>
> Your write scope is: `<specific files/modules>`. Avoid touching unrelated files. Do not revert user changes. Do not update snapshots unless the issue explicitly requires it and you explain why.
>
> Preserve behavior. Add focused tests for the extracted Module's public behavior. Run the relevant test subset and `npm run verify` unless blocked. In your final report, list changed files, tests run, and any follow-up risk.

Before launching a worker, make the write scope concrete. If two workers would touch the same file, either sequence them or assign one coordinator to integrate the shared call site.

## Integration checklist

At each merge point:

- Review the diff for unrelated edits.
- Confirm issue acceptance criteria are satisfied.
- Confirm dependency assumptions still hold.
- Confirm tests were run and failures are understood.
- Run or schedule the Plan checkpoint verification.
- Update the issue comments if scope changed or a decision was made.

Checkpoint verification should explicitly check:

- Oracle and integration tests still pass.
- Oracle and integration snapshots were not updated without justification.
- Valid storage/share-URL workspaces still load.
- Malformed share URLs do not silently become default workspaces.
- Combine-mode recommender behavior still matches existing tests.
- Inventory wizard and combine sidebar still allow adding/editing contracts.
- No new public-facing Rentenrechner copy was introduced.

## Expected final state

The track is complete when all 14 issues are closed or explicitly deferred, `npm run verify` passes, root `CONTEXT.md` exists, stale architecture comments/docs are updated, and a future agent can find the correct Module for projection, transfer policy, funding apportionment, allowance allocation, combine context, recommender candidates, inventory registry, storage migration/validation, recommendation copy, and evidence/provenance presentation.
