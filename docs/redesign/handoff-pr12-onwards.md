# PR 12 Handoff — Export projection layer for CSV/PDF report consistency

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-21.
> **Previous session landed:**
> - PR 11 — Print + cross-cutting tests at squash commit `55629f5`, merged via #291 (**5 review rounds R0–R4**). Final commit Codex 👍 / CodeRabbit SUCCESS.
>
> **Next up:** PR 12 — **Export projection layer**. Tracks [GitHub issue #209](https://github.com/PeterHartwieg/Rentenrechner/issues/209). The redesign sequence ended at PR 11; PR 12 is a standalone architectural cleanup driven by the issue, not the implementation-plan.md. The label is `ready-for-human` because the shape of the projection involves a design call that needs explicit confirmation.

---

## What the issue says (read [#209](https://github.com/PeterHartwieg/Rentenrechner/issues/209) in full first)

The concrete AVD/Riester combine-mode CSV `Kapital n. St.` gap (#86) is already fixed on main. **The remaining gap is architectural:** `src/utils/csvExport.ts` has multiple `productId === 'X'` branches doing per-product tax-mode dispatch inline. The fix is to define a narrow export projection layer that owns the per-row values, so CSV and (optionally) PDF surfaces consume the same product-aware rows instead of re-deriving tax/payout meaning per-surface.

Concrete branch sites in `src/utils/csvExport.ts` to consolidate:

- L107-150 — Section 2 "Jahres-Cashflows" yearly capital-after-tax dispatch (`isBav` / `isEtf` / `isBasisrente` / `altersvorsorgedepot` / `riester` / else=insurance)
- L321-360 — Section "Mein Plan — combine yearly" same dispatch repeated for combine-mode per-instance rows
- L395 — ETF-only filter for the ETF-payout schedule section

Each dispatch site re-imports per-product tax helpers (`afterTaxBavLumpSum`, `afterTaxInvestmentCapital`, `afterTaxInsuranceLumpSum`, `afterTaxCertifiedPensionLumpSum`) and re-encodes the routing rules. New product = N edit sites.

The acceptance criteria from the issue:

- Export code no longer re-implements product tax-path selection inline where a projection/result primitive can own it.
- CSV and PDF exports agree with the UI for representative compare and combine workspaces.
- Regression coverage includes multi-instance combine exports and representative per-product after-tax capital rows.
- Any `PrintReport.tsx` change receives human review (compliance surface).
- `npm run verify` passes.

## Where to work

Pre-created worktree:
`C:/Users/Peter/Coding_Projects/Rentenrechner/.claude/worktrees/pr12-export-projection`

Branch: `feat/export-projection-layer` based on `origin/main` at SHA `55629f5`.

DO NOT re-create the worktree or re-branch. Use `cd <path> && ...` or `git -C <path>`. The sibling worktree `Rentenrechner-conflict-auto` no longer exists (the PR 11 orchestrator removed it); `main` is checked out only in the primary repo path now.

## Sources of truth

1. **GitHub issue #209** — the binding spec. The orchestrator + implementer should read it in full.
2. **`src/utils/csvExport.ts`** (442 lines) — the central refactor target. Read top-to-bottom before touching anything.
3. **`src/features/results/printReportRows.ts`** (945 lines, shipped in PR 11) — the existing print row builder. It already does some of what the projection layer needs to do, but for the print surface only. PR 12 must decide whether to unify.
4. **`src/engine/{bavPayout,certifiedPensionPayout,etfPayout,insurancePayout}.ts`** — the per-product after-tax-lump-sum primitives. The projection layer dispatches to these; it should NOT reimplement them.
5. **`src/engine/productRegistry.ts`** + **`src/engine/products/<product>.ts`** — `PRODUCT_REGISTRY` is the iteration source. Adding a projection extension point per product is a registry change OR a parallel registry.
6. **`CLAUDE.md`** — note especially:
   - "Engine returns full-precision floats" (P1 — no engine rounding).
   - "Disclaimer is the first section of `buildExportCsv` output" (P0 — non-negotiable).
   - "`PRODUCT_REGISTRY` is the source of truth for product identity" (P1).
   - "All retirement-phase taxable income must route through `calculateRetirementTax`" — the projection consumer of those values shouldn't re-derive marginal-tax-modes.
7. **`CONTEXT.md`** — module ownership map. Lookup table for "where does X live."
8. **Closed predecessor issues** #59, #61, #62, #65, #86 — context for the prior incremental fixes that #209 is the architectural follow-up to.

## What's already shipped (do not redo)

- All redesign chrome + Sober D pages + Editorial A pages are on main.
- The print-report mirror for every redesigned page (PR 11, commit `55629f5`).
- The `usePrintSensitivityRows` hook with `beforeprint` deferral + `flushSync` + `useLayoutEffect` (PR 11 R3/R4).
- Viewport test helper (`src/test/viewport.ts`) used across `eachViewport` sweeps.

## Conventions established by PR 1-11 — follow these

Carry forward applies — the full list is in `docs/redesign/handoff-pr11-onwards.md`. Highlights load-bearing for PR 12:

- `formatCurrency(value, 0)` / `formatPercent(value, 1)` for every euro / percent display.
- `interface` for object shapes; `type` for unions/aliases.
- `PRODUCT_REGISTRY` is the only iteration source for products.
- Exhaustive switches on `ProductId` with `const _: never = …` default.
- Engine returns full-precision floats; display rounding happens in `formatCurrency` / `<NumberField>`. The projection layer is engine-adjacent — keep numbers full-precision in the projection rows; let the CSV / PDF surfaces format.
- No CRLF noise in commits: stage only intentional files; never `git add -A` / `git add .`.
- `interface` is project convention for object shapes. CodeRabbit will flag `type ExportRow = { ... }` as Major.
- Dynamic-age labels: never hardcode `67`. Same applies to any age in the export.
- The CSV disclaimer prefix must remain the LITERAL first section of `buildExportCsv` (currently `DISCLAIMER_LINES` written under the `'Hinweis'` heading). This is a P0 compliance surface.

## Review-loop reality (carried forward from PR 11)

- **Plan for 2-5 review rounds.** PR 11 took 5 (R0=11 → R1=2 → R2=3 → R3=1 → R4=0). Each round produces 1-11 findings; later rounds skew toward ARIA / stylelint / type-vs-interface / deprecated CSS / dynamic-age / formatter discipline.
- **"0 findings including 0 nitpicks"** is the merge bar. Treat 🟡 Minor and "non-finding observations" as must-fix.
- **CodeRabbit green signals:** status check `SUCCESS` AND/OR "No actionable comments were generated in the recent review. 🎉" review body. **The status check alone is sufficient for the merge gate** — CR sometimes doesn't post a formal review when nothing is actionable (PR 11 R4 behavior — only status checks transitioned, no review body).
- **Codex green signals:** comment containing literal phrase `"Codex Review: Didn't find any major issues."` OR a 👍 (`+1`) reaction on the PR issue (PR 11 R4 was the 👍 path).
- **CodeRabbit auto-pauses after ~4 commits** in quick succession. Resume with `@coderabbitai review` or the "Trigger review" checkbox in their summary comment.
- **CodeRabbit posts STALE reviews** on previous commits; trust the in-progress comment's `HEAD` SHA, not the visible body content.
- **Codex acknowledges with 👀 then takes 1-6 min to verdict.** Wait 6+ min before re-nudging. PR 11 R4 took ~8 min from eyes to thumbs.

---

## Review-loop orchestrator playbook

This codifies the per-round sequence the PR 11 orchestrator worked out. Follow it step-by-step each time the implementer or a fix agent pushes a new commit.

### Step 1 — Confirm push reached origin + Cloudflare build started

```bash
gh pr view <N> --json statusCheckRollup,headRefOid --jq '{head: .headRefOid, checks: [.statusCheckRollup[] | {name: (.name // .context), state: (.state // .conclusion // .status)}]}'
```

Expected: `Workers Builds: rentenwiki` IN_PROGRESS or SUCCESS, `CodeRabbit` PENDING, `claude-review` / `verify` / `loop` SKIPPED (agent-only workflows don't trigger on `feat/*`).

### Step 2 — Arm the review-wave monitor

Each round, arm a `Monitor` that exits when both reviewers have responded. The polling loop must handle:

- Empty / null jq output (guard with `[ -z "$x" ] && x=0`).
- Numeric comparison via `-gt 0 2>/dev/null` (some shells choke on empty strings).
- CodeRabbit may finish without posting a formal review object (status check only).
- Codex green via 👍 reaction (not a review body).

Reference template — adapt the SHA + comment-cutoff timestamp:

```bash
target_sha="<short-sha>"
# Set this to ~1 min before the push so we filter out earlier-round comments
cutoff="2026-MM-DDTHH:MM:SSZ"
seen_codex=0
seen_rabbit=0
for i in $(seq 1 60); do
  reviews=$(gh api "repos/PeterHartwieg/Rentenrechner/pulls/<N>/reviews" 2>/dev/null || echo "[]")
  reactions=$(gh api "repos/PeterHartwieg/Rentenrechner/issues/<N>/reactions" 2>/dev/null || echo "[]")
  comments=$(gh api "repos/PeterHartwieg/Rentenrechner/issues/<N>/comments" 2>/dev/null || echo "[]")
  checks=$(gh api "repos/PeterHartwieg/Rentenrechner/commits/$target_sha/statuses" 2>/dev/null || echo "[]")

  # CodeRabbit: formal review OR SUCCESS status check on this commit
  if [ "$seen_rabbit" = "0" ]; then
    rabbit_review=$(echo "$reviews" | jq --arg sha "$target_sha" '[.[] | select(.user.login=="coderabbitai" and (.commit_id | startswith($sha)))] | length')
    rabbit_status=$(echo "$checks" | jq '[.[] | select(.context=="CodeRabbit" and .state=="success")] | length')
    [ -z "$rabbit_review" ] && rabbit_review=0
    [ -z "$rabbit_status" ] && rabbit_status=0
    if [ "$rabbit_review" -gt 0 ] 2>/dev/null || [ "$rabbit_status" -gt 0 ] 2>/dev/null; then
      inline=$(gh api "repos/PeterHartwieg/Rentenrechner/pulls/<N>/comments" 2>/dev/null | jq --arg sha "$target_sha" '[.[] | select(.user.login=="coderabbitai" and (.commit_id | startswith($sha)))] | length')
      echo "CODERABBIT: review=$rabbit_review status=$rabbit_status inline_on_sha=$inline"
      seen_rabbit=1
    fi
  fi

  # Codex: formal review OR 👍 reaction newer than cutoff OR "major issues" comment
  if [ "$seen_codex" = "0" ]; then
    codex_review=$(echo "$reviews" | jq --arg sha "$target_sha" '[.[] | select(.user.login=="chatgpt-codex-connector" and (.commit_id | startswith($sha)))] | length')
    codex_thumbs=$(echo "$reactions" | jq --arg cutoff "$cutoff" '[.[] | select(.user.login=="chatgpt-codex-connector[bot]" and .content=="+1" and .created_at > $cutoff)] | length')
    codex_green=$(echo "$comments" | jq --arg cutoff "$cutoff" '[.[] | select(.user.login=="chatgpt-codex-connector[bot]" and .created_at > $cutoff and (.body | contains("major issues")))] | length')
    [ -z "$codex_review" ] && codex_review=0
    [ -z "$codex_thumbs" ] && codex_thumbs=0
    [ -z "$codex_green" ] && codex_green=0
    if [ "$codex_review" -gt 0 ] 2>/dev/null || [ "$codex_thumbs" -gt 0 ] 2>/dev/null || [ "$codex_green" -gt 0 ] 2>/dev/null; then
      inline=$(gh api "repos/PeterHartwieg/Rentenrechner/pulls/<N>/comments" 2>/dev/null | jq --arg sha "$target_sha" '[.[] | select(.user.login=="chatgpt-codex-connector" and (.commit_id | startswith($sha)))] | length')
      echo "CODEX: review=$codex_review thumbs=$codex_thumbs green=$codex_green inline_on_sha=$inline"
      seen_codex=1
    fi
  fi

  if [ "$seen_codex" = "1" ] && [ "$seen_rabbit" = "1" ]; then
    echo "DONE"; exit 0
  fi

  # CR pause heuristic: emit warning after 12 polls (6 min) without rabbit
  if [ "$i" = "12" ] && [ "$seen_rabbit" = "0" ]; then
    echo "WARN_RABBIT_PAUSE: may need @coderabbitai review nudge"
  fi
  sleep 30
done
echo "TIMEOUT: codex=$seen_codex rabbit=$seen_rabbit"
```

Arm it via the `Monitor` tool with `timeout_ms: 1800000` (30 min) and `persistent: false`. The monitor emits a notification per status change; the chat resumes once it signals DONE or times out.

**jq pitfalls to guard:**
- `[ "$X" != "0" ]` evaluates true when `X` is empty string. Always coerce empty → `0` first, then use `-gt 0`.
- `jq -r '.[-1] // null | .body // ""'` returns the literal string `""` on empty arrays — check `[ -n "$X" ] && [ "$X" != "" ]`, OR use `length > 0`.

### Step 3 — Inspect the review on monitor signal

When monitor reports a reviewer posted:

```bash
# CodeRabbit summary
gh api repos/PeterHartwieg/Rentenrechner/pulls/<N>/reviews \
  --jq '.[] | select(.commit_id == "<full-sha>") | {author: .user.login, state: .state, bodyHead: (.body | .[0:400])}'

# Inline findings on this commit (filter out "✅ Addressed in commit ..." stale markers)
gh api repos/PeterHartwieg/Rentenrechner/pulls/<N>/comments \
  --jq '.[] | select(.commit_id == "<full-sha>") | {author: .user.login, path: .path, line: .line, bodyTail: (.body | .[-200:]), bodyHead: (.body | .[0:400])}'
```

Findings to scan for:
- **Codex P0/P1/P2** — `![P0/P1/P2 Badge]` in body. Always must-fix.
- **CodeRabbit Major / Minor / Quick win** — `🟠 Major` / `🟡 Minor` / `⚡ Quick win`. Treat all as must-fix per the user's "0 nitpicks" bar.
- **CodeRabbit duplicate findings** — body contains `"♻️ Duplicate comments"`. Usually means a prior fix was incomplete.
- **CodeRabbit outside-diff comments** — body says `"⚠️ Outside diff range comments"`. Often coverage-gap suggestions (CLAUDE.md cron-dispatch §2 paired-test invariants).

Findings to filter OUT:
- Inline comments with body tail `"✅ Addressed in commit <prior-sha>"` — these are stale carry-overs from prior rounds. GitHub re-attaches them to the latest commit because they're tied to file/line, not commit. Skip them.

### Step 4 — Dispatch a fix agent

Spawn a single fix agent (Opus for architectural, Sonnet for purely mechanical) with the full consolidated finding list. Don't batch across rounds; don't dispatch per-finding.

Reference prompt template (adapt the round number, SHA, and finding list):

```text
You are the R<N> fix agent for PR #<PR> (<title>). Codex + CodeRabbit
completed their R<N-1> review on commit <prior-sha>. Apply the
consolidated fix list below.

## Where to work

Worktree at: <worktree-path>
Branch: <branch> at HEAD <prior-sha>. Use `cd <path> && ...` or
`git -C <path>`. DO NOT touch sibling worktrees.

First step: cd into worktree, `git status`, `git log -1 --oneline` —
confirm HEAD is <prior-sha>.

## Fixes to apply (only these)

### Codex P<N>

<C1.> <file:line> — <verbatim finding>
**Fix:** <orchestrator's recommended approach with reasoning>

### CodeRabbit <severity>

<CR1.> <file:line> — <verbatim finding>
**Fix:** <orchestrator's recommended approach>

[... etc ...]

## Critical invariants (do not regress)

[Project-specific list — copy from CLAUDE.md P0/P1 ladder]

## Verification + commit

1. `npm run verify` green.
2. <Any new test count assertions>.
3. Commit:

```text
fix(<scope>): <one-line> (PR <N> R<round>)

R<N-1> review (Codex + CodeRabbit) flagged <count> findings; this
commit addresses all of them.

## Codex P<N>

- <finding>: <fix>

## CodeRabbit <severity>

- <finding>: <fix>

Co-Authored-By: Claude <Model> <noreply@anthropic.com>
```

4. Push. Reply with:
   - New commit SHA
   - `npm run verify` exit code
   - Any finding where you DIDN'T apply the reviewer's text verbatim,
     with a one-line reason

Model choice (per multi-agent orchestration memory):
- **Opus** for: architectural (cross-cutting refactor, hook design, engine routing), multi-finding rounds, P0/P1 Codex findings.
- **Sonnet** for: 1-2 line mechanical edits, pure CSS / copy / branding fixes, type-aliases.

Always background (`run_in_background: true`) — the agent reports completion via notification.

### Step 5 — Loop

After the fix agent reports the new commit SHA + verify=0:
- Re-arm the monitor against the new SHA.
- Repeat from Step 1.

Keep cycling until BOTH:
- `CodeRabbit` status check = SUCCESS on HEAD (no formal review with findings, OR formal review with "No actionable comments… 🎉")
- Codex 👍 reaction on the PR issue OR comment with "Didn't find any major issues"

### Step 6 — Merge

Once converged:

```bash
gh pr view <N> --json mergeable,mergeStateStatus --jq '{mergeable, mergeStateStatus}'
# Expected: mergeable=MERGEABLE, mergeStateStatus=CLEAN
gh pr merge <N> --squash
gh pr view <N> --json state,mergeCommit,mergedAt --jq '{state, mergeCommit: .mergeCommit.oid, mergedAt}'
```

`--delete-branch` should now work cleanly (the sibling `Rentenrechner-conflict-auto` worktree was removed in PR 11 cleanup). If it ever fails again for any other Windows lock reason:

```bash
gh api -X DELETE repos/PeterHartwieg/Rentenrechner/git/refs/heads/<branch>
```

### Step 7 — Local cleanup

```bash
git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" worktree remove -f -f .claude/worktrees/<pr12-slug>
git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" branch -D <branch>
# Also clean up agent-spawn worktrees (auto-created on subagent dispatch)
for w in agent-<id1> agent-<id2> ...; do
  git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" worktree remove -f -f .claude/worktrees/$w 2>&1 || true
  git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" branch -D worktree-$w 2>&1 || true
done
```

Ignore "Permission denied" on dir-remove — branch deletion is what counts (orchestration gotcha #16).

### Step 8 — Verify main has the squash commit

```bash
git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" fetch origin
git -C "C:/Users/Peter/Coding_Projects/Rentenrechner" log --oneline origin/main -3
```

If the orchestrator's working copy is on `main`, also `git pull --ff-only`.

---

## Anti-patterns to avoid (PR 11 lessons)

- **Don't merge from inside the worktree.** `git status -b --short` must show `main` before any `git merge` command. The `gh pr merge` path avoids this by working server-side, but local cleanup steps still hit the cwd issue.
- **Don't `git add -A` or `git add .`.** Stage files by name. CRLF noise on Windows otherwise pollutes the diff with phantom whitespace changes on `simulate.integration.test.ts.snap`.
- **Don't dispatch the same fix twice.** If the user gives a different answer mid-flight to a design question, `TaskStop` the in-flight agent + respawn with the corrected answer. The Agent tool returns an `agentId`, but SendMessage is not loadable in this environment — fresh agent is the only resume path.
- **Don't trust reviewers' claims about main state.** When a reviewer says "issue X isn't on main" or "the file doesn't exist," verify with `git log --oneline main` / `ls` / `gh pr list --state merged --search ...`. Reviewers can mis-narrate the worktree's pre-rebase base.
- **Don't escalate to user for every fix.** Only escalate for: (a) genuine product/architectural decisions, (b) scope-cut decisions the implementer made unilaterally, (c) reviewer findings that would require violating CLAUDE.md guardrails. Everything else, dispatch a fix agent with the orchestrator's recommended approach pre-baked.
- **Don't poll faster than 30s.** GitHub API rate-limits at ~5000/hr per user; the monitor's 30s cadence is well within budget but tighter polling burns the limit for marginal latency improvements.
- **Don't skip the verify-before-merge sanity check.** Even if verify was green on the last fix commit, run `mergeable: MERGEABLE` + `mergeStateStatus: CLEAN` immediately before `gh pr merge`. A stale push or someone else's force-push between can leave you merging the wrong tree.

## CI workflow gating reminder

`feat/*` branches (including `feat/export-projection-layer`) do NOT trigger the agent-only workflows (`pr-verify` / `claude-review` / `review-loop`). Those are gated to `agent/issue-*` and `automation/retro-curate-*` prefixes. So `npm run verify` runs locally in the implementer's worktree — verify before opening the PR AND after every review-fix commit. The Cloudflare `Workers Builds: rentenwiki` check is the only meaningful CI signal for `feat/*` PRs.

## The `gh pr merge --delete-branch` worktree gotcha

`Rentenrechner-conflict-auto` was removed in the PR 11 cleanup, so the historical gotcha doesn't bite this round. `gh pr merge --squash --delete-branch` should now work cleanly. But if it fails for any other reason (e.g. lingering Windows file locks on the worktree), the recovery path is unchanged:

```bash
gh api -X DELETE repos/PeterHartwieg/Rentenrechner/git/refs/heads/feat/export-projection-layer
```

## Decisions to surface to the user BEFORE implementation

PR 12 has **three genuine design calls** the orchestrator should surface as a terse numbered list and pause for the user's answer. Do NOT invent answers — these shape the entire refactor.

### Decision 1 — Where does the projection module live?

Options:
- **(a) `src/engine/exportProjection.ts`** — engine-adjacent, framework-free. Mirrors the location convention of other cross-product orchestrators (`portfolioCombine`, `simulationContext`). Recommended if the projection rows are seen as engine output, not display data.
- **(b) `src/app/exportProjection.ts`** — outside engine but framework-free. Fits if the projection is seen as a display-layer transform consuming engine output.
- **(c) per-product helper in each `src/engine/products/<product>.ts`** — co-located with the product simulator. Recommended if each product owns its row builder; downside is the consumer must iterate `PRODUCT_REGISTRY` to gather them.
- **(d) hybrid** — projection module under `src/engine/` for the shared type + dispatch; per-product builders co-located.

Recommend **(a)** unless there's a reason to keep `src/engine/` strictly stateless. The current `src/engine/portfolioCombine.ts` already does cross-product orchestration in `src/engine/`.

### Decision 2 — Does PrintReport adopt the same projection?

Options:
- **(a) Yes** — `printReportRows.ts` consumes `CompareExportRow[]` / `CombineInstanceExportRow[]`. Single source of truth. Risk: large diff to PR 11's freshly-merged print code; touches a compliance surface so review will be slow.
- **(b) No, separate shapes** — projection layer serves CSV only. PrintReport keeps its current row builders. Risk: continued drift potential between CSV and PDF (which is precisely what the issue is trying to fix).
- **(c) Yes, but staged** — PR 12 only refactors CSV; a follow-up PR migrates PrintReport. Recommend if scope must stay bounded.

Recommend **(c)** — keep PR 12 focused on CSV; file a follow-up issue for PrintReport migration. The issue acceptance criterion "Any `PrintReport.tsx` change receives human review" hints that touching PrintReport is the more expensive path.

### Decision 3 — Row shape

Options:
- **(a) Flat row** — `interface CompareExportRow { productId, scenarioId, age, balance, afterTaxLumpSum, ... }`. Each row is one product × scenario × year. Direct mapping to CSV rows.
- **(b) Grouped by product** — `interface CompareExportProductView { productId, label, rows: CompareYearlyRow[] }`. Easier to reason about per-product invariants; CSV layer flattens for output.
- **(c) Sectioned** — separate types for Section 1 summary (`CompareExportSummaryRow`), Section 2 yearly (`CompareExportYearlyRow`), Section 3 ETF payout (`CompareExportEtfPayoutRow`). Matches the CSV structure exactly.

Recommend **(c)** — the CSV is already sectioned, and the dispatch sites repeat across sections. Three small row types are cleaner than one big union.

### Decision 4 (auto-handle, no need to surface) — Combine-mode row shape

For combine-mode, the per-instance rows already exist in `CombinedResult.byInstance`. The projection layer just needs `CombineInstanceExportRow[]` (instance-id × scenario × year) that consumes `byInstance[instanceId].monthlyNet` instead of `result.netMonthlyPayout` (the PR 11 R0 CR Major finding pattern — `result.netMonthlyPayout` bypasses the aggregate retirement-tax allocation). Per CLAUDE.md, all retirement-phase taxable income routes through `calculateRetirementTax`; the projection layer must respect this — the consumer reads from `byInstance[…].monthlyNet`, never falls back to per-instance simulator output.

## Acceptance criteria (verify before opening the PR)

- `npm run verify` green locally (lint + vitest + tsc -b + build + prerender).
- `src/utils/csvExport.ts` has zero `productId === 'X'` branches in the row-building code paths. The dispatch happens once, in the projection module.
- New tests in (e.g.) `src/engine/exportProjection.test.ts` cover each product's after-tax-lump-sum row + the Basisrente null case + combine multi-instance + at least one transfer-event case per CLAUDE.md cron-dispatch guardrail §2.
- Existing `src/utils/csvExport.test.ts` regression tests stay green. The exact CSV byte output should be identical for the existing fixtures — the projection layer is internal plumbing, not a format change.
- The CSV disclaimer prefix (`DISCLAIMER_LINES` under the `'Hinweis'` heading) remains the LITERAL first section of `buildExportCsv` output.
- No engine-side rounding introduced. The projection layer returns full-precision numbers; CSV's `n(v) = v.toFixed(2)` / `nn(v)` formatters do the display rounding.
- `PRODUCT_REGISTRY` extended with a `exportProjection: <fn>` field OR a parallel registry — whichever the user picks in Decision 1. Either way, the iteration source stays the registry.
- If Decision 2 is (a) or (c-staged), update PrintReport / `printReportRows.ts` accordingly. If (b), leave PrintReport entirely untouched.
- No `interface`/`type` regression: object shapes use `interface` per project convention.

---

## Paste this as the new session's orchestrator prompt

````text
You are orchestrating PR 12 of the Rentenrechner repo (German retirement
calculator, public name "RentenWiki.de"). The PR tracks GitHub issue #209
— design an export projection layer for CSV/PDF report consistency.

Worktree pre-created at:
C:/Users/Peter/Coding_Projects/Rentenrechner/.claude/worktrees/pr12-export-projection
on branch `feat/export-projection-layer` based on origin/main at 55629f5.

DO NOT re-create the worktree or re-branch. Run all commands from inside
the worktree (`cd <path> && ...` or `git -C <path>`).

## Required reading order

1. `docs/redesign/handoff-pr12-onwards.md` — this file. Binding spec for
   PR 12. Read in full.
2. GitHub issue #209 (`gh issue view 209`) — the original spec.
3. `src/utils/csvExport.ts` — the refactor target.
4. `src/features/results/printReportRows.ts` — the existing print row
   builder (PR 11). Relevance depends on Decision 2.
5. `CLAUDE.md` review-guidelines P0/P1 ladder + UI rounding boundary +
   PRODUCT_REGISTRY invariant.
6. `CONTEXT.md` — module ownership map.
7. `docs/redesign/handoff-pr11-onwards.md` — carry-forward conventions.

## Surface these decisions to the user BEFORE delegating implementation

The handoff doc has the full numbered list with recommendations:

1. Where does the projection module live? (engine vs app vs per-product)
2. Does PrintReport adopt the same projection? (yes / no / staged)
3. Row shape? (flat / grouped / sectioned)

Decision 4 (combine-mode row shape) is pre-decided in the handoff —
no need to ask.

## Workflow

1. Read all sources of truth.
2. Surface the 3 decisions to the user. Wait for answers.
3. Write a short implementation plan (in chat, not a file) given the answers.
4. Delegate implementation to an Opus agent — pass it the handoff doc
   path + the locked answers + the "do not invent answers" guardrail.
5. **Run the review loop** per the playbook in the handoff doc section
   "Review-loop orchestrator playbook" (Steps 1-5). Per round:
   - Confirm push + Cloudflare build.
   - Arm a `Monitor` against the new SHA (use the reference template
     in the doc — it handles jq empty-string + null pitfalls).
   - On monitor signal: fetch the review bodies + inline comments,
     filter out stale "✅ Addressed in commit ..." carry-overs.
   - For every finding (Codex P0/P1/P2 OR CodeRabbit Major/Minor/quick
     win/duplicate/outside-diff), dispatch a single fix agent
     (Opus for architectural, Sonnet for mechanical) with the full
     consolidated finding list + orchestrator-recommended approach
     pre-baked. Treat the "0 findings including 0 nitpicks" bar
     literally.
   - Loop until BOTH reviewers green: CodeRabbit `SUCCESS` status
     AND/OR "No actionable comments…", Codex 👍 reaction AND/OR
     "Didn't find any major issues". CR status alone is sufficient
     when no formal review posts (PR 11 R4 pattern).
6. **Merge** per playbook Step 6: confirm `mergeable: MERGEABLE,
   mergeStateStatus: CLEAN`, then `gh pr merge <N> --squash`.
   `--delete-branch` should now succeed (the sibling worktree gotcha
   is no longer in play); if it doesn't, fall back to the manual
   ref-delete pattern in the doc.
7. **Local cleanup** per playbook Steps 7-8: remove the PR worktree
   + branch + agent-spawn residue; fast-forward `main` if your
   working copy is on it.

## Output

When the PR is merged, reply with:
- Final squash commit SHA on main
- Number of review rounds
- Total findings addressed (Codex + CodeRabbit)
- Any genuine product/architectural decisions made beyond the 3 surfaced.
````

---

## Orchestrator quick-reference card

| | |
|---|---|
| Branch | `feat/export-projection-layer` |
| Worktree | `.claude/worktrees/pr12-export-projection` |
| Base SHA | `55629f5` (PR 11 squash) |
| Issue | [#209](https://github.com/PeterHartwieg/Rentenrechner/issues/209) |
| Primary file | [src/utils/csvExport.ts](src/utils/csvExport.ts) |
| New file (Decision 1) | likely `src/engine/exportProjection.ts` + `.test.ts` |
| Untouched (Decision 2) | likely `src/features/results/{PrintReport.tsx,printReportRows.ts}` |
| P0 invariant | CSV disclaimer prefix is literal first section of `buildExportCsv` |
| P1 invariant | Engine returns full-precision floats; no rounding in projection |
| P1 pattern | Never index `returnScenarios[0]` for 'basis' — use `find(s => s.id === 'basis')` |
| Estimate | ~3-5 days impl + 2-4 review rounds |
