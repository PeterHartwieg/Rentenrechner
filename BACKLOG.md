# RentenWiki Backlog

Open work and ideas. Shipped work lives in `git log`; closed PRDs/issues are moved under `.scratch/archive/<slug>/`.

## Where work lives

Each non-trivial initiative gets a directory under `.scratch/<slug>/` with a `PRD.md` and numbered issue files (`issues/NN-...md`). Conventions:

- Issue tracker: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain doc updates: `docs/agents/domain.md`

This file is the **index** — when you're about to dispatch work, start from a PRD, not from a bullet here. Bullets without a PRD are theme-level ideas, not actionable issues.

Before large implementation work, run `npm run repo:stats`. After code or docs changes, run `npm run verify`.

## Active PRDs

| PRD | Status | Notes |
|---|---|---|
| [`qa-feedback-mode`](.scratch/qa-feedback-mode/PRD.md) | active | In-app QA capture / annotation overlay; `PHASE-PLAN.md` drives waves. |
| [`group-g-qa`](.scratch/group-g-qa/) | active | Combine-mode QA pass against shipped portfolio mode; ~30 open issues across three orchestrator handoff rounds. |
| [`pure-frontend-api`](.scratch/pure-frontend-api/PRD.md) | needs-triage | Pure front-end API facade over the engine + comparison pipeline. |

## Research references

- Legal and tax: `LEGAL_REVIEW.md`, `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`, `LEGAL_IMPLEMENTATION_AUDIT_2026.md`
- Product research: `ETF_RESEARCH.md`, `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `BASISRENTE_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`, `RIESTER_RESEARCH.md`, `GRV_RESEARCH.md`
- User scenarios: `docs/user-scenarios.md`
- Agent routing: `AGENTS.md`, `CONTEXT.md`, `docs/context/*.md`

## Open themes (not-yet-PRD'd)

Bullets here are seeds — promote one to a `.scratch/<slug>/PRD.md` when you're ready to scope it.

### Publication polish (post-launch)

- Donation UI — GitHub Sponsors badge in README + Stripe Payment Link "Spenden" / "Support this project" button in topbar. No account flow; single-click external checkout.
- Commercial license inquiry — "Für Berater & Vermittler" footer link → static page describing the commercial license + `mailto:peter@hartwieg.com` (HTML form once a backend lands).
- PDF report polish — print-only branded logo / OG-style banner once a logo exists; per-page disclaimer footer for multi-page output; client-ready advisor formatting requested after the first hosted release. Disclaimer + brand header/footer already wired in `PrintReport.tsx`.
- License-tier feature matrix — at launch, paid commercial license is **permission-only** (no feature gating). Revisit before adding features that primarily benefit professional users (white-label, batch scenarios, branded PDF). Capture decisions in `COMMERCIAL_LICENSE.md`.
- Privacy-respecting analytics — Plausible or Umami (cookie-free, EU-hosted); page views + basic funnel only, no PII. Update Datenschutzerklärung when added.
- Bilingual UI (DE/EN) — likely `react-i18next`; defer until DE UX is stable.
- Landing copy — short marketing page (or extended deployed README) explaining what the tool is, who it's for, the donation/commercial model, and the disclaimer.
- Logo / wordmark / OG images — pending; track here until a designer pass lands.
- Basic error tracking — frontend error logging (Sentry browser SDK or similar) once a backend / collector exists.

### Decision views and UX expansion

- More trigger flows — bAV offer, job change, windfall/inheritance, old-insurance check, PKV switch, close-to-retirement, general comparison. Infra exists (`WIZARD_REGISTRY` + `src/content/triggers.ts`); each new trigger = one row in `PATH_OPTIONS` + one row in `WIZARD_REGISTRY` + one component file.
- Inline dismissal of irrelevant products — when a user asks "what about Riester/Basisrente/etc.", answer in context with a one-line reason and an "add anyway" affordance.
- Employment-status routing — explicit employed / self-employed / civil-servant / Versorgungswerk / mixed-career paths; hide impossible products instead of showing zero-filled placeholders.
- Household / dual-profile mode — two profile blocks, joint zvE in tax pipeline (engine ready), per-spouse product attribution, household-level children/allowances, household Wunschnetto, per-spouse action items.
- GKV/PKV switch decision view — PKV premium today, expected premium growth, salary-phase cashflow delta, retirement KV/PV consequences, lifetime net-cash comparison; explicit non-modeled factors (benefits, family insurance, switch-back difficulty after 55).
- Windfall and cash/buffer allocation — household-level lump sums modeled separately from existing balances; allocation sliders/templates across ETF, AVD, Basisrente, cash reserve, debt/mortgage once that module exists.
- Variable-income stress mode — self-employed users rerun the same plan under low/base/high income years so Basisrente tax leverage doesn't look falsely stable.
- Prominent uncertainty / stress framing — surface Monte Carlo P10/median/P90, Wunschnetto gap, and "retire later" effects in the recommendation surface, not only in Details.
- Scenario library roles — distinguish baseline / draft what-if / chosen plan / archived plan in saved scenarios; naming prompts ("Plan 2026") and annual check-in copy.
- Year-by-year tax-saving table — tax/advisor-friendly export for Basisrente, bAV, Riester, AVD scenarios showing gross contribution, tax saving, allowance, and net burden.
- Already-at-payout decision — 63–67-year-old choosing lump sum vs. annuity vs. staged withdrawals, with KVdR/PKV consequences and sequence-of-returns risk.
- Career break / Elternzeit / divorce history scenario — interrupted contribution years, child pension credits, Versorgungsausgleich, restart after divorce; tests GRV and subsidy assumptions.
- Homeowner with mortgage trade-off scenario — household deciding between Sondertilgung, ETF, bAV/Basisrente, and liquidity reserve; guides the real-estate / balance-sheet module.
- Data-driven trigger mapping — `src/content/triggers.ts` already carries `PATH_OPTIONS`, `VISIBLE_PRODUCTS_BY_PATH`, `PRIMARY_PRODUCT_IDS`, `SECONDARY_PRODUCT_IDS`. Extend it for new entry flows / trigger cards before adding more hard-coded paths in `GuidedSetup`.

### Backend (deferred until a feature requires it)

Today the app is frontend-only. Introduce the backend only when triggered by a real feature.

- Choose backend stack at the time. Constraints: GDPR-compliant region, low fixed cost, file-upload-friendly. Candidates: Cloudflare Workers + R2, Vercel functions + S3, Hetzner VPS with Node/FastAPI. Don't pre-commit.
- OCR / document upload — parse Riester/bAV/GRV-Renteninformation statements and brokerage statements; map fields onto inputs. Files processed ephemerally, never stored. User-side: drag-and-drop in the inputs panel, manual confirm/override before applying. Likely first backend feature — drives the stack decision.
- Hosted scenario sync — multi-device save for licensed users. Requires auth + DB; significant scope expansion — only if user feedback demands it.
- License-key validation endpoint — only if/when feature gating returns. Today the commercial license is permission-only.
- Server-side error tracking — Sentry or similar, for backend code only; frontend stays opt-in.

### Analytical / publishing (later)

- Sensitivity heatmap — useful once deterministic and portfolio-combination flows are stable.
- Retirement cash / bond buffer module — needed for late-starter, windfall, and pre-retirement planning.
- Real estate / owner-occupied housing module — household balance-sheet trade-offs (Sondertilgung vs. ETF vs. pension products).
- Multi-ETF portfolio — multiple ETF sleeves, asset classes, and rebalancing assumptions.

### Scenario coverage gaps

Main gap: the app still behaves like "compare six new products from scratch." The scenarios need "enter my current portfolio, preserve a baseline, then tell me the next best action."

Suggested order:

1. Ship portfolio inventory and baseline semantics.
2. Add trigger-based entry flows and action recommendation cards.
3. Add portfolio-combination simulation support where today's product-comparison model cannot express the scenario.
4. Layer in specialist decision views: household, PKV switch, windfall, job change, pre-retirement stress test.
5. Fill missing scenario coverage before public positioning.

### P1 foundation

- `P1` **Start from user situation, not product list.** Add an entry split for "I am starting fresh" vs. "I already have contracts", then route into a short wizard before showing the full calculator.
- `P1` **Portfolio inventory wizard.** Let users add current contracts as existing assets with anchor fields: product type, start year, current value, current contribution, contribution status, paid-up flag, fee assumptions if known, owner/spouse where relevant, and notes/source confidence.
- `P1` **Baseline vs. what-if model.** Persist one pinned baseline scenario and compare every generated or user-created scenario against it. Add a "what changed from baseline" diff in the result panel, export, and share URL.
- `P1` **Multiple instances per product type.** Support two or more bAV/pAV/Riester/ETF contracts in one scenario, including paid-up contracts. Schema migration plan in `docs/portfolio-schema-design.md`: schemaVersion bump 1 → 2, instance-id format `${productId}-${random8}` with deterministic singleton-id `${productId}-singleton`, storage key bump `rentenrechner-state-v1` → `-v2`, and a `PortfolioAdapter` that wraps singletons as length-1 arrays so existing simulators stay byte-identical during migration. Reusable input sections already extracted in `src/features/inputs/sections/`; provenance primitives in `src/features/results/provenance.tsx`.
- `P1` **Portfolio-combination simulation.** Add a scenario-level portfolio simulator that combines GRV, several contract instances, ETF withdrawals, and cash/buffer assets while preserving cross-product tax and social-insurance interactions.
- `P1` **Recommendation as an action plan.** Move the decision summary from "winner product" toward "do X next" with explicit monthly amounts, concrete forms/actions, and caveats.
- `P1` **"Where does my next EUR X go?" recommender.** Generate obvious what-if scenarios from the baseline: add to ETF, fill remaining bAV cap, add Basisrente, keep or pause Riester, transfer Riester to AVD, allocate windfall. Rank by net pension, flexibility, risk, and structural lock-in.
- `P1` **Cap and headroom engine.** Expose cap usage for bAV, Basisrente, Riester, AVD, Sparerpauschbetrag, and relevant social-security thresholds. Feed both the recommender and plain-language explanations.
- `P1` **Low-income parent / part-time household scenario.** Current scenarios skew middle/high income. Add a user where Riester allowances, child years, affordability, and small monthly amounts dominate tax optimization.
- `P1` **Civil servant or professional-pension-scheme user scenario.** Engine variants exist; the scenario set lacks a Beamter/Beamtin or Versorgungswerk professional whose baseline is not GRV.

### P2 decision views and UX

- `P2` **Trigger-based entry flows.** Trigger cards for at least bAV offer, job change, windfall/inheritance, old insurance check, PKV switch, close-to-retirement, and general comparison.
- `P2` **Portfolio result view.** Combined retirement-income view where multiple active products plus GRV are stacked into one scenario outcome. Keep product comparison as a mode, but do not make users mentally add separate product winners.
- `P2` **Inline dismissal of irrelevant products.** When a user asks "what about Riester/Basisrente/etc.", answer in context with a short reason and a way to add the product only if they disagree.
- `P2` **Existing-contract vintage detection in UI.** Surface pre-2005 pAV, Halbeinkünfte, §40b a.F. bAV, old guarantee-rate assumptions, and lump-sum privileges directly on inventory cards, with confirm/override controls.
- `P2` **Contract-card evidence states.** Existing contracts need visible badges for model-derived vs. user-confirmed values, vintage privileges, risky assumptions, missing surrender values, and whether the model is using an estimate.
- `P2` **Employment-status routing.** Explicit employed, self-employed, civil servant, professional-pension-scheme, and mixed-career paths. Hide impossible products instead of showing zero-filled placeholders.
- `P2` **Household mode.** Two profile blocks, per-spouse product attribution, household-level children/allowances, joint tax view, household Wunschnetto, and per-spouse action items.
- `P2` **GKV/PKV switch decision view.** PKV premium today, expected premium growth, salary-phase cashflow delta, retirement-phase KV/PV consequences, lifetime net-cash comparison. Include explicit non-modeled factors such as benefits, family insurance, and difficulty switching back after 55.
- `P2` **Windfall and cash/buffer allocation.** Model household-level lump sums separately from existing contract balances. Add allocation sliders/templates across ETF, AVD, Basisrente, cash reserve, and debt/mortgage once that module exists.
- `P2` **Variable-income stress mode.** Self-employed users rerun the same plan under low/base/high income years so Basisrente tax leverage does not look falsely stable.
- `P2` **Contract decision templates.** For existing bAV/pAV/Riester instances, generate "continue / paid-up / surrender or transfer" scenarios, with surrender haircut, transfer cost, and provider-fee assumptions.
- `P2` **Prominent uncertainty and stress framing.** Surface Monte Carlo P10/median/P90, Wunschnetto gap, and "retire later" effects in the recommendation for late starters and pre-retirement users, not only in Details.
- `P2` **Scenario library roles.** Distinguish baseline, draft what-if, chosen plan, and archived plan in saved scenarios. Add naming prompts like "Plan 2026" and annual check-in copy.
- `P2` **Year-by-year tax-saving table.** Export a tax/advisor-friendly table for Basisrente, bAV, Riester, and AVD scenarios showing gross contribution, tax saving, allowance, and net burden.
- `P2` **Homeowner with mortgage trade-off scenario.** Household deciding between Sondertilgung, ETF, bAV/Basisrente, and liquidity reserve. Guides the real-estate/balance-sheet module.
- `P2` **Already-at-payout decision scenario.** 63–67-year-old choosing lump sum vs. annuity vs. staged withdrawals, with KVdR/PKV consequences and sequence-of-returns risk.
- `P2` **Career break / Elternzeit / divorce history scenario.** Interrupted contribution years, child pension credits, Versorgungsausgleich, restart after divorce — tests GRV and subsidy assumptions.

### Group G follow-ups

**Beitragsfrei engine support.** issue 14 V1 omits the Beitragsfrei card from the contract-decision menu because engine simulators don't read `status === 'paid_up'`. Adding support requires each per-product simulator (bAV, pAV, Basisrente, Riester, AVD) to (a) zero contributions during paid-up phase, (b) switch to the phase-2 fee model. Re-enable `beitragsfreiWhatIf` in `ContractDecisionMenu.tsx` once that lands.

### P3 support work

- `P3` **Ad-hoc savings mode.** Irregular ETF/cash contributions and one-off deposits without a fixed monthly savings rate.
- `P3` **Recommendation rule engine.** Dedicated module (e.g. `src/app/recommendations.ts`) that turns results, portfolio metadata, cap headroom, and risk metrics into explainable recommendation reasons.
- `P3` **Data-driven trigger mapping.** `src/content/triggers.ts` carries `PRIMARY_PRODUCT_IDS` / `SECONDARY_PRODUCT_IDS` (comparison-picker grouping). Topic-page deep-link preselection is owned by `src/seo/publicRouteRegistry.ts` — each route may declare a `preselection: { mode, visibleProducts? }` and `LandingPage` reads `?topic=<slug>` via `resolveTopicPreselection` (issue #13). When new entry-flow needs arise, prefer extending the SEO registry's `preselection` field over inventing a new keyspace. The legacy `PATH_OPTIONS` / `VISIBLE_PRODUCTS_BY_PATH` / `WIZARD_REGISTRY` mechanism has been removed.
- `P3` **Partial German career or international returnee scenario.** Decide whether in scope; if yes, add a user with foreign pension rights and incomplete German GRV history. If no, document as out of scope.
- `P3` **Risk-averse guarantee seeker scenario.** A user who values guaranteed income more than expected capital so the recommendation can trade off certainty, flexibility, and return instead of always ranking by expected net value.

---

## Group F: Later analytical work

- `P3` **Sensitivity heatmap.** Useful once deterministic and portfolio-combination flows are stable.
- `P3` **Retirement cash / bond buffer module.** Needed for late-starter, windfall, and pre-retirement planning.
- `P3` **Real estate / owner-occupied housing module.** Household balance-sheet trade-offs such as Sondertilgung vs. ETF or pension products.
- `P3` **Multi-ETF portfolio.** Multiple ETF sleeves, asset classes, and rebalancing assumptions.

---

## Watchlist

- No active legal or calculation blockers. Re-check `LEGAL_IMPLEMENTATION_AUDIT_2026.md` and product research notes before touching rules, tax, or payout logic.
- Keep `docs/user-scenarios.md` and this file in sync when adding or removing scenario-led work.
- Monte Carlo (engine `src/engine/monteCarlo.ts`, UI `MonteCarloPanel.tsx`) is shipped — see "Decision views and UX expansion" for the recommendation-surface framing follow-up.
- Oracle safety net: `docs/golden-coverage-audit.md` documents what every external oracle pins and the integration-snapshot coverage. Re-read before changing test files; do not "tidy" goldens — they are our externally-verified anchor.
- Schema reference: `docs/portfolio-schema-design.md` is the binding design for instance ids, baseline-vs-what-if semantics, and the v1 → v2 migration. Treat as authoritative for the invariants it pins; update it (not in PRs) if a future change has to deviate.
- Disclaimer guardrail: keep `DisclaimerBanner` session-only (`sessionStorage`, never `localStorage`); keep the disclaimer block as the literal first child of `PrintReport`'s `#print-report` and the first section of `buildExportCsv`. Tests and project memory call this out — regressions are publication-blocking compliance.
