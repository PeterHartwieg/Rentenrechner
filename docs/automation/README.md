# Automation workflows

Design + operator docs for the agentic GitHub Actions automations that run
on this repo. Each automation has its own document here. The actual workflow
YAML lives in `.github/workflows/` (GitHub requires that path).

These docs are written to be **portable** — they describe the design and
prerequisites in enough detail to set the same automation up on another
repo, not just operate it on this one.

## Current automations

| Doc | Workflows | Status |
|-----|-----------|--------|
| [`issue-to-merge-pipeline.md`](issue-to-merge-pipeline.md) | `triage.yml`, `investigate.yml`, `implement.yml`, `pr-verify.yml`, `claude-review.yml`, `review-loop.yml`, `review-loop-sweep.yml`, `retro-curate.yml` | ✅ Live |

The QA-feedback "feedback loop" originally planned as a separate workflow
is now folded into `triage.yml` as an 8-step decision tree (see the
`triage.yml` section in `issue-to-merge-pipeline.md`). A separate workflow
becomes worth building only when we want a different trigger surface —
e.g. a periodic cron that re-scans the existing open-issue queue for
emergent duplicates as new issues land.

## How to add a new automation

1. Decide the trigger surface (GitHub event / cron / manual dispatch).
2. Sketch the design — which agents, which authentication, which gates.
3. Write a doc in this folder following the pattern in
   `issue-to-merge-pipeline.md`: overview → design decisions → prerequisites
   → workflow files → operator playbook → cost model → known quirks →
   customization points → adapting to other projects.
4. Add the workflow YAML under `.github/workflows/`.
5. Add a row to the "Current automations" table above.
6. Validate end-to-end on a throwaway issue/PR before relying on it.
