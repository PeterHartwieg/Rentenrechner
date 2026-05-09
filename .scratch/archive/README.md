# Archive

Two retirement conventions live here.

## Issue archive — `.scratch/archive/<feature-slug>/`

Closed local tracker issues live here after triage cleanup.

- Active issues stay in `.scratch/<feature-slug>/issues/`.
- Archived issues move to `.scratch/archive/<feature-slug>/issues/`.
- Preserve original filenames and issue bodies, including final `Status:` lines.
- Archive only issues with `Status: done` or `Status: wontfix`.
- PRDs, plans, and decision logs stay in their original feature directories unless explicitly retired.

## Session archive — `.scratch/archive/sessions/<YYYY-MM-DD>-<slug>/`

Finished cross-cutting work sessions (audits, reviews, multi-issue triage passes, design pivots) — anything that produced artifacts spanning several issues or surfaces and is now retired.

**The `sessions/` tree itself is gitignored** (see `.gitignore`). Session content is personal and noisy — transcripts, draft notes, intermediate scratch — and not part of the shared repo history. This README documents the convention so each maintainer follows the same layout locally.

Convention:

- Active session work lives at `.scratch/<short-slug>/` while the session is in flight.
- When the session wraps (decisions made, follow-up issues filed, work landed or tracked in GitHub issues), move the whole bundle into `.scratch/archive/sessions/<YYYY-MM-DD>-<short-slug>/`.
- Each archived session contains a session-level `README.md` summarizing what was done, the canonical outputs (commits, PRs, filed issues), and pointers to the underlying artifacts.
- Date prefix uses the **session start date** (Europe/Berlin), not the archive date.

Sessions are distinct from the per-feature-slug issue archives above: a session can produce artifacts spanning multiple feature slugs, which is why session archives live one level deeper.
