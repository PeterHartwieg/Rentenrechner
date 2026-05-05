---
title: "Make topbar and tabs mode-aware in Mein Plan"
Status: done
Severity: P2
Type: AFK
Area: Group G / combine mode / navigation
---

## What to build

Update the app chrome so combine mode reads as `Mein Plan`, not as a product comparison screen.

Currently the topbar heading is always `ETF, bAV und private Versicherung vergleichen`, and `WorkspaceTabs` always renders `Eingaben`, `Vergleich`, and `Details & Export`. In combine mode the user is modelling their own portfolio, so the language should match that story.

## Acceptance criteria

- [ ] In compare mode, existing comparison copy remains appropriate.
- [ ] In combine mode, the topbar H1 and supporting copy are mode-aware and describe the user's plan/portfolio.
- [ ] In combine mode, tab labels are renamed to plan-oriented labels, for example `Meine Vertraege`, `Uebersicht`, and `Details & Export`.
- [ ] `WorkspaceTabs` remains accessible, with correct role/selected states and stable view ids.
- [ ] Tests or component assertions cover tab labels in both compare and combine modes.
- [ ] This issue does not attempt the final public rebrand unless the product name has already been decided; avoid hard-baking a new brand string.

## Red test

Run:

```bash
npx vitest run src/App.combine-mode.test.tsx
```

Relevant tests:

- `uses a Mein Plan heading instead of comparison copy in combine mode`
- `uses plan-oriented tab labels in combine mode`

## Implementation notes

Likely direction:

- Pass `mode` or explicit tab definitions into `WorkspaceTabs`.
- Derive topbar title/copy in `App.tsx` from `isCombineMode`.
- Keep route/storage ids (`angebot`, `vergleich`, `details`) stable unless a broader navigation migration is intentionally planned.

Related: `.scratch/group-g-qa/issues/29-blocker-todo-brand-name-placeholder-in-launch-surfaces.md` tracks the launch branding placeholder separately.

## Resolution

All ACs already satisfied by Phase 3 wave. Mode-aware H1/kicker in `src/App.tsx:752-760`; plan-oriented tab labels in `SHELL_TABS` array at `src/App.tsx:77-81`; `ShellWorkspaceTabs` passes accessible role/selected states. Both red tests pass (verified Phase 4).

## Blocked by

None - can start immediately.
