# Rentenrechner Backlog

This file tracks open work only. Completed history belongs in git history; implementation detail belongs in code, tests, and research notes.

Research references:

- Legal and tax: `LEGAL_REVIEW.md`, `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`, `LEGAL_IMPLEMENTATION_AUDIT_2026.md`
- Product research: `ETF_RESEARCH.md`, `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `BASISRENTE_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`, `RIESTER_RESEARCH.md`, `GRV_RESEARCH.md`
- User scenarios: `docs/user-scenarios.md`
- Agent routing: `AGENTS.md`, `docs/context/*.md`

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

Recommended next pickup, in priority order:

1. **Group G: Scenario-led portfolio redesign** - existing-portfolio inventory, baseline-vs-what-if scenarios, "next euro" recommender, and missing scenario coverage from `docs/user-scenarios.md`.
2. **Group F: Later analytical / publishing work** - sensitivity heatmap, real estate, cash/bond buffer, multi-ETF portfolios, bilingual UI, and public deployment.

Before large implementation work, run `npm run repo:stats` for a quick codebase inventory. After code or docs changes, run `npm run verify`.

---

## Group G: Scenario-Led Portfolio Redesign

Source: `docs/user-scenarios.md` (Anna, Bernd, Clara, Dilan, Eva+Frank, Gabi, Hans, Inge, Jens, Karin).

Main gap: the app still behaves like "compare six new products from scratch." The scenarios need "enter my current portfolio, preserve a baseline, then tell me the next best action."

Suggested order:

1. Ship portfolio inventory and baseline semantics.
2. Add trigger-based entry flows and action recommendation cards.
3. Add portfolio-combination simulation support where today's product-comparison model cannot express the scenario.
4. Layer in specialist decision views: household, PKV switch, windfall, job change, pre-retirement stress test.
5. Fill missing scenario coverage before public positioning.

### P1 Foundation

- `P1` **Start from user situation, not product list.** Add an entry split for "I am starting fresh" vs. "I already have contracts", then route into a short wizard before showing the full calculator.
- `P1` **Portfolio inventory wizard.** Let users add current contracts as existing assets with anchor fields: product type, start year, current value, current contribution, contribution status, paid-up flag, fee assumptions if known, owner/spouse where relevant, and notes/source confidence.
- `P1` **Baseline vs. what-if model.** Persist one pinned baseline scenario and compare every generated or user-created scenario against it. Add a "what changed from baseline" diff in the result panel, export, and share URL.
- `P1` **Multiple instances per product type.** Support two or more bAV/pAV/Riester/ETF contracts in one scenario, including paid-up contracts. This is likely a schema shift from singleton assumptions to per-product instance arrays with stable ids.
- `P1` **Portfolio-combination simulation.** Add a scenario-level portfolio simulator that can combine GRV, several contract instances, ETF withdrawals, and cash/buffer assets while preserving cross-product tax and social-insurance interactions.
- `P1` **Recommendation as an action plan.** Move the decision summary from "winner product" toward "do X next" with explicit monthly amounts, concrete forms/actions, and caveats.
- `P1` **"Where does my next EUR X go?" recommender.** Generate obvious what-if scenarios from the baseline: add to ETF, fill remaining bAV cap, add Basisrente, keep or pause Riester, transfer Riester to AVD, allocate windfall. Rank by net pension, flexibility, risk, and structural lock-in.
- `P1` **Cap and headroom engine.** Expose cap usage for bAV, Basisrente, Riester, AVD, Sparerpauschbetrag, and relevant social-security thresholds. Feed both the recommender and plain-language explanations.

### P2 Decision Views And UX

- `P2` **Trigger-based entry flows.** Add trigger cards for at least bAV offer, job change, windfall/inheritance, old insurance check, PKV switch, close-to-retirement, and general comparison.
- `P2` **Portfolio result view.** Add a combined retirement-income view where multiple active products plus GRV are stacked into one scenario outcome. Keep product comparison as a mode, but do not make users mentally add separate product winners.
- `P2` **Inline dismissal of irrelevant products.** When a user asks "what about Riester/Basisrente/etc.", answer in context with a short reason and a way to add the product only if they disagree.
- `P2` **Existing-contract vintage detection in UI.** Surface pre-2005 pAV, Halbeinkuenfte, section 40b a.F. bAV, old guarantee-rate assumptions, and lump-sum privileges directly on inventory cards, with confirm/override controls.
- `P2` **Contract-card evidence states.** Existing contracts need visible badges for model-derived vs. user-confirmed values, vintage privileges, risky assumptions, missing surrender values, and whether the model is using an estimate.
- `P2` **Employment-status routing.** Add explicit employed, self-employed, civil servant, professional pension scheme, and mixed-career paths. Hide impossible products instead of showing zero-filled placeholders.
- `P2` **Household mode.** Add two profile blocks, per-spouse product attribution, household-level children/allowances, joint tax view, household Wunschnetto, and per-spouse action items.
- `P2` **GKV/PKV switch decision view.** Add PKV premium today, expected premium growth, salary-phase cashflow delta, retirement-phase KV/PV consequences, and lifetime net-cash comparison. Include explicit non-modeled factors such as benefits, family insurance, and difficulty switching back after 55.
- `P2` **Windfall and cash/buffer allocation.** Model household-level lump sums separately from existing contract balances. Add allocation sliders/templates across ETF, AVD, Basisrente, cash reserve, and debt/mortgage once that module exists.
- `P2` **Variable-income stress mode.** Let self-employed users rerun the same plan under low/base/high income years so Basisrente tax leverage does not look falsely stable.
- `P2` **Contract decision templates.** For existing bAV/pAV/Riester instances, generate "continue / paid-up / surrender or transfer" scenarios, with surrender haircut, transfer cost, and provider-fee assumptions.
- `P2` **Prominent uncertainty and stress framing.** Surface Monte Carlo P10/median/P90, Wunschnetto gap, and "retire later" effects in the recommendation for late starters and pre-retirement users, not only in Details.
- `P2` **Scenario library roles.** Distinguish baseline, draft what-if, chosen plan, and archived plan in saved scenarios. Add naming prompts like "Plan 2026" and annual check-in copy.
- `P2` **Year-by-year tax-saving table.** Export a tax/advisor-friendly table for Basisrente, bAV, Riester, and AVD scenarios showing gross contribution, tax saving, allowance, and net burden.

### P3 Support Work

- `P3` **Ad-hoc savings mode.** Allow irregular ETF/cash contributions and one-off deposits without forcing a fixed monthly savings rate.
- `P3` **Recommendation rule engine.** Create a dedicated module, for example `src/app/recommendations.ts`, that turns results, portfolio metadata, cap headroom, and risk metrics into explainable recommendation reasons.
- `P3` **Data-driven trigger mapping.** Consider `src/content/triggers.ts` for trigger cards and target wizards instead of hard-coding each entry path in components.

### Missing User Scenarios

- `P1` **Low-income parent / part-time household.** Current scenarios skew middle/high income. Add a user where Riester allowances, child years, affordability, and small monthly amounts dominate tax optimization.
- `P1` **Civil servant or professional-pension-scheme user.** Engine variants exist, but the scenario set lacks a Beamter/Beamtin or Versorgungswerk professional whose baseline is not GRV.
- `P2` **Homeowner with mortgage trade-off.** Add a household deciding between Sondertilgung, ETF, bAV/Basisrente, and liquidity reserve. This should guide the real-estate/balance-sheet module.
- `P2` **Already-at-payout decision.** Add a 63-67-year-old choosing lump sum vs. annuity vs. staged withdrawals, with KVdR/PKV consequences and sequence-of-returns risk.
- `P2` **Career break / Elternzeit / divorce history.** Add a scenario with interrupted contribution years, child pension credits, Versorgungsausgleich, or restart after divorce so GRV and subsidy assumptions are tested.
- `P3` **Partial German career or international returnee.** Decide whether this is in scope; if yes, add a user with foreign pension rights and incomplete German GRV history. If no, document it as out of scope.
- `P3` **Risk-averse guarantee seeker.** Add a user who values guaranteed income more than expected capital so the recommendation can trade off certainty, flexibility, and return instead of always ranking by expected net value.

---

## Group F: Later Analytical / Publishing Work

Remaining P3 expansion items:

1. **Sensitivity heatmap.** Useful once deterministic and portfolio-combination flows are stable.
2. **Retirement cash / bond buffer module.** Needed for late-starter, windfall, and pre-retirement planning.
3. **Real estate / owner-occupied housing module.** Model household balance-sheet trade-offs such as Sondertilgung vs. ETF or pension products.
4. **Multi-ETF portfolio.** Support multiple ETF sleeves, asset classes, and rebalancing assumptions.
5. **Bilingual UI.** Add English/German localization after the core UX settles.
6. **Public deployment.** Prepare hosting, privacy copy, disclaimers, and bundle/code-splitting work.

---

## Watchlist

- No active `P0` legal or calculation blockers are recorded here. Re-check `LEGAL_IMPLEMENTATION_AUDIT_2026.md` and product research notes before touching rules, tax, or payout logic.
- Keep `docs/user-scenarios.md` and this backlog in sync when adding or removing scenario-led work.
