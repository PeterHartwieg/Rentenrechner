# Rentenrechner Backlog

Open work only. Completed history belongs in git; implementation detail belongs in code, tests, and research notes.

Research references:

- Legal and tax: `LEGAL_REVIEW.md`, `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`, `LEGAL_IMPLEMENTATION_AUDIT_2026.md`
- Product research: `ETF_RESEARCH.md`, `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `BASISRENTE_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`, `RIESTER_RESEARCH.md`, `GRV_RESEARCH.md`
- User scenarios: `docs/user-scenarios.md`
- Agent routing: `AGENTS.md`, `docs/context/*.md`

## Priority Legend

- `P0`: Required before public launch.
- `P1`: Important for v1 publish.
- `P2`: Useful expansion.
- `P3`: Later.

## Current focus

Publication push. Recommended order:

1. **Group 0** - Pre-flight foundation cleanup before publication / Group G.
2. **Group P** — Publication readiness (license, disclaimer, donation, deployment, branding).
3. **Group B** — Backend introduction (only when OCR/upload feature is picked up).
4. **Group G** — Scenario-led portfolio redesign (existing P1 work).
5. **Group F** — Later analytical / publishing work.

Before large implementation work, run `npm run repo:stats`. After code or docs changes, run `npm run verify`.

---

## Group 0: Pre-flight foundation cleanup

Highest-priority prep before the publication push and the scenario-led portfolio redesign. This captures the current internal codebase review plus external feedback. Goal: tighten the legal/export guardrails, preserve the test safety net, and make the next large schema change deliberate instead of opportunistic.

### P0 do first

- `P0` **Ship Group P P0 legal/export guardrails first.** Implement the OSS license, commercial-license terms, Impressum, Datenschutzerklaerung, and disclaimer infrastructure before touching Group G engine architecture. The disclaimer must be collapsible per session only, never permanently hidden; PDF and CSV exports must embed the disclaimer as the first block. This is additive, unblocks launch, and avoids re-touching export paths after the portfolio refactor.
- `P0` **Golden coverage audit, no golden refactor.** Read `simulate.integration.test.ts`, `externalGolden.test.ts`, and the external golden fixtures to confirm what each oracle pins. Add small missing black-box cases only if a real coverage gap is found. Do not restructure or "tidy" the golden tests before the singleton-to-instance migration; they are the safety net for Group G.
- `P0` **Portfolio/schema design note before implementation.** Write a short design note for baseline vs. what-if semantics, stable contract instance ids, singleton-to-instance migration, share-URL/localStorage compatibility, paid-up/existing-contract representation, and how the first portfolio adapter will feed today's product simulators.

### P1 do if Group G is next

- `P1` **Split the three fat input/edit components into reusable sections.** `BavInputs.tsx`, `InsuranceInputs.tsx`, and `ProductEditCards.tsx` still assume one product instance. If Group G P1 is imminent, extract reusable sections for contribution, payout mode, fees, Beitragsdynamik, guarantee/Rentenfaktor, contract vintage, and evidence/provenance while keeping the current singleton state shape. If Group G is not imminent, defer this to avoid premature churn.
- `P1` **Harden scenario-library persistence before schema churn.** Main state is versioned and validated, but saved scenario library entries are loaded from raw JSON. Add validation/migration around saved scenarios before baseline roles and product instances are introduced.
- `P1` **Move trigger/card configuration out of components.** Before adding many Group G entry flows, introduce a small content/config module for trigger cards and product groupings so `GuidedSetup` and comparison selection do not become another hardcoded growth point.

### Explicit non-goals for this phase

- Do not refactor tax, payout, product registry, or Monte Carlo just for cleanliness; they are already modular and covered by tests.
- Do not rewrite integration/oracle tests for aesthetics before the portfolio migration.
- Do not introduce backend, auth, cookies, analytics, or telemetry as part of cleanup.

---

## Group P: Publication readiness

Everything required to publish the tool publicly under the donation + commercial-license model.

### P0 launch blockers

- `P0` **OSS license file.** Add `LICENSE.md` at root with PolyForm Noncommercial 1.0.0 verbatim. Add a header note pointing brokers/advisors/employers to `peter@hartwieg.com` for commercial use.
- `P0` **Commercial license terms.** Add `COMMERCIAL_LICENSE.md` covering: scope (single-seat advisor / firm-wide / employer self-service), price tiers (TBD), permitted use (client-facing illustrations, internal training), prohibited use (resale, white-label without rider), indemnification clause, term + renewal, jurisdiction (Germany).
- `P0` **Disclaimer infrastructure.** Persistent banner on every screen ("Diese Berechnung ist keine Steuer-, Rechts-, oder Anlageberatung."). Collapsible per session, never permanently dismissible. Embedded as the first block of every PDF and CSV export. Same disclaimer added to README and any landing page.
- `P0` **Impressum + Datenschutzerklärung.** German legal requirement. Static pages or routes. Datenschutzerklärung must reflect "no PII collection" today — update when backend / analytics land.
- `P0` **Branding decision.** App name, logo (or wordmark), domain, OG images. "Rentenrechner" is taken; pick a name before launch. Affects: page title, share-URL, exports, donation page, license docs.
- `P0` **Public deployment.** Hosting (likely Cloudflare Pages or Vercel for the static frontend), build pipeline (GitHub Actions on `main`), custom domain, HTTPS, basic error tracking. No backend yet → no DB or auth.

### P1 launch-essential

- `P1` **Donation UI.** GitHub Sponsors badge on README. Stripe Payment Link "Spenden" / "Support this project" button in the topbar. No account flow — single-click external checkout.
- `P1` **Commercial license inquiry.** "Für Berater & Vermittler" link in footer → static page describing the commercial license + `mailto:peter@hartwieg.com` (later: HTML form once backend lands).
- `P1` **PDF report** *(was #15 P2 — bumped)*. Brokers will print client-ready outputs; report must embed the disclaimer header, profile, key results, and the comparison table. Source: `src/features/results/PrintReport.tsx` already exists; expand sections + add print-only header/footer with disclaimer.
- `P1` **License-tier feature matrix.** Decide and document: at launch, paid commercial license is **permission-only** (no feature gating). Revisit before adding features that primarily benefit professional users (white-label, batch scenarios, branded PDF). Capture the decision in `COMMERCIAL_LICENSE.md`.

### P2 publication polish

- `P2` **Privacy-respecting analytics.** Plausible or Umami (cookie-free, EU-hosted). Page views + basic funnel only, no PII. Update Datenschutzerklärung when added.
- `P2` **Bilingual UI (DE/EN).** Translation infrastructure (likely `react-i18next`), content extraction, fallback to DE. Defer until UX is stable for DE.
- `P2` **Landing copy.** Short marketing page (or extended README on the deployed site) explaining what the tool is, who it's for, the donation/commercial model, and the disclaimer.

---

## Group B: Backend introduction (deferred until first feature requires it)

Today the app is frontend-only. Introduce the backend only when triggered by a real feature.

- `P2` **Choose backend stack.** Constraints: GDPR-compliant region, low fixed cost, file-upload-friendly. Candidates: Cloudflare Workers + R2, Vercel functions + S3, Hetzner VPS with Node/FastAPI. Decide at the time of the first backend feature — don't pre-commit.
- `P2` **OCR / document upload.** Parse Riester/bAV/GRV-Renteninformation statements and brokerage statements; map fields onto inputs. Files processed ephemerally, never stored. User-side: drag-and-drop in the inputs panel, manual confirm/override before applying. Likely first backend feature — drives the stack decision above.
- `P3` **Hosted scenario sync.** Multi-device save for licensed users. Requires auth + DB; significant scope expansion — only if user feedback demands it.
- `P3` **License-key validation endpoint.** Only if/when feature gating returns. Today the commercial license is permission-only.
- `P3` **Server-side error tracking.** Sentry or similar, for backend code only — frontend stays opt-in.

---

## Group G: Scenario-led portfolio redesign

Source: `docs/user-scenarios.md` (Anna, Bernd, Clara, Dilan, Eva+Frank, Gabi, Hans, Inge, Jens, Karin).

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
- `P1` **Multiple instances per product type.** Support two or more bAV/pAV/Riester/ETF contracts in one scenario, including paid-up contracts. Likely a schema shift from singleton assumptions to per-product instance arrays with stable ids.
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

### P3 support work

- `P3` **Ad-hoc savings mode.** Irregular ETF/cash contributions and one-off deposits without a fixed monthly savings rate.
- `P3` **Recommendation rule engine.** Dedicated module (e.g. `src/app/recommendations.ts`) that turns results, portfolio metadata, cap headroom, and risk metrics into explainable recommendation reasons.
- `P3` **Data-driven trigger mapping.** Consider `src/content/triggers.ts` for trigger cards and target wizards instead of hard-coding each entry path in components.
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

- No active `P0` legal or calculation blockers are recorded. Re-check `LEGAL_IMPLEMENTATION_AUDIT_2026.md` and product research notes before touching rules, tax, or payout logic.
- Keep `docs/user-scenarios.md` and this backlog in sync when adding or removing scenario-led work.
- Monte Carlo (engine in `src/engine/monteCarlo.ts`, UI in `MonteCarloPanel.tsx`) is shipped — no follow-up work tracked here. Stress-framing surfacing is a UX item under Group G P2.
