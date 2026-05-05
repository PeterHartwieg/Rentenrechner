---
title: "RISK: Dirty dependency metadata in worktree needs intentional resolution"
Status: done
Severity: risk
Area: Tooling / release hygiene
---

## Description

The worktree has uncommitted changes:
- `package.json` and `package-lock.json` adding `@jridgewell/sourcemap-codec`.
- A dirty `recommendations.test.ts` snapshot with line-ending noise.

Local verification could not complete because `eslint.cmd` is missing from `node_modules` (likely a Windows / install-state mismatch).

## Impact

If intentional, these should be committed alongside the related fix set. If unintentional, they should be dropped before release. Leaving them dirty makes every subsequent `git status` noisy and risks the changes being silently included in the next commit.

The eslint.cmd absence blocks `npm run verify`, which CLAUDE.md mandates after every change.

## Fix direction

1. Inspect the staged changes:
   - `git diff package.json package-lock.json` — confirm the `@jridgewell/sourcemap-codec` addition is intended (likely transitive bump from a Vite / sourcemap dependency).
   - `git diff src/app/__snapshots__/recommendations.test.ts.snap` — line-ending noise should be normalized via `.gitattributes` (`* text=auto eol=lf` or similar) rather than committed as-is.
2. Reinstall dependencies cleanly to restore `node_modules/.bin/eslint.cmd` (`rm -rf node_modules && npm ci`).
3. Run `npm run verify` and confirm green before any further fix lands.
4. If the deps add is genuine, commit it as a small standalone "chore(deps)" commit; don't bundle it into a feature commit.

## Notes

Not a code defect — release hygiene. Easy to fix, but worth nailing before the publication push so the launch commit set is clean.
