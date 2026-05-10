# Retro Archive

Append-only log of agent-session retros. Each `investigate.yml` and
`implement.yml` run appends one entry as its final step. The
`retro-curate.yml` cron reads recent entries and proposes promotions to
`CLAUDE.md`, `investigate.yml` prompt, or `implement.yml` prompt via PR.

## Format (one entry per agent run)

```yaml
---
date: 2026-05-10T11:30:00Z
issue: 182
pr: 186            # null if no PR was opened
stage: implement   # or "investigate"
outcome: pr-opened # or "needs-info" / "ready-for-human" / "no-fix-needed"
labels: [bug, area:ui-only]
---

## Blockers

- One bullet per thing that slowed you down or that you couldn't resolve.
- "None." if there were none.

## Learnings

- Things you'd want a future agent in your shoes to know. Codebase
  conventions you discovered, surprising failure modes, useful search
  strategies, test patterns that paid off.
- "None novel." if this run produced no new patterns.

## What would have helped

- Optional. One bullet on what would have made this run shorter or surer.
- Skip the section if nothing comes to mind.
```

## Hard rules

- **Append-only.** Never modify or delete a prior entry. Wrong entries
  get corrected by the next entry's commentary, not by rewriting history.
- **Be specific.** "I learned about the codebase" is useless. File paths,
  function names, line ranges, exact failure modes — that's what helps
  future runs.
- **One entry per run, regardless of outcome.** Even "no novel learnings"
  is a useful signal for the curation cron — it confirms the run was
  routine.

## Curation

`retro-curate.yml` runs daily at 09:00 UTC. It reads entries from the
past 7 days, identifies recurring patterns or single high-signal items,
and opens a `automation/retro-curate-YYYY-MM-DD` PR proposing additions
to:

- **CLAUDE.md** — project-wide, cross-cutting knowledge.
- **`investigate.yml` prompt** — investigator-specific learnings (e.g.
  reproduction shortcuts, false-failure patterns).
- **`implement.yml` prompt** — implementer-specific learnings (e.g. fix
  patterns, test-runner gotchas).

The maintainer reviews + merges the curation PR. Promoted entries stay
in the archive (append-only) — the archive is the *evidence trail*, the
promoted text is the *operational memory*.

---

<!-- entries below; newest at the bottom -->
