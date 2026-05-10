# Issue → PR → Merge Pipeline

Seven GitHub Actions workflows that turn an `issues.opened` event into a
merged PR with **one** human gate (label-based), plus a continuous-
learning loop that promotes recurring agent learnings into operational
memory. Combines the Anthropic Claude Code Action with the OpenAI Codex
GitHub integration for dual-LLM code review. Built to be portable across
repos.

> **Status on this repo**: live since 2026-05-10. Validated end-to-end on
> issue #149 / PR #181.

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Design decisions locked in](#design-decisions-locked-in)
- [Prerequisites](#prerequisites)
- [The five workflow files](#the-five-workflow-files)
- [Operator playbook](#operator-playbook)
- [Cost model](#cost-model)
- [Known quirks (lessons from first install)](#known-quirks-lessons-from-first-install)
- [Customization points](#customization-points)
- [Adapting to a new project](#adapting-to-a-new-project)

---

## Overview

**Problem.** A solo maintainer with a steady backlog of small, well-scoped
issues (typo fixes, small bugs, copy changes, refactors found in code
review) wants those issues to ship without manual implementation, and
without sacrificing review quality.

**Solution.** Six chained GitHub Actions workflows for the issue → merge
path, plus one daily cron for continuous learning:

1. **Triage** an incoming issue (enrich body, classify bug/feature, apply
   area labels for downstream skip decisions) — leaves the issue at a
   human-readable `needs-triage` state.
2. **Human reads triage output**, applies `ready-for-agent` if happy.
3. **Investigate**: reproduce the bug (or validate the enhancement is
   missing), branch `agent/issue-N`, write a failing test (or
   judgement-call TDD-skip), push the branch, post an investigation
   comment, hand off to Stage 2 by labeling `ready-for-PR`. On
   not-reproducible: comment + `needs-info`, exit cleanly. No fix.
4. **Implement**: read Stage 1's investigation comment + the failing
   test on the branch, apply the fix, run `npm run verify`, open PR.
5. **Two independent reviewers** — Anthropic Claude (via the action,
   tailored prompt) and OpenAI Codex (via the official GitHub integration)
   — each post a formal PR review.
6. **Implementer-as-merger loop** wakes on every review submission and
   either fixes-and-pushes (if changes requested) or merges (if both
   reviewers satisfied).
7. **Sweep** workflow handles Codex's intentional silence on P2/P3 PRs:
   merges any agent PR Claude approved + Codex didn't review within 20 min.

**Continuous learning loop:**

- Each `investigate.yml` and `implement.yml` agent session, before
  exiting, appends a **retro entry** (Blockers + Learnings) to
  `docs/automation/retro-archive.md` and pushes directly to `main`.
- `retro-curate.yml` runs daily at 09:00 UTC. It reads entries from the
  past 7 days, identifies recurring patterns or single high-signal
  items, and opens a curation PR proposing promotions to **CLAUDE.md**
  (project-wide knowledge), **`investigate.yml` prompt** (Stage-1-
  specific signal), or **`implement.yml` prompt** (Stage-2-specific
  signal).
- Maintainer reviews + merges the curation PR. Promoted text becomes
  operational memory; the archive is the evidence trail.

**Why two stages for the agent's work?** A single Sonnet session that
reads code, articulates a failure path, writes a test, applies a fix,
and runs verify can balloon to 25–30 minutes — at the edge of useful
context for the model. The natural seam is between *deciding what's
broken* (and proving it via a failing test) and *fixing it*. Splitting
also means a non-reproducible bug exits cheaply — no wasted "fix" on a
report that wasn't a real bug.

**Why retro is inline (end of agent session) and not a separate post-
merge workflow?** The agent that just did the work has full context in
its working memory. A separate retro session would re-read the diff and
re-derive learnings from cold context — high cost, less signal. Inline
retro is a few extra prompt tokens at end of session for free.

**What this does NOT do.**

- Replace human judgement on architecture, product direction, or
  ambiguous specs. The `ready-for-agent` gate exists precisely so a human
  can veto before implementation starts.
- Substitute for proper testing — it runs whatever your existing test
  suite does (`npm run verify` here), no more.
- Catch every bug. Codex flags only P0/P1 by design; Claude reviewer
  applies your project's `## Review guidelines`. Subtle correctness or
  perf bugs may still ship.
- Prevent runaway cost on its own. Plan-level rate limits are the
  backstop; if you want a hard iteration cap, add it to `review-loop.yml`.

## Architecture

```
[issues.opened — human-created OR via QA worker / external automation]
    ↓
triage.yml (Claude Code Action, Sonnet)
    9-step decision tree: classifies into 5 source categories
    (QA-anonymous, QA-maintainer, non-QA pre-curated, non-QA pre-reviewed,
    non-QA plain), runs per-category dedup / already-fixed / enrichment /
    guardrail-keyword / gate-state. For QA sources it also re-derives the
    `qa(<type>)` token from the tester comment (the composer hardcodes
    `other`) and rewrites the title to match. Bounded QA bug reports
    (Major/Minor/Nit × copy/layout/a11y/value × exact/nested precision ×
    non-empty comment) auto-promote to ready-for-agent. All other paths
    leave needs-triage on.
    ↓
[human reviews triage output; applies `ready-for-agent`]   ← human gate
    (skipped on auto-promote; bypassed for from-maintainer QA submissions)
    ↓
investigate.yml (Claude Code Action, Sonnet) — Stage 1 of the agent's work
    1. branch agent/issue-N (force-create from main, idempotent)
    2. if `bug` label: REPRODUCE — read affected files, articulate
       failure path
       if `enhancement` label: VALIDATE — confirm requested behavior is
       actually missing
    3. agent's judgement call: is a failing test feasible + useful?
       (test-write OR TDD-skip with reason in the investigation comment)
    4. if test-write: place test, run `npx vitest run <new-test>` to
       confirm it fails for the right reason, commit `test: failing
       test for #N`
       if TDD-skip: no commit; branch will be at main's SHA when pushed
    5. push branch + post structured investigation comment
       (`## Reproduction`, `## Test status`, `## Branch` sections)
    6. apply `ready-for-PR` label → fires implement.yml
    on not-reproducible / behavior already correct / report too vague:
       comment with evidence + `needs-info`, remove `in-progress-by-agent`,
       exit. No branch push. No fix. (Cheap exit.)
    ↓
[ready-for-PR label fires implement.yml]
    ↓
implement.yml (Claude Code Action, Sonnet) — Stage 2
    1. checkout existing agent/issue-N (Stage 1 created it)
    2. read Stage 1's investigation comment + git log on branch (test
       commit confirms test-write; missing test commit confirms TDD-skip)
    3. if test exists: re-run it once to confirm still failing
       (Stage 1 misdiagnosis check)
    4. implement fix (must make Stage 1's test pass without weakening it)
    5. npm run verify
    6. push fix commit + open PR with "Closes #N" + "Reproduction"
       section copied from Stage 1's comment + "TDD" section
    ↓
[PR opened — pull_request.opened]
    ↓
parallel reviews:
  - Codex GitHub integration auto-reviews (P0/P1 only — silent on routine)
  - claude-review.yml (Claude Code Action, Opus 4.7)
        posts formal review with body marker [Claude Review]
        Verdict: Approve / Request changes
    ↓
[pull_request_review.submitted]
    ↓
review-loop.yml (Claude Code Action, Opus 4.7 — implementer-as-merger)
    reads all reviews on the head commit:
      - any unresolved CHANGES_REQUESTED / actionable comment
            → fix + commit + push (auto re-fires reviews)
            + post `@codex review` comment (Codex doesn't auto-re-review)
      - both reviewers satisfied
            → gh pr merge --squash --delete-branch
            + remove `in-progress-by-agent` from linked issue
      - only one reviewer in
            → no-op, wait

[if Codex stays silent on P2/P3 PR]
    ↓
review-loop-sweep.yml (cron */30 min, pure shell — no Claude agent)
    merges any agent PR > 20 min old where Claude approved + Codex silent

[parallel — every agent session ends with a retro append to main]
    investigate.yml Step 7 + implement.yml Step 6 →
    docs/automation/retro-archive.md (append-only, direct push to main)

[daily 09:00 UTC]
    ↓
retro-curate.yml (Claude Code Action, Sonnet)
    1. skip if a curate PR is already open
    2. read entries from past 7 days, group by stage
    3. identify promotable patterns (recurring OR single high-signal)
    4. for each: decide target (CLAUDE.md / investigate.yml / implement.yml)
    5. branch automation/retro-curate-YYYY-MM-DD, edit, open PR
    6. maintainer reviews + merges (curation PR is for human review)
```

## Design decisions locked in

These shaped every other choice. Worth re-confirming if you fork this for
a different project.

| Decision | This pipeline | Alternatives considered |
|----------|--------------|-------------------------|
| Run platform | **GitHub Actions** event-driven workflows | Local cron via mcp__scheduled-tasks; claude.ai cloud Routines; hybrid |
| Codex side | **Official Codex GitHub App** (auto-review on PR open + `@codex` mentions) | Codex CLI in runner with API key; Codex CLI in runner with subscription auth (icoretech/codex-action); skip Codex (use 2nd Claude) |
| Claude side | **`anthropics/claude-code-action@v1`** with OAuth token (`claude setup-token`) — uses your Max subscription | Claude API key (per-token billing); the separate Claude Code Review managed product (Team/Enterprise only) |
| Human gate | **Single gate**: `ready-for-agent` label after triage | Fully autonomous (no gate); gate at merge instead; gates at both ends |
| Approval signal | **Implementer-as-merger pattern**: review-loop reads all review state on head commit and decides itself; doesn't wait for explicit "approve" | Native GitHub APPROVE counting; custom approval labels; magic marker comments |
| Halt rule | **No iteration cap**, trust convergence (plan rate limits = backstop) | Hard cap (e.g. 4 cycles) → escalate to human; token/cost cap; time-based (24h) |
| TDD scope | **Test-first by default**, with the investigator agent making the judgement call. Strong signals to skip: `area:ui-only` / `area:copy` / `documentation`. Strong signals to write: calculation, reactivity, routing, storage, pure utility. Edge cases (a11y focus, mixed bugs) are agent-judgement. | Test-first no exceptions; best-effort by judgement; opt-in via label |
| Stage split | **Two stages for the agent's work** (`investigate.yml` → `implement.yml`) so each Sonnet session stays under ~15 min and a non-reproducible bug exits cheap. Stage boundary: failing test on branch + structured investigation comment. | Single 25–30 min session per issue; three stages (reproduce / test / fix); separate test-writer model |
| Codex P2/P3 silence handling | **Time-based 20-min timeout** via sweep workflow | Severity labels (p0/p1/p2/p3) gate; reuse area-labels as proxy; belt-and-suspenders combination |

## Prerequisites

One-time setup. Estimate: 15 min if you have everything already, 30 min if
you need to set up new accounts.

### Accounts and apps

1. **Anthropic Claude Max subscription** (Pro $100 or higher).
   Plus / API-only doesn't work for OAuth-token auth.
2. **OpenAI ChatGPT Pro $100 or $200 subscription**. Plus has zero
   Codex cloud-task quota; you need at least Pro $100 (50–300 cloud
   tasks per 5 hours).
3. **OpenAI Codex GitHub App** installed on the repo. Configure at
   <https://chatgpt.com/codex/settings/code-review>:
   - Repo in the auto-review list
   - Trigger mode: **on PR open** (recommended)

### Repo secrets

In `Settings → Secrets and variables → Actions → New repository secret`:

- **`CLAUDE_CODE_OAUTH_TOKEN`** — generated locally with
  `claude setup-token`, paste the resulting string. Used by all four
  Claude-Code-Action workflows.

(`GITHUB_TOKEN` is provided automatically by Actions; `OPENAI_*` is **not
needed** because Codex runs server-side via the App, not in the runner.)

### Repo labels

Create these once via `gh label create`:

```bash
# State labels (already standard mattpocock/skills vocabulary)
gh label create needs-triage         --color FBCA04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info           --color D93F0B --description "Waiting on reporter for more information"
gh label create ready-for-agent      --color 0E8A16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-PR         --color 0A788C --description "Stage 1 done: failing test on branch, ready for the implementer to fix and open the PR"
gh label create ready-for-human      --color 1D76DB --description "Requires human implementation"
gh label create in-progress-by-agent --color BFD4F2 --description "Implementer agent is actively working on this issue"

# TDD-skip categorisation
gh label create area:ui-only         --color FBCA04 --description "Pure CSS/layout/visual change — TDD skip"
gh label create area:copy            --color FBCA04 --description "Pure user-facing text change — TDD skip"
# (the 'documentation' label is a GitHub default)

# Triage decision-tree labels
gh label create from-maintainer       --color 5319E7 --description "Submitted by maintainer via QA dev-code; pre-validated, skip dedup"
gh label create needs-product-review  --color FFAA00 --description "Touches CLAUDE.md guardrails — needs product/license review before agent picks up"
gh label create possible-duplicate    --color C5DEF5 --description "Title fuzzy-match against an existing open issue; maintainer please confirm"
gh label create fixed-in-PR           --color 0E8A16 --description "Closed by triage as likely fixed by a recent merged PR; verify after deploy"
# (the 'duplicate' label is a GitHub default — used for the strong-signal QA auto-close path)
```

### Branch protection

The pipeline is happy with no protection on `main` (the bot can squash-merge
freely). For minimal hardening that keeps the bot working:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection \
  -f required_status_checks=null \
  -F enforce_admins=false \
  -f required_pull_request_reviews=null \
  -F restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F required_linear_history=true
```

This blocks force-push and deletion of `main`, requires linear history
(matches `--squash` merges), and does **not** require human review (so the
auto-merge step still works).

### `## Review guidelines` section

Add a `## Review guidelines` heading to your repo's `AGENTS.md` (the file
Codex reads for project context). Codex's GitHub review integration parses
this section to scope its comments to project-relevant P0/P1 categories
instead of generic security/correctness heuristics. Mirror the same
section in `CLAUDE.md` so the Claude reviewer applies the same bar.

See this repo's `AGENTS.md` and `CLAUDE.md` for an example structure
(P0 / P1 / Out-of-scope categories).

## The seven workflow files

All live in `.github/workflows/`. Each is a few dozen lines — see the
canonical files for the full content; this section explains what each
does and the key parameters that shape behavior.

### `triage.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `issues.opened` | `contents:read`, `issues:write`, `id-token:write` | Sonnet (default) |

Fires on every new issue. Runs an 8-step decision tree that classifies
the issue into one of five **source categories** and branches per
category for dedup / enrichment / guardrail-keyword / gate-state.

**Source categories:**

| Category | Detection signal | Treatment |
|---|---|---|
| **A. QA-anonymous** | Title `[Severity] qa(type): ...` regex match + body header table (`Target id`, `Route`, `Privacy flags`, …) + no `from-maintainer` label | **Strong dedup** (same `Target id` + `Route` → auto-close + label `duplicate`). **Already-fixed** check (any merged PR in last 14 days touching files matching the target id's semantic prefix → close + label `fixed-in-PR`). No body enrichment (header table + screenshot pinpoint the issue). |
| **B. QA-maintainer** | A's signals + `from-maintainer` label (set by Worker on `?dev=` match) | **Skip dedup, already-fixed, product-review** — the maintainer has already considered the queue. |
| **C. Non-QA pre-curated** | Body has checkboxes (`- [ ]`), or both `## What to change` + `## Acceptance criteria` headings, or a reference to `docs/adr/` / `docs/.../*.md` | No enrichment, no dedup — body is already curated. |
| **D. Non-QA pre-reviewed** | Body has literal `Source: code-review session` or `Source: ultrareview` marker | No enrichment, no dedup — code-review session output is the curation. |
| **E. Non-QA plain** | None of A–D | Light **title-only** dedup → label `possible-duplicate`, no auto-close. Enrich body if bug; leave alone if enhancement. |

**Auto-promote to `ready-for-agent`** (skip the human gate, fire
`investigate.yml` immediately, which on success hands off to
`implement.yml`) only when ALL hold:

- Source A or B (QA-Worker)
- Classified as `bug` (not enhancement, not needs-info)
- Step 4 dedup did not exit early
- Title severity `Major` / `Minor` / `Nit` (NOT `BLOCKER`)
- Step 3b re-derived type is `copy` / `layout` / `a11y` / `value`
  (the agent re-classifies because the QA composer hardcodes `other` —
  see Step 3b below)
- `Target id` row present, `Precision` is `exact` or `nested`
- `## Tester comment` non-empty (>10 chars of substance)

**Step 3b — QA type reclassification.** The QA composer
(`QaFeedbackProvider.tsx`) currently hardcodes `type: 'other'` on every
submission, so the title token alone is not a reliable type signal. For
sources A and B the triage agent re-derives the type from the
`## Tester comment` and the screenshot URL filename, picking from
`copy` / `layout` / `value` / `a11y` / `flow` / `interaction` / `other`.
If the derived type differs from the title's token, triage rewrites the
title via `gh issue edit --title`. The auto-promote whitelist
(`copy` / `layout` / `a11y` / `value`) is checked against the derived
type, not the original token. Calculation bugs (`value`) get no area
label, so the investigator agent's TDD-feasibility judgement defaults to
"write a test" — calculation behavior is testable, which is exactly
when test-first pays off.

**Maintainer dev-code path.** Open the calculator with `?dev=<code>` once
per browser tab. Frontend (`src/features/qa-feedback/devCode.ts`) persists
the code to sessionStorage and strips the URL param. The qa-submit Worker
validates the POST payload's `devCode` field against the
`MAINTAINER_DEV_CODE` Wrangler secret and applies the `from-maintainer`
label on match — the code never appears in the issue body or any public
surface. Triage then routes via category B and skips dedup +
product-review on the maintainer's own filings.

**Guardrail keyword check (enhancements only).** For sources A, D, and E
(skipped for B and C — implicit maintainer trust), scans the body and
`## Tester comment` for backend / commercial / compliance keywords
(`telemetry`, `analytics`, `Berater`, `premium`, `Disclaimer entfernen`,
…). On match: applies `needs-product-review` + posts a comment listing
the matched keyword and the CLAUDE.md guardrail line it touches. The
human still applies `ready-for-agent` after confirming the request is
in-scope.

**Wish re-route.** A QA-shape submission whose `## Tester comment` reads
as a feature wish ("Wäre schön wenn…", "Kann das auch X?") is
re-classified as `enhancement` despite the QA shape — preserving the
screenshot and metadata while routing through the enhancement path
(no auto-promote, guardrail check still runs).

### `investigate.yml` (Stage 1)

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `issues.labeled` (gate: `ready-for-agent`) | `contents:write`, `issues:write`, `id-token:write` | Sonnet (default) |

Fires when `ready-for-agent` is added. Sets `in-progress-by-agent`,
removes `needs-triage` + `ready-for-agent`, branches
`agent/issue-N` (force-create from `main`, idempotent on re-trigger),
**reproduces the bug** (or **validates the enhancement is missing**),
makes a judgement call on whether a failing test is feasible + useful,
optionally writes + commits the test, pushes the branch, posts a
structured investigation comment, applies `ready-for-PR` to fire Stage 2.

**Three reproduction outcomes (bugs).** Before any test or fix, the
agent reads the affected files and articulates the failure path:
"When the user does X, code path Y at <file:line> does Z, which
produces the reported wrong behavior."

- **Reproduced** — proceed to test-writing decision.
- **Code already does the right thing** — comment with specific
  evidence (which files inspected, what they do, why this contradicts
  the report), apply `needs-info`, remove `in-progress-by-agent`, exit
  cleanly. **No branch push, no test, no fix.**
- **Report too vague to locate** — comment listing what was searched
  and what's needed (specific element, repro steps, expected vs actual
  values), apply `needs-info`, exit cleanly.

**Test-writing decision (agent judgement).** Strong signals to write:
calculation, reactivity, routing, storage, pure utility. Strong signals
to skip (TDD-skip): `area:ui-only` / `area:copy` / `documentation`,
or anything where the only meaningful test is a manual visual check.
Edge cases (a11y focus, mixed bugs) are agent-judgement.

**Investigation comment.** Always posted on success. Stage 2 reads it.
Format: `## Reproduction` (failure path) + `## Test status` (failing
test path OR `TDD-skip: <reason>`) + `## Branch` (`agent/issue-N`
ready-for-Stage-2 marker).

`needs-info` (reporter must supply more detail) vs `ready-for-human`
(needs human implementation) are distinct cleanup paths — Stage 1
reproduction failures are `needs-info`; Stage 2 verify failures and
Stage 1 misdiagnosis escapes are `ready-for-human`.

### `implement.yml` (Stage 2)

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `issues.labeled` (gate: `ready-for-PR`) | `contents:write`, `issues:write`, `pull-requests:write`, `id-token:write` | Sonnet (default) |

Fires when `ready-for-PR` is added (typically by `investigate.yml`,
but a maintainer may apply it manually to skip Stage 1 if a failing
test is already on the branch). Removes `ready-for-PR`, checks out the
existing `agent/issue-N` branch, reads Stage 1's investigation comment,
re-runs Stage 1's failing test once to confirm it still fails (escape
hatch: if it now passes, Stage 1 misdiagnosed — comment + apply
`ready-for-human` + exit, do not implement), implements the fix,
runs `npm run verify`, opens PR with `Closes #N` + a "Reproduction"
section copied from Stage 1's comment + a "TDD" section.

If `npm run verify` won't pass: posts a comment on the issue, applies
`ready-for-human`, removes `in-progress-by-agent`, exits cleanly. **Does
not open a broken PR.**

The implementer agent must NOT modify or delete Stage 1's failing-test
commit. If the test is wrong, escalate via `ready-for-human` instead of
silently rewriting it — that's a Stage 1 escape that needs human
inspection.

### `claude-review.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `pull_request.opened/synchronize/reopened` (only `agent/issue-*` branches) | `contents:read`, `pull-requests:write`, `issues:read`, `id-token:write` | **Opus 4.7** |

Independent Claude reviewer. Different model than implementer (Opus for
deeper judgement). Reads PR diff + linked issue + `CLAUDE.md` +
`CONTEXT.md`, runs `npm run verify` to confirm head commit passes, posts
exactly one formal `gh pr review`. Body MUST start with literal marker
`[Claude Review]` and contain `Verdict: Approve` or `Verdict: Request
changes` — both `review-loop.yml` and `review-loop-sweep.yml` parse the
body, not the formal review state (see "Known quirks").

### `review-loop.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `pull_request_review.submitted` (only `agent/issue-*` branches) | `contents:write`, `pull-requests:write`, `issues:write`, `id-token:write` | **Opus 4.7** |

Implementer-as-merger. Wakes on every review submission, identifies the
two reviewers (Claude by `[Claude Review]` body marker; Codex by
`*codex*` / `*openai*` in author login), filters reviews to ones on the
current head SHA. Three outcomes:

- **Both satisfied** → run `npm run verify` once more → `gh pr merge
  --squash --delete-branch` → remove `in-progress-by-agent` from linked
  issue.
- **Any change requested** → address all asks in one commit + push +
  ping `@codex review` (Codex doesn't auto-re-review on synchronize).
- **Only one reviewer in** → no-op (wait for the other).

If a reviewer's feedback is unaddressable, posts a status comment on the
PR, labels linked issue `ready-for-human`, removes
`in-progress-by-agent`, exits.

### `retro-curate.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `schedule: '0 9 * * *'`, `workflow_dispatch` | `contents:write`, `issues:write`, `pull-requests:write`, `id-token:write` | Sonnet (default) |

Continuous-learning loop. Reads `docs/automation/retro-archive.md`,
filters to entries from the past 7 days, identifies recurring patterns
or single high-signal items, decides per-item whether the target is
CLAUDE.md (project-wide), `investigate.yml` prompt (Stage-1-specific),
or `implement.yml` prompt (Stage-2-specific), opens a curation PR with
surgical edits.

The retro archive is **append-only** — neither the curation agent nor
the agent sessions ever modify or delete prior entries. Promoted text
becomes operational memory; the archive is the immutable evidence
trail. Sources are cited in the curation PR body by date + issue number
so the maintainer can audit each proposed addition.

Key safeguards:
- Skips if any `automation/retro-curate-*` PR is already open (prevents
  double-curation while a batch is pending review).
- Exits cleanly on no-promotable-patterns days — many cron runs will
  find nothing worth promoting; that's the intended steady state.
- Never widens hard rules in workflow prompts without retro evidence;
  hard rules are gates, not soft guidance.

### `review-loop-sweep.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `schedule: '*/30 * * * *'`, `workflow_dispatch` | `contents:write`, `pull-requests:write`, `issues:write` | None (pure shell) |

Codex's GitHub review integration intentionally only flags P0/P1 — for
routine PRs (docs, copy, small refactors) it stays silent. The
event-driven loop would wait forever. This sweep runs every 30 min and
merges any agent PR > 20 min old where Claude approved + Codex never
posted. **No Claude agent invocation** — pure `gh` + `jq` shell, so it's
cost-zero on idle (just runner minutes for the cron tick).

The 20-min threshold is the only tunable. Increase if Codex sometimes
takes > 20 min on this repo; decrease if you want faster routine-PR
turnaround.

## Operator playbook

| Action | How |
|--------|-----|
| Trigger an issue into implementation | `gh issue edit N --add-label ready-for-agent` (after reviewing triage output) |
| Submit QA feedback as the maintainer (skip dedup) | Open the calculator with `?qa=1&dev=<your-code>` once per browser tab. Triage routes via category B. The code is set as the `MAINTAINER_DEV_CODE` Wrangler secret on `rentenwiki-qa-submit`. |
| Override an auto-promote that's misclassified | Remove `ready-for-agent` and add `needs-info` or `ready-for-human`. If `investigate.yml` already ran (branch + investigation comment exist) and you want to halt before the fix: remove `ready-for-PR` if it's been applied. If `implement.yml` already opened a PR, close the PR — review loop won't re-open it. |
| Re-fire a stuck Claude review | `git commit --allow-empty -m "kick" && git push` to the PR branch — fires `pull_request.synchronize` |
| Re-fire a stuck Codex review | `gh pr comment N --body "@codex review"` |
| Halt mid-pipeline | Remove `ready-for-agent` (only effective before `investigate.yml` fires); remove `ready-for-PR` (only effective before `implement.yml` fires); close the PR (loop won't re-open it) |
| Self-escalation | If implementer or loop can't make progress, it labels linked issue `ready-for-human`, removes `in-progress-by-agent`, posts a status comment, and stops. Watch your `ready-for-human` queue. |
| Override sweep merge | Don't add `[Claude Review]\nVerdict: Approve` to the review body. Sweep matches that exact pattern; if Claude reviewer didn't approve, sweep won't merge. |
| Manual sweep run | `gh workflow run review-loop-sweep.yml` |

## Cost model

| Surface | Billing | Backstop |
|---------|---------|----------|
| Claude (triage / implement / claude-review / review-loop) | Max subscription tokens via `CLAUDE_CODE_OAUTH_TOKEN` | Max plan rate limit |
| Codex (PR review) | ChatGPT Pro cloud-task quota | Pro $100: 50–300 / 5h; Pro $200: 200–1,200 / 5h |
| GitHub Actions runner minutes | Free for public repos / 2 000 min/mo private | Workflow concurrency groups + sweep cron rate |
| Claude Code Review (separate product) | NOT used in this design — Team/Enterprise only, $15–25/review | n/a |

For a solo dev's volume (~5–10 PRs / day, 2–3 review iterations each):
both quotas are comfortable on Pro $100 and very comfortable on Pro $200.

## Known quirks (lessons from first install)

These came from setting up the pipeline on `PeterHartwieg/Rentenrechner`;
folding here so they don't bite next time:

1. **`id-token: write` permission required.** `claude-code-action` does
   an OIDC handshake even when authenticating with
   `CLAUDE_CODE_OAUTH_TOKEN`. Symptom: *"Could not fetch an OIDC token"*.
   Fix: add `id-token: write` to every workflow's `permissions:` block.

2. **`allowed_bots: '*'` required for bot-to-bot triggering.** The
   action refuses to run by default if its triggering event came from
   another bot. The dual-review design intentionally chains bots
   (implementer Claude opens PR → fires Claude reviewer → fires
   review-loop). Symptom: *"Workflow initiated by non-human actor"*.
   Fix: pass `allowed_bots: '*'` in every step's `with:` block.

3. **First PR after pipeline install fails workflow-validation.** The
   action checks that the workflow YAML on the PR's branch matches the
   version on `main`. The very first PR is branched from a `main` that
   doesn't yet have the latest workflow tweaks. Symptom: *"The workflow
   file must exist and have identical content to the version on the
   repository's default branch"*. Fix: `git merge origin/main` into the
   PR branch and push. Subsequent PRs branch from a `main` that already
   has the workflows, so the issue doesn't recur.

4. **Claude review state is `COMMENTED`, not `APPROVED`.** GitHub
   doesn't let you approve a PR you authored. Since `claude[bot]`
   authored the implementer commits AND posts the review, it's blocked
   from `--approve` and falls back to `--comment`. The review body still
   starts with `[Claude Review]` and contains `Verdict: Approve` or
   `Verdict: Request changes`. The loop and sweep parse the body marker,
   not the formal review state.

5. **Codex stays silent on P2/P3 PRs by design.** Codex's GitHub
   integration intentionally only posts findings for P0/P1 issues. For
   routine PRs (docs, copy, small refactors) it produces no review at
   all. `review-loop-sweep.yml` handles this with a 20-min timeout. To
   make Codex's reviews more project-aware on the PRs it does process,
   add a `## Review guidelines` section to `AGENTS.md` listing your
   repo's P0/P1 categories.

6. **`@codex review` mention does NOT work from a bot identity.** Codex
   gates the mention path on the *commenter*'s account having a Codex
   subscription. When `claude[bot]` posts `@codex review` (e.g. from
   `review-loop.yml` after a fix push), Codex replies "To use Codex
   here, create a Codex account and connect to github" — pointed at
   the bot, which can't follow it. Codex's auto-review on
   `pull_request.opened` works fine because it triggers under the
   App's own server-side identity, not via a comment mention.

   **Implication:** routine PRs survive (Codex is silent → sweep
   merges). The case that breaks: Codex posts CHANGES_REQUESTED on
   open, fix is pushed, Codex doesn't auto-re-review on synchronize,
   bot can't ping Codex to re-review, sweep is blocked by the stale
   CHANGES_REQUESTED → maintainer must manually post `@codex review`
   from their own account to unblock. Logged in `review-loop.yml`'s
   Step 4b for visibility.

7. **Stage 1 retro timestamps may be agent-fabricated, not from
   `date -u`.** Sonnet sometimes invents the timestamp in the
   frontmatter `date:` field rather than running `date -u
   +%Y-%m-%dT%H:%M:%SZ`. Frontmatter is still parseable and dates are
   correct to the day, so the curation cron's 7-day window still
   works. Tighten the prompt if minute-precision matters for your
   curation logic.

## Customization points

Each of these is tunable without touching the architecture.

| What | Where | How |
|------|-------|-----|
| Reviewer model | `claude_args: --model <id>` in `claude-review.yml` and `review-loop.yml` `with:` block | Default Opus 4.7. Switch to Sonnet for faster/cheaper, or upgrade as new models ship. |
| Investigator model | `claude_args` in `investigate.yml` | Default Sonnet. Switch to Opus for harder reproductions (more thorough code reading, better test-design judgement). |
| Implementer model | `claude_args` in `implement.yml` | Default Sonnet. Switch to Opus for harder fixes. |
| TDD-skip judgement | "Test-writing decision" block in `investigate.yml` prompt (Step 3) | The agent decides per-issue using strong-signal lists for write/skip and judgement on edge cases. Tighten by adding more "skip" signals; loosen by removing them. |
| QA auto-promote eligibility | "Auto-promote to `ready-for-agent`" block in `triage.yml` prompt (Step 8) | Tighten/widen the severity × type matrix. Default: `Major`/`Minor`/`Nit` × `copy`/`layout`/`a11y`/`value` (where `value` is calculation bugs, classified by the Step 3b re-derivation). Tightening to `Minor`/`Nit` only narrows to lowest-stakes; adding `flow`/`interaction` widens to multi-step user-journey bugs. |
| Guardrail keyword list | "Step 7" block in `triage.yml` prompt | Three groups (Backend / Commercial / Compliance). Each is a comma-separated keyword list, case-insensitive whole-word match. Add German equivalents as needed. |
| QA Target id → file path mapping | "Step 4" block in `triage.yml` prompt (semantic prefix table) | Maps semantic ids like `inputs.<product>.*` to file globs. Update when your project's component layout differs. |
| Maintainer dev-code | `MAINTAINER_DEV_CODE` Wrangler secret on `rentenwiki-qa-submit`; URL param `?dev=` in the QA-feedback frontend | Rotate via `wrangler secret put`. The code lives only in your sessionStorage and on the wire — never in any public surface. |
| Halt cap | Currently none. | Add an `iteration-cap` step to `review-loop.yml` that counts commits on the agent branch since open and bails to `ready-for-human` above N. |
| Sweep threshold | `MIN_AGE_MINUTES` env var in `review-loop-sweep.yml` | Default 20 min. Increase if Codex sometimes takes longer; decrease for faster routine merges. |
| Sweep cadence | `cron: '*/30 * * * *'` in `review-loop-sweep.yml` | Default every 30 min. Tighten for faster turnaround at small extra runner-minute cost. |
| Retro curation cadence | `cron: '0 9 * * *'` in `retro-curate.yml` | Default daily 09:00 UTC. Tighten to `0 */12 * * *` (twice daily) if you want faster promotion of urgent learnings; loosen to weekly if PR queue noise is too high. |
| Retro lookback window | "past 7 days" filter in `retro-curate.yml` Step 2 | Default 7 days — robust to skipped cron days and pending curation PRs. Tighten to 3 days if your archive grows fast; widen to 14 days if you want more cross-issue pattern detection. |
| Reviewer prompt strictness | `prompt:` block in `claude-review.yml` | Tune the bullet list of "What to review" + reference your repo's `## Review guidelines`. |
| Branch naming | `agent/issue-$ISSUE_NUMBER` in `investigate.yml` (creates) + `implement.yml` (consumes) + `startsWith(...,'agent/issue-')` in every other workflow | Change the prefix consistently across all five files. |
| Merge style | `gh pr merge --squash --delete-branch` in `review-loop.yml` step 4a + `review-loop-sweep.yml` | Switch to `--merge` or `--rebase` if you want a different history. |
| Approval body marker | `[Claude Review]` in `claude-review.yml` and parsed in loop + sweep | Change in all three places. |
| Codex reviewer detection heuristic | `select(.user.login \| test("codex\|chatgpt"; "i"))` in loop + sweep | Tighten if your repo has unrelated bots whose login matches that pattern. |

## Adapting to a new project

Step-by-step. Estimate: 30–45 min total (most is waiting for first
end-to-end run to validate).

1. **Copy the five workflow files** from `.github/workflows/` of this
   repo into your new repo's `.github/workflows/`.

2. **Find and replace project-specific bits** in the workflow prompts
   (search for and update):
   - Repo name (`PeterHartwieg/Rentenrechner` → yours) — only in commit
     messages / status comments, not in workflow logic.
   - Verify command (`npm run verify`) — adjust to your test/build script
     in `investigate.yml`, `implement.yml`, `claude-review.yml`,
     `review-loop.yml`.
   - Linked-issue marker (`Closes #N`) — keep, it's the GitHub standard.
   - Project-specific instruction lines like "Read CLAUDE.md and
     CONTEXT.md first" — point to your project's equivalent docs.
   - `qa-runbook` reference in `implement.yml` step "Mark
     in-progress-by-agent" prompt — adjust or drop if your repo doesn't
     have that convention.

3. **Subprojects with their own `package.json`.** If your repo has
   subdirectories that ship their own `package.json` (in this repo:
   `workers/qa-submit/`), the workflows that run `npm run verify` need
   to install those subdir deps too — the root `npm ci` doesn't traverse
   into them. The "Install deps" step in `investigate.yml`,
   `implement.yml`, and `review-loop.yml` runs
   `npm ci && npm --prefix workers/qa-submit ci`
   for that reason (this repo's `npm run verify` chains
   `worker:typecheck` and `worker:test`, both of which need
   `@cloudflare/workers-types` from the subdir). When porting to a
   different repo, replace `workers/qa-submit` with your subproject path
   — or drop the second `npm ci` if you don't have one. Symptom of
   forgetting: `tsc --noEmit` fails in CI with "Cannot find type
   definition file for ..." (commit `efcfc75` for the original fix).

4. **Run the prerequisites checklist** above:
   - Install Codex GitHub App + configure auto-review
   - Generate `CLAUDE_CODE_OAUTH_TOKEN` + add as repo secret
   - Create labels (`gh label create ...`)
   - Optional: branch protection
   - Add `## Review guidelines` to your `AGENTS.md` + `CLAUDE.md`

5. **First-PR workaround**: when you fire your first issue through, the
   PR branch will be missing the latest workflow YAML on `main`. Merge
   `main` into the PR branch and push (one-time per install). See
   "Known quirks" §3.

6. **Validate end-to-end** on a tiny throwaway issue (e.g. a typo fix in
   README). Watch the Actions tab for each phase. Don't fire your real
   backlog until this works clean.

7. **Tune** to taste — see "Customization points" above.
