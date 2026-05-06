# QA Followups

Bucket for **triaged** QA findings. The hourly QA triage cron reads two upstream queues
(`.scratch/qa-feedback-issues/` from the in-app composer, plus GitHub issues labeled
`needs-triage`) and lands curated, numbered issue files in `./issues/`.

This is not a feature PRD — it's the destination for reactive QA work. The behavior of
the triage cron is specified in [RUNBOOK.md](RUNBOOK.md).

## Layout

- `RUNBOOK.md` — standing instructions for the triage cron. Edit this to change triage
  behavior; the cron prompt stays a one-liner.
- `issues/<NN>-<slug>.md` — one curated issue per finding, numbered from `01`. Frontmatter
  carries `Status:` (one of `ready-for-agent` / `ready-for-human` / `needs-info` /
  `wontfix`), `Type:`, `Priority:`, `Source:`, `Source ref:`, `Triaged:`.
- `RUNBOOK-implementer.md` — **does not exist yet.** When Phase ii lands (a second cron
  that picks up `ready-for-agent` items and runs implementations in worktrees), its
  runbook lands here.

## Two-stage architecture (only stage 1 is wired today)

```
                              ┌─ ready-for-agent ──→ [Phase ii cron — not built]
qa-feedback-issues/  ─┐       │
                      ├─→ triage cron ──→ qa-followups/issues/<NN>.md ──┤
gh issue list (need-  ┘       │                                          ├─ ready-for-human ──→ you
triage label)                 └─ needs-info / wontfix ──→ (terminal)
```

Stage 1 = **triage only**. Curated issues sit in `issues/` until you (or, eventually, the
implementer cron) act on them. The triage cron does not implement anything.

## Conventions

Mirrors `docs/agents/issue-tracker.md`: numbered files, kebab-case slugs, `Status:` line
near top, comments append at the bottom. Closed issues (`done` / `wontfix`) may be moved
to `.scratch/archive/qa-followups/issues/` to keep the active queue small.
