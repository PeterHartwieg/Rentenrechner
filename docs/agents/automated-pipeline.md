# Automated issue → PR → merge pipeline

Four GitHub Actions workflows turn an `issues.opened` event into a merged PR
with no further human input beyond one label gate. The pipeline shares the
existing triage label vocabulary (`docs/agents/triage-labels.md`) and the QA
feedback flow drops into it unchanged — the QA Worker creates issues with
`needs-triage`, which fires the same triage workflow.

## Phases

```
issues.opened
    ↓
triage.yml                  → Claude enriches body (if bug), adds labels,
                              leaves needs-triage on for human review
    ↓
[human applies ready-for-agent]   ← only human gate in the pipeline
    ↓
implement.yml               → branch agent/issue-N → failing test (if applicable)
                              → fix → npm run verify → opens PR
    ↓
[PR opened — pull_request.opened]
    ↓
parallel: claude-review.yml + Codex GitHub integration auto-review
    ↓
[pull_request_review.submitted]
    ↓
review-loop.yml             → reads both reviewers' state on the head commit
                              → fix-and-push, OR merge, OR wait for the other reviewer
    ↓
gh pr merge --squash --delete-branch + remove in-progress-by-agent
```

## Workflows

| File | Trigger | Role |
|------|---------|------|
| `.github/workflows/triage.yml` | `issues.opened` | Classifies bug / enhancement / needs-info, enriches bug bodies, applies area labels for the implementer's TDD-skip decision. **Never** applies `ready-for-agent`. |
| `.github/workflows/implement.yml` | `issues.labeled` (gate: `ready-for-agent`) | Branch, failing test (unless area-skip), implementation, `npm run verify`, open PR. |
| `.github/workflows/claude-review.yml` | `pull_request.opened` / `synchronize` | Independent Claude reviewer. Posts a formal `gh pr review` with body marker `[Claude Review]`. |
| `.github/workflows/review-loop.yml` | `pull_request_review.submitted` | Implementer-as-merger. Reads both reviewers' state on the head commit. Three outcomes: merge, fix-and-push, or wait. |

All workflows scope to PRs from `agent/issue-*` branches via `if:` conditions —
human-authored PRs are not touched.

## Prerequisites (one-time setup)

1. **Install the OpenAI Codex GitHub App** on `PeterHartwieg/Rentenrechner`.
   This is the dedicated Codex reviewer. Codex auto-reviews on PR open and
   responds to `@codex review` comments. Requires a **ChatGPT Pro $100 or
   $200** subscription — the `$20` Plus tier has zero cloud-task quota.
2. **Generate a Claude Code OAuth token**:
   ```bash
   claude setup-token
   ```
   Add the resulting token as a repo secret named `CLAUDE_CODE_OAUTH_TOKEN`.
   It uses your Max subscription (no per-token billing).
3. **Add labels** missing from the repo's existing label set:
   ```bash
   gh label create area:ui-only --description "Pure CSS/layout/visual change — TDD skip" --color FBCA04
   gh label create area:copy    --description "Pure user-facing text change — TDD skip" --color FBCA04
   ```
   The pipeline already uses these existing labels: `needs-triage`,
   `needs-info`, `ready-for-agent`, `ready-for-human`, `in-progress-by-agent`,
   `bug`, `enhancement`, `documentation`, `wontfix`.
4. **Verify branch protection on `main`** allows `gh pr merge --squash` from
   the GitHub Actions bot user (or from your OAuth token's user, depending on
   how the Claude action is configured). If protection requires a specific
   number of reviews, the merge step will fail until rules accommodate the bot.

## How to trigger / halt / escalate

- **Trigger an issue into implementation**: apply `ready-for-agent` after
  reviewing the triage output. The implement workflow fires on the label-add
  event.
- **Re-trigger a stuck PR**: comment `@codex review` to re-fire Codex; push an
  empty commit (`git commit --allow-empty -m "kick"`) to re-fire Claude.
- **Halt mid-pipeline**: remove `ready-for-agent` (no effect if implementation
  already started); close the PR (the loop won't re-open it).
- **Self-escalation**: if the implementer or review-loop agent cannot make
  progress, it labels the linked issue `ready-for-human`, removes
  `in-progress-by-agent`, and stops. Look for these signals in your issue list.

## Halting / convergence

There is no hard cap on review iterations — the design trusts convergence.
The natural backstops are: your Max-plan rate limit (Claude side) and your
Pro cloud-task quota (Codex side). If a PR ping-pongs unproductively, the
quota will throttle before runaway cost.

If you want a soft cap later, add an `iteration-cap` step to `review-loop.yml`
that counts commits on the branch since open and bails to `ready-for-human`
above N.

## State labels at a glance

| Label | Set by | Means |
|-------|--------|-------|
| `needs-triage` | Issue creation (manual or QA Worker) | Triage workflow has not run yet, or has run and is awaiting human decision on `ready-for-agent` |
| `needs-info` | Triage workflow | Reporter must clarify before pipeline can proceed |
| `bug` / `enhancement` | Triage workflow | Classification |
| `area:ui-only` / `area:copy` / `documentation` | Triage workflow | TDD-skip categorization |
| `ready-for-agent` | **Human** | Gate — fires the implement workflow |
| `in-progress-by-agent` | Implement workflow | Implementation is in flight; cleared by review-loop on merge |
| `ready-for-human` | Implement / review-loop | Agent gave up; human takes over |

## Cost / quota model

| Surface | Billing | Backstop |
|---------|---------|----------|
| Claude (triage / implement / claude-review / review-loop) | Max subscription tokens via `CLAUDE_CODE_OAUTH_TOKEN` | Max plan rate limit |
| Codex (PR review) | ChatGPT Pro cloud-task quota | Pro $100: 50–300 / 5h; Pro $200: 200–1,200 / 5h |
| GitHub Actions runner minutes | Free for public repos / 2k min/mo private | Workflow concurrency groups |

## Operator playbook

- **An issue arrived that you don't want auto-implemented**: leave it at
  `needs-triage` and add `ready-for-human` after reviewing — no
  `ready-for-agent` means the implement workflow never fires.
- **Triage misclassified a bug**: edit the labels manually before applying
  `ready-for-agent`. The implementer reads the labels at the moment it fires.
- **Reviewers disagree forever**: remove `in-progress-by-agent` and the PR
  reviewers will keep reviewing but no new fixes will land. Add
  `ready-for-human` to the linked issue and resolve manually.
- **You want to review yourself before merge**: leave a `CHANGES_REQUESTED`
  human review. The loop addresses it the same way it does bot reviews. Leave
  an `APPROVED` human review for "merge when bots also agree" — the loop
  counts your APPROVE alongside theirs.
