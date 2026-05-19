# Codex Stage 1 Investigator Prompt

This prompt is executed by the Codex app automation for Stage 1 of the issue
pipeline. It preserves the existing Stage 1 -> Stage 2 contract:

- claim up to two `ready-for-agent` issues per run
- investigate only
- optionally add one failing test commit
- post the structured handoff comment
- apply `ready-for-PR` for `.github/workflows/implement.yml`

## Task

Process up to two GitHub issues that are ready for Stage 1 investigation in
this repository.

## Steps

Run the following loop up to two times. Stop early if there is no eligible
issue, the current run has become long enough that quality would suffer, or the
repository state is uncertain.

1. Verify the working tree is clean, then refresh `origin/main` without writing
   `.git/FETCH_HEAD`. Stage 1 normally runs in an isolated detached worktree,
   so reset that worktree to the refreshed `origin/main` instead of checking
   out local `main`:

   ```bash
   git status --short
   git fetch --no-write-fetch-head origin +refs/heads/main:refs/remotes/origin/main
   git checkout --detach origin/main
   git reset --hard origin/main
   ```

   If fetch/reset fails, stop before claiming any issue. Do not fall back to a
   plain `git fetch origin main`, because concurrent local Git activity can
   leave `.git/FETCH_HEAD` unavailable.
2. Use `gh issue list` and `gh issue view` to find the oldest open non-PR
   issue with label `ready-for-agent` and without label
   `in-progress-by-agent`. Do not use the default CLI output order; sort
   candidates by `createdAt` ascending and pick the first issue:

   ```bash
   gh issue list \
     --search 'is:issue is:open label:ready-for-agent -label:in-progress-by-agent sort:created-asc' \
     --limit 1 \
     --json number,title,labels,createdAt
   ```

   If none exists, report that there was no work left and stop.
3. Re-fetch that issue immediately before claiming it. If it no longer has
   `ready-for-agent`, restart the loop and pick the next eligible issue.
   Also check the issue body for a "Blocked by #X" line referencing another
   open issue:

   ```bash
   gh issue view <N> --json body --jq '.body' | grep -i "blocked by"
   gh issue view <BLOCKER_N> --json state --jq '.state'
   ```

   If a blocker issue is still `"open"`, apply `ready-for-human`, remove
   `in-progress-by-agent`, write a one-line retro entry noting the open
   blocker, and stop. Do not investigate or write a test. Issues in the
   `ready-for-agent` queue can have a blocking dependency that has not yet
   closed; spending an investigation run on them wastes the slot.
4. Claim it:

   ```bash
   gh issue edit <N> --add-label in-progress-by-agent --remove-label needs-triage,ready-for-agent
   ```

5. Create/reset `agent/issue-<N>` from `origin/main`, configure git author as
   `rentenwiki-agent[bot] <rentenwiki-agent[bot]@users.noreply.github.com>`,
   and inspect only the issue, `AGENTS.md`, `CONTEXT.md`, and the smallest
   relevant code/test files.
6. Investigate only. Do not implement the fix.
   - **For all issue types**, before reading implementation files, run a
     quick already-fixed pre-check:
     ```bash
     git grep -l "#<N>" -- ":(glob)src/**/*.test.*"
     git log --oneline --grep="#<N>" origin/main
     ```
     If a regression test already exists and passes (`npx vitest run
     <test-file>`), take the already-correct exit path immediately (see below).
     This avoids reclaiming issues whose fix landed on `main` after the label
     was set.
   - Bug: reproduce or validate the failure path in 1-2 sentences:
     "When X, `<file:line>` does Y, causing Z."
   - Enhancement: confirm the requested behavior is absent.
   - Code-review issue: before reading each named file, also run
     `git log --oneline --all -- <file>` to catch already-fixed reports.
   - If already correct or already present on current `main`: comment with
     objective evidence, close the issue as completed, remove
     `in-progress-by-agent`, write and append the retro entry, and stop without
     pushing a branch.
   - If too vague or not reproducible: comment with the missing evidence needed,
     apply `needs-info`, remove `in-progress-by-agent`, write and append the
     retro entry, and stop without pushing a branch.
7. Decide TDD.
   - Write a failing test for calculation, state/reactivity, routing/URL,
     storage, pure helpers, DOM-testable a11y, and QA tooling behavior.
   - Use `TDD-skip: <reason>` for pure CSS/layout, pure copy, docs, or
     manual-visual-only changes.
   - **Install dependencies first.** Stage 1 runs in an isolated worktree
     that does not have `node_modules` pre-populated. Before running any
     `npx vitest run` invocation, always run:
     ```bash
     npm ci
     npm --prefix workers/qa-submit ci  # if workers/qa-submit/package-lock.json exists
     ```
     Skipping this causes `vitest/config`, `@vitejs/plugin-react`, and other
     module resolution failures that look like test-environment errors rather
     than the actual failing assertion.
   - If writing a test: run `npx vitest run <test-file>`, confirm it fails
     for the right reason, and commit only that test with
     `test: failing test for #<N>`.
   - **Partial fixture cast.** When a test fixture only needs a few fields from
     a large domain result type (`ProductResult`, `CombinedResult`,
     `BavFundingResult`, etc.), cast with `as unknown as <Type>` rather than
     using a direct type annotation (`const x: ProductResult = { ... }`).
     Direct annotations fail `tsc -b` (used by `npm run verify`) when required
     fields are missing, causing Stage 2 to spend an iteration fixing the
     fixture before it can implement the fix.
   - **`migrateV1ToV2` creates all 6 product instances.** Tests that call
     `migrateV1ToV2(defaultProfile, defaultAssumptions)` receive a workspace
     with instances for bav, etf, insurance, basisrente, altersvorsorgedepot,
     and riester because `isEtfMeaningful()` and `isInsuranceMeaningful()`
     always return `true`. If the test only exercises a product subset, either
     filter results by `visibleProducts` or zero out the unwanted product
     arrays in the workspace after migration.
   - **`GermanRules` field paths are grouped sub-objects.** When a test or
     handoff references `de2026Rules.*`, verify the full path via
     `src/domain/rules.ts` before assuming a top-level field. The monthly
     KV/PV BBG cap, for example, lives at
     `de2026Rules.socialSecurity.healthAndCareCapMonth` — a top-level
     `de2026Rules.healthAndCareCapMonth` access compiles but fails
     `npm run verify` (tsc -b) with a type error, costing Stage 2 an
     extra iteration. Mention the exact nested path in the handoff.
   - If the new test passes today, your reproduction is wrong; exit through
     the already-correct path.
8. Push `agent/issue-<N>`.
9. Post one self-contained handoff comment beginning exactly with
   `<!-- agent-handoff:investigate -->` and containing `## Reproduction`,
   `## Files to edit`, `## Test status`, and `## Branch`.
10. Apply `ready-for-PR` with an actual GitHub label command; keep
    `in-progress-by-agent` so `.github/workflows/implement.yml` can pick up
    Stage 2. Do not merely say the label is applied.

    ```bash
    gh issue edit <N> --add-label ready-for-PR
    gh issue view <N> --json labels --jq '.labels[].name'
    ```

    The verification command prints all label names, one per line. Confirm
    `ready-for-PR` appears in the output. Use `.labels[].name` (not
    `select(.name == "ready-for-PR")`) — the `select()` form fails on Windows
    PowerShell runners because single-quote handling strips the string delimiter
    around `ready-for-PR`, causing jq to report "function not defined: PR/0".
    If `ready-for-PR` is absent from the output, stop before starting another
    issue, record the blocker in the retro entry, and report the label failure.
11. Before every issue exit, write `.automation-retro-entry.md` using
    `docs/automation/retro-template.md`, then append it:

    ```bash
    RETRO_STAGE=investigate ISSUE_NUMBER=<N> RETRO_ENTRY_PATH=.automation-retro-entry.md node scripts/automation/append-retro.mjs
    ```

    The append script returns the repo to a fresh detached `origin/main`
    worktree state. Start the next loop iteration from step 1. Do not carry
    issue-specific assumptions from one issue into the next.

## Handoff Comment

```markdown
<!-- agent-handoff:investigate -->
> *This was generated by AI during investigation (Stage 1 of the agentic pipeline).*

## Reproduction
<failure path or missing-behavior statement>

## Files to edit
- `<path:line>` - <reason>

## Test status
- Failing test added: `<path>`
- OR TDD-skip: <reason>

## Branch
`agent/issue-<N>` is ready for Stage 2 (`implement.yml`).
```

## Hard Rules

- No fix commits in Stage 1.
- No direct main pushes except through `scripts/automation/append-retro.mjs`.
- Never weaken or delete existing tests.
- Follow the project guardrails in `AGENTS.md`: disclaimer, no unsanctioned
  network calls, RentenWiki.de public copy, statutory values only in
  `src/rules/`, display rounding only at UI boundaries.
- If blocked or uncertain after investigation, label `ready-for-human`, remove
  `in-progress-by-agent`, post a concise status comment, write/append retro,
  and stop.
