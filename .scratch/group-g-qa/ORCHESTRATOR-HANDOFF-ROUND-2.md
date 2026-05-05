# Orchestrator handoff — Group G QA Round 2

You are orchestrating parallel implementation of 13 QA fixes (issues #25–#37) in **Rentenrechner** (React + TypeScript + Vite). The wave plan is fully specified in `.scratch/group-g-qa/WAVE-PLAN-ROUND-2.md` — read it in full before dispatching.

## Repo

Working directory: `C:/Users/Peter/Coding_Projects/Rentenrechner`. Verify command: `npm run verify` (lint + tests + build).

## Inputs to read

- `.scratch/group-g-qa/WAVE-PLAN-ROUND-2.md` — wave structure, model selection, dependencies, conflict notes.
- `.scratch/group-g-qa/issues/NN-*.md` for each issue you dispatch — pass the file content verbatim to the implementer; do not paraphrase.
- `CLAUDE.md` — project guardrails. Especially: rounding boundary, retirement-tax/payout pipeline singletons, disclaimer-banner sessionStorage invariant, `simulatePortfolio` reads `portfolioState`, engine code is React-free.
- `memory/multi_agent_orchestration.md` (your own memory) — operational gotchas. Re-read before each wave; the worktree-base-SHA gotcha (#1) and the per-issue eager-reviewer-dispatch gotcha (#20) are both load-bearing for this batch.

## Models

- Sonnet for all implementers **except #28 (Opus — largest structural change in the batch).**
- Opus for all reviewers.

## Wave order

1. **Wave 0:** #37 alone. Restore `npm run verify` green. Self-handle if trivial; agent if not. Blocks every later wave.
2. **Wave 1:** dispatch 7 agents in parallel (#29, #30, #31, #32, #33, #34, #36). #29 gated on brand-name decision from user — **surface this question to the user before dispatching the wave**, then either include or hold #29.
3. **Wave 2a:** after Wave 1 fully merged, pre-create worktrees from current `main` and dispatch 3 agents (#25, #26, #35). All touch `App.tsx` combine branch — instruct each to early-check base SHA.
4. **Wave 2b:** after Wave 2a fully merged, dispatch #28 (Opus) and #27 (Sonnet) in parallel.

## Per-issue dispatch policy

- Pre-create worktree manually for any issue depending on prior in-session merges (Wave 2a/2b — gotcha #1).
- Dispatch the Opus reviewer the moment each implementer reports completion; do not batch (gotcha #20).
- Round-2 review fixes always permitted; round-3 only if round-2 introduces new blockers (gotcha #18 — expect ~all issues to need round-2).
- Bake design-question recommendations into fix-agent prompts under "Orchestrator decision: X" (gotcha #17). Two known design decisions in this batch are pre-baked in the WAVE-PLAN: #26 ships hide-button, not v2 share serialization; #31 needs a migration policy you propose and surface to user.
- After every merge: `git worktree remove -f -f <path>; git branch -D <branch>` (ignore "Permission denied" on dir removal — gotcha #16).

## Critical guardrails — tell every implementer

1. **No rounding inside the engine.** Display rounding lives only in `formatCurrency` / `formatPercent`.
2. **`calculateRetirementTax` and `calculateMonthlyRetirementPayout` are the single pipelines** — no bypassing or duplicating.
3. **`DisclaimerBanner` uses `sessionStorage`, never `localStorage`.** Compliance-critical.
4. **Disclaimer must be the literal first child of `#print-report` and first section of CSV exports** (relevant for #27, #28).
5. **`simulatePortfolio` reads `portfolioState.workspace`.** Combine-mode fixes (#25, #26, #27, #28, #35) must read/write workspace state, never singleton `useCalculatorState`.
6. **`ProductId` is derived from `PRODUCT_REGISTRY`.** Never hardcode the union.
7. **Engine code is React-free.** No React imports under `src/engine/` (relevant for #31, #33, #34).

## Done criteria

All 13 issues green on `main`, `Status:` line in each issue file updated to `done` (or `ready-for-human` if a user follow-up remains).

Keep prompts concise (gotcha #19 — under ~400 words for typical issues, ~600 for #28). Point at issue files instead of restating their contents.
