# Issue → PR → Merge Pipeline

Five GitHub Actions workflows that turn an `issues.opened` event into a
merged PR with **one** human gate (label-based). Combines the Anthropic
Claude Code Action with the OpenAI Codex GitHub integration for dual-LLM
code review. Built to be portable across repos.

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

**Solution.** Five chained GitHub Actions workflows:

1. **Triage** an incoming issue (enrich body, classify bug/feature, apply
   area labels for downstream skip decisions) — leaves the issue at a
   human-readable `needs-triage` state.
2. **Human reads triage output**, applies `ready-for-agent` if happy.
3. **Implement**: branch, write failing test (unless area-skip applies),
   fix, run `npm run verify` (or your equivalent), open PR.
4. **Two independent reviewers** — Anthropic Claude (via the action,
   tailored prompt) and OpenAI Codex (via the official GitHub integration)
   — each post a formal PR review.
5. **Implementer-as-merger loop** wakes on every review submission and
   either fixes-and-pushes (if changes requested) or merges (if both
   reviewers satisfied).
6. **Sweep** workflow handles Codex's intentional silence on P2/P3 PRs:
   merges any agent PR Claude approved + Codex didn't review within 20 min.

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
    8-step decision tree: classifies into 5 source categories
    (QA-anonymous, QA-maintainer, non-QA pre-curated, non-QA pre-reviewed,
    non-QA plain), runs per-category dedup / already-fixed / enrichment /
    guardrail-keyword / gate-state. Bounded QA bug reports (Major/Minor/Nit
    × copy/layout/a11y × exact/nested precision × non-empty comment)
    auto-promote to ready-for-agent. All other paths leave needs-triage on.
    ↓
[human reviews triage output; applies `ready-for-agent`]   ← human gate
    (skipped on auto-promote; bypassed for from-maintainer QA submissions)
    ↓
implement.yml (Claude Code Action, Sonnet)
    1. checks issue labels for area:ui-only / area:copy / documentation
       → TDD-skip flag
    2. branch agent/issue-N
    3. if not TDD-skip: write failing test, commit
    4. implement fix, commit
    5. npm run verify
    6. push branch + open PR with "Closes #N"
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
| TDD scope | **Test-first by default**, skip for `area:ui-only` / `area:copy` / `documentation` | Test-first no exceptions; best-effort by judgement; opt-in via label |
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

## The five workflow files

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
`implement.yml` immediately) only when ALL hold:

- Source A or B (QA-Worker)
- Classified as `bug` (not enhancement, not needs-info)
- Step 4 dedup did not exit early
- Title severity `Major` / `Minor` / `Nit` (NOT `BLOCKER`)
- Title type `copy` / `layout` / `a11y`
- `Target id` row present, `Precision` is `exact` or `nested`
- `## Tester comment` non-empty (>10 chars of substance)

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

### `implement.yml`

| Trigger | Permissions | Model |
|---------|-------------|-------|
| `issues.labeled` (gate: `ready-for-agent`) | `contents:write`, `issues:write`, `pull-requests:write`, `id-token:write` | Sonnet (default) |

Fires when `ready-for-agent` is added. Sets `in-progress-by-agent`,
removes `needs-triage` + `ready-for-agent`, branches `agent/issue-N`,
decides TDD-skip from labels, writes failing test (if not skipped),
implements fix, runs `npm run verify`, opens PR with `Closes #N` in body.

If `npm run verify` won't pass: posts a comment on the issue, applies
`ready-for-human`, removes `in-progress-by-agent`, exits cleanly. **Does
not open a broken PR.**

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
| Override an auto-promote that's misclassified | Remove `ready-for-agent` and add `needs-info` or `ready-for-human`. If `implement.yml` already ran, close the PR — review loop won't re-open it. |
| Re-fire a stuck Claude review | `git commit --allow-empty -m "kick" && git push` to the PR branch — fires `pull_request.synchronize` |
| Re-fire a stuck Codex review | `gh pr comment N --body "@codex review"` |
| Halt mid-pipeline | Remove `ready-for-agent` (no effect if implementation already started); close the PR (loop won't re-open it) |
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

## Customization points

Each of these is tunable without touching the architecture.

| What | Where | How |
|------|-------|-----|
| Reviewer model | `claude_args: --model <id>` in `claude-review.yml` and `review-loop.yml` `with:` block | Default Opus 4.7. Switch to Sonnet for faster/cheaper, or upgrade as new models ship. |
| Implementer model | `claude_args` in `implement.yml` | Default Sonnet. Switch to Opus for harder bugs (slower / more expensive). |
| TDD-skip categories | `if it contains any of area:ui-only, area:copy, documentation` clause in `implement.yml` prompt | Add or remove labels from the skip list. |
| QA auto-promote eligibility | "Auto-promote to `ready-for-agent`" block in `triage.yml` prompt (Step 8) | Tighten/widen the severity × type matrix. Default: `Major`/`Minor`/`Nit` × `copy`/`layout`/`a11y`. Adding `qa(value)` widens to calc-output bugs; tightening to `Minor`/`Nit` only narrows to lowest-stakes. |
| Guardrail keyword list | "Step 7" block in `triage.yml` prompt | Three groups (Backend / Commercial / Compliance). Each is a comma-separated keyword list, case-insensitive whole-word match. Add German equivalents as needed. |
| QA Target id → file path mapping | "Step 4" block in `triage.yml` prompt (semantic prefix table) | Maps semantic ids like `inputs.<product>.*` to file globs. Update when your project's component layout differs. |
| Maintainer dev-code | `MAINTAINER_DEV_CODE` Wrangler secret on `rentenwiki-qa-submit`; URL param `?dev=` in the QA-feedback frontend | Rotate via `wrangler secret put`. The code lives only in your sessionStorage and on the wire — never in any public surface. |
| Halt cap | Currently none. | Add an `iteration-cap` step to `review-loop.yml` that counts commits on the agent branch since open and bails to `ready-for-human` above N. |
| Sweep threshold | `MIN_AGE_MINUTES` env var in `review-loop-sweep.yml` | Default 20 min. Increase if Codex sometimes takes longer; decrease for faster routine merges. |
| Sweep cadence | `cron: '*/30 * * * *'` in `review-loop-sweep.yml` | Default every 30 min. Tighten for faster turnaround at small extra runner-minute cost. |
| Reviewer prompt strictness | `prompt:` block in `claude-review.yml` | Tune the bullet list of "What to review" + reference your repo's `## Review guidelines`. |
| Branch naming | `agent/issue-$ISSUE_NUMBER` in `implement.yml` + `startsWith(...,'agent/issue-')` in every other workflow | Change the prefix consistently across all four files. |
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
     in `implement.yml`, `claude-review.yml`, `review-loop.yml`.
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
   into them. The "Install deps" step in `implement.yml` and
   `review-loop.yml` runs `npm ci && npm --prefix workers/qa-submit ci`
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
