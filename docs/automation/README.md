# Automation

Design + operator docs for automation tooling on this repo. Each automation
has its own document here. Any GitHub Actions workflow YAML lives in
`.github/workflows/` (GitHub requires that path).

These docs are written to be **portable** — they describe the design and
prerequisites in enough detail to set the same automation up on another
repo, not just operate it on this one.

The old GitHub-Actions agent pipeline (triage → investigate → implement →
review loop → retro) was removed on 2026-10-29 in favor of the owner's
shared out-of-repo coding workflow; it is recoverable via git history.

## Current automations

None. The local multi-model calculation review toolchain was also removed
on 2026-10-29; it is recoverable via git history.

## How to add a new automation

1. Decide the trigger surface (GitHub event / cron / manual dispatch).
2. Sketch the design — which agents, which authentication, which gates.
3. Write a doc in this folder: overview → design decisions → prerequisites
   → workflow files → operator playbook → cost model → known quirks →
   customization points → adapting to other projects.
4. Add the workflow YAML under `.github/workflows/` (if any).
5. List it under "Current automations" above.
6. Validate end-to-end on a throwaway issue/PR before relying on it.
