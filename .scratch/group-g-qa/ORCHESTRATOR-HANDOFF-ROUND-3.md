# Orchestrator handoff — Group G QA Round 3

You are orchestrating 6 QA items (#19–#24) in **Rentenrechner** (React + TypeScript + Vite). The wave plan is fully specified in `.scratch/group-g-qa/WAVE-PLAN-ROUND-3.md` — read it in full before dispatching.

## Repo

Working directory: `C:/Users/Peter/Coding_Projects/Rentenrechner`. Verify command: `npm run verify`.

## Prerequisite

**Round-2 (issues #25–#37) must be fully merged to `main` before this round dispatches.** Several of these issues depend on Round-2 fixes (#22 on #25; #24 on #27 + #28) or share files (#21 on #36; #19 + #23 on the combine `App.tsx` branch touched by #25/#27/#28). Confirm `git log --oneline main` shows all 13 Round-2 commits before starting.

## Inputs to read

- `.scratch/group-g-qa/WAVE-PLAN-ROUND-3.md` — wave structure, model selection, dependency notes, the verification framing for #22/#24.
- `.scratch/group-g-qa/issues/{19..24}-*.md` — pass each file content verbatim to the implementer; do not paraphrase.
- `CLAUDE.md` — guardrails. Especially: rounding boundary, `simulatePortfolio` reads `portfolioState`, engine code is React-free, working brand name is TBD.
- `memory/multi_agent_orchestration.md` — operational gotchas. Re-read; #1 (worktree base SHA), #18 (round-2 fixes always budgeted), #19 (concise prompts), #20 (per-issue eager review dispatch) are load-bearing.

## Models

- **Sonnet** for #19, #21, #22, #23, #24.
- **Opus for #20** (Vergleich dashboard redesign — designed feature, product-design judgement).
- Opus for all reviewers.

## Dispatch order

Single parallel wave, 6 agents. Pre-create worktrees manually from current `main` for every issue (Round-2 has advanced main; gotcha #1).

Two issues need special framing in their prompts:

- **#22 and #24 lead with verification, not implementation.** Brief them: "First verify the bug described in the issue is gone after Round-2 #25 (for #22) / Round-2 #27 + #28 (for #24). If covered, add a regression test and close. If gaps remain, fix them." Don't let these agents redo work that already landed.
- **#20 needs the target-retirement-income default specified in the prompt.** Bake "Orchestrator decision: default target = `assumptions.salary.gross × 0.5`, user-overridable" so the agent doesn't re-decide it (gotcha #17). Surface this to the user in parallel with dispatch; if they pick a different default, TaskStop + respawn (gotcha #13).

## Per-issue dispatch policy

- Pre-create worktrees manually (gotcha #1); have each agent early-check base SHA.
- Dispatch the Opus reviewer the moment each implementer reports completion (gotcha #20).
- Round-2 review fixes always permitted; round-3 only if round-2 introduces new blockers (gotcha #18).
- Concise prompts: under ~400 words for #19/#21/#22/#23/#24; ~600 for #20 (gotcha #19).

## Critical guardrails — tell every implementer

1. **No rounding inside the engine** — display rounding only at `formatCurrency` / `formatPercent`.
2. **`simulatePortfolio` reads `portfolioState.workspace`.** #19 must write to portfolio state; #22 must verify custom scenarios reach `simulatePortfolio`; #24 must verify exports source from portfolio.
3. **Engine code is React-free.**
4. **Working brand name "Rentenrechner" is a placeholder** — don't bake it into new dashboard copy in #20. Use the project's existing placeholder convention or a neutral phrasing.
5. **Disclaimer-first invariant** for any new export surface introduced by #20 or #24.
6. **`<NumberField>` is the rounding boundary** — relevant for #21's input cleanup and any #20 numeric input.
7. **Reuse provenance primitives** (`src/features/results/provenance.tsx`) for #23.

## Done criteria

All 6 issues green on `main`. `Status:` line in each file set to `done` (or `wontfix` for #22/#24 if Round-2 fully covered them, with regression-test pointer in Comments). #20 produces a visible Rentenlücke dashboard on the compare-mode landing surface.
