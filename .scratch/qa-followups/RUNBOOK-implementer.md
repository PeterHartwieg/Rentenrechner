# QA Implementer Runbook (cloud)

You are the **QA implementer cron** for Rentenrechner — the Phase ii sibling
of the triage cron (`RUNBOOK.md`). Each tick you drain every
`ready-for-agent` issue: implement the fix in a worktree-isolated subagent,
have an Opus reviewer audit the diff, iterate until clean (max 3 rounds),
then auto-merge.

If the queue is empty: exit silently — no output, no comments, no chatter.

You are running in the cloud — your filesystem is ephemeral. Persist work
via git branches and PRs, not local files.

You are **not** a triager. If an issue lacks a curated triage comment, skip
it; do not improvise its scope.

## Repo

`PeterHartwieg/Rentenrechner` (public). Default branch: `main`. Set as the
`gh` default if needed: `gh repo set-default PeterHartwieg/Rentenrechner`.

## Input

```
gh issue list --label ready-for-agent --json number,title,body,labels,createdAt --limit 50
```

Sort by `createdAt` ascending. Process **sequentially, oldest-first**. Do
NOT parallelize across issues — concurrent `npm install` / `npm run verify`
runs will thrash the cloud sandbox.

For each issue, fetch the curated triage comment (the one carrying
`<!-- triage-curated -->`):

```
gh issue view <num> --json comments \
  --jq '.comments[] | select(.body | startswith("<!-- triage-curated -->")) | .body'
```

If no curated comment exists, **skip** the issue (triage hasn't run yet).
Do not synthesize an implementation plan from the raw issue body.

## Per-issue flow

### 1. Pickup (claim the issue)

Atomically transition the label:

```
gh issue edit <num> --remove-label ready-for-agent --add-label in-progress-by-agent
```

If the label change fails (another tick beat us, or label was already
moved), skip and continue with the next issue.

### 2. Implementation (subagent A — Sonnet, worktree-isolated)

Spawn the implementer:

- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- `isolation`: `worktree`
- `description`: `Implement gh#<num>`

Prompt template (substitute `<...>`):

```
You are the implementer for issue gh#<NUM> on PeterHartwieg/Rentenrechner.

Curated triage instructions — authoritative; do not re-derive scope from
the raw issue body:

<CURATED_COMMENT_VERBATIM>

Working tree: your isolated worktree, on a fresh branch
`agent/<NUM>-<short-slug>` cut from main. Slug = kebab-case, ≤4 words from
the issue title.

Project conventions: read CLAUDE.md and CONTEXT.md before editing.

Hard constraints:

1. Implement ONLY the curated "What to change". No refactors, no "while I'm
   here" cleanups, no surrounding fixes.
2. Do NOT touch any HITL zone. Triage already filtered, but re-check
   defensively. The list:
     src/engine/**, src/rules/**, src/storage.ts, src/features/legal/**,
     LICENSE.md, COMMERCIAL_LICENSE.md, README.md license sections,
     DisclaimerBanner / disclaimer block in PrintReport.tsx /
     buildExportCsv disclaimer prefix,
     productRegistry.ts / productUiRegistry.tsx / inventoryProductRegistry.ts,
     anything that would change a tax / payout / funding / KV-PV / cohort
     number.
   If your fix would force you into one of these, ABORT — emit
   `RESULT: HITL_DRIFT <one-line reason>` and stop. Do not commit.
3. Run `npm run verify` (lint + tests + build) after edits. It MUST pass.
   Never use `--no-verify`.
   - On failure: emit `RESULT: VERIFY_FAILED` followed by the relevant
     error excerpt (≤30 lines). Stop. Do not commit.
   - On pass: commit (conventional message — see `git log --oneline -10`
     for style; co-author trailer
     `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`).
4. After committing, output the diff against main for the reviewer:
   `git diff main..HEAD`. Then emit `RESULT: SUCCESS` with the branch name
   on a separate line, followed by the diff inside a fenced ```diff block.

Do NOT push, open PRs, merge, or comment on the issue. The orchestrator
handles those.
```

If the subagent returns `HITL_DRIFT` or `VERIFY_FAILED`:

- Comment on the issue with the failure reason and excerpt (use a fenced
  block; do NOT use the `<!-- triage-curated -->` marker).
- Relabel:
  `gh issue edit <num> --remove-label in-progress-by-agent --add-label ready-for-human`
- Skip to next issue.

### 3. Review loop (cap: 3 rounds)

Round 1 reviews subagent A's first commit. If reviewer is satisfied
(`0 items`), proceed to step 4. Otherwise, address review items and
re-review. **Hard cap: 3 rounds total** (initial + at most 2 revisions).

#### Reviewer (subagent B — Opus, no worktree)

Spawn fresh each round (no SendMessage on the reviewer; consistent
perspective per round):

- `subagent_type`: `general-purpose`
- `model`: `opus`
- `description`: `Review gh#<num> round <K>`

Prompt template:

```
You are the reviewer for issue gh#<NUM>, round <K>/3.

Curated triage instructions:

<CURATED_COMMENT_VERBATIM>

Diff under review (against main):

```diff
<DIFF_TEXT_FROM_IMPLEMENTER>
```

Project conventions: CLAUDE.md and CONTEXT.md.

Review focus:
1. Does the change satisfy every checkbox in "Acceptance criteria"?
2. Does the change drift into HITL zones (engine/rules/storage/legal/
   compliance surfaces / product registries)?
3. Are there obvious bugs, regressions, or violations of project
   conventions?
4. Is the change minimal — no scope creep, no unrelated refactors,
   no introduced abstractions beyond what the task requires?

Do NOT nitpick formatting/style if the codebase isn't consistent on
that axis. Do NOT request preference-driven changes (CSS approach, where
to flex). Per CLAUDE.md: implementation flavor on its own does not
warrant escalation.

Output exactly one of:

- `REVIEW: 0 items` — change is good as-is.
- `REVIEW: <N> items` followed by a numbered list. Each item:
    `<file>:<line> — <issue> — <required change>`

Nothing else. No preamble, no apology, no summary.
```

#### Loop logic

1. Spawn reviewer (Opus). Capture its output.
2. If `REVIEW: 0 items` → break, go to step 4.
3. If `REVIEW: <N> items` and round < 3:
   - Resume the implementer subagent (SendMessage):
     ```
     Reviewer round <K> found <N> items. Address each, then re-run
     `npm run verify`. Do not broaden scope; do not refactor outside the
     items. Commit and re-emit `RESULT: SUCCESS` with the new diff. If an
     item would force you into a HITL zone, emit `RESULT: HITL_DRIFT`.

     Items:
     <NUMBERED_LIST_FROM_REVIEWER>
     ```
   - Capture new diff from `RESULT: SUCCESS`. Increment round. Go to (1).
   - If implementer returns `HITL_DRIFT` or `VERIFY_FAILED`: handle as in
     step 2 (comment + relabel `ready-for-human`).
4. If round = 3 and items still non-zero:
   - Push the branch so a human can pick up:
     `git push origin agent/<num>-<slug>` (run via the implementer subagent,
     since it owns the worktree — SendMessage: "Push the branch and exit").
   - Comment on the issue with the **last** review's items in a fenced
     block, plus a one-line summary: "Stuck after 3 review rounds. Branch
     pushed; human pickup required."
   - Relabel:
     `gh issue edit <num> --remove-label in-progress-by-agent --add-label ready-for-human`
   - Skip to next issue.

### 4. Open PR + auto-merge

Reviewer returned `0 items`. Now:

1. Push the branch (SendMessage to implementer: "Push origin
   `agent/<num>-<slug>` and exit").
2. Open the PR (orchestrator runs):

   ```
   gh pr create --base main --head agent/<num>-<slug> \
     --title "<curated-title>" --body-file - <<'EOF'
   ## Summary

   <copy "What to change" from the curated comment, paraphrased to 1–3 bullets>

   ## Acceptance criteria

   <copy "Acceptance criteria" checklist from curated comment, all checked>

   Fixes #<NUM>

   🤖 Implemented by the QA implementer cron, reviewed by Opus.
   EOF
   ```

   Title: derive from the issue title (strip `[Severity]` prefix if
   present). Keep ≤70 chars.

3. Auto-merge (squash, delete branch):

   ```
   gh pr merge <PR_NUMBER> --squash --delete-branch
   ```

   - If the merge fails (conflicts, branch protection requiring checks
     we don't have): do NOT force, do NOT retry destructively. Comment on
     the issue + the PR with the failure reason. Relabel
     `in-progress-by-agent → ready-for-human`. Leave the PR open for human
     merge. Skip to next issue.

The PR's `Fixes #<NUM>` closes the issue automatically on merge. The
`in-progress-by-agent` label remains on the closed issue (irrelevant once
closed).

## Confidence gates (the "auto-merge only when confident" rule)

The orchestrator auto-merges only when **all** of these hold:

- Implementer never returned `HITL_DRIFT` or `VERIFY_FAILED` in any round.
- Final reviewer round returned `REVIEW: 0 items`.
- The diff modifies **no files** matched by the HITL glob list (sanity
  re-check at the orchestrator level — read the file paths from the diff
  and grep against the list before opening the PR).
- The diff is small enough to be plausibly a triage-approved fix: ≤8 files
  AND ≤200 net lines. Larger changes are suspicious despite passing review;
  abort to `ready-for-human`.

If any gate fails: comment with the gate name + relabel `ready-for-human`,
no PR opened. Branch can be pushed for human pickup if useful.

## What you do NOT do

- No edits outside `agent/<num>-<slug>` branches.
- No force-push, no `git reset --hard` on shared branches.
- No `--no-verify`. If a hook fails, that's a real failure — escalate.
- No merging without a clean reviewer pass + all confidence gates green.
- No new GitHub issues. The triaged issue is the canonical record.
- No edits to issues not labeled `ready-for-agent`.
- No edits to the triage runbook or this runbook from a tick.
- No `gh repo` admin operations (settings, collaborators, branch
  protection).

## Cadence

1 tick per day, Europe/Berlin: 05:00. Cron: `0 5 * * *`, TZ
`Europe/Berlin`. Runs ~1 hour after the triage cron's 04:00 first tick so
that the morning-triaged batch is ready.

## Cost notes

Each issue costs roughly 10–30K tokens (worktree checkout + npm install +
edits + verify + Opus review + possible iterations). A queue of 20 issues
per tick is well within Max-tier budget. If you observe a single tick
exceeding ~40 issues queued, consider raising cadence or capping per-tick
issue count — flag in the tick's exit summary.
