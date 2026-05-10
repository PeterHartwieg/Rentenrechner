# Retro Entry Template

Format for entries appended to `docs/automation/retro-archive.md` by
`investigate.yml` and `implement.yml`. Kept in a separate file so agents can
read this small template (~1 KB) instead of the monotonically-growing archive.

## Entry shape

```markdown
---
date: 2026-05-10T11:30:00Z
issue: 182
pr: 186            # null if no PR was opened
stage: implement   # or "investigate"
outcome: pr-opened # or "needs-info" / "ready-for-human" / "no-fix-needed" / "ready-for-PR"
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

## Hard rules (mirrored from retro-archive.md)

- **Append-only.** Never modify or delete a prior entry. Wrong entries
  get corrected by the next entry's commentary, not by rewriting history.
- **Be specific.** "I learned about the codebase" is useless. File paths,
  function names, line ranges, exact failure modes — that's what helps
  future runs.
- **One entry per run, regardless of outcome.** Even "no novel learnings"
  is a useful signal for the curation cron — it confirms the run was
  routine.

## Append flow

```bash
git checkout main
git pull --rebase origin main
# append your entry to docs/automation/retro-archive.md
#   (do NOT read the existing archive — it grows monotonically; this
#   template is the only file you need to consult for format)
git add docs/automation/retro-archive.md
git commit -m "retro: <stage> #<issue-number>"
git push origin main
```

If `git push` fails because of a concurrent retro push from another
agent run, `git pull --rebase origin main` and retry once.
