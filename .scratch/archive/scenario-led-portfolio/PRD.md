# PRD — Scenario-led portfolio redesign (Group G)

Status: done. Source decisions in `.scratch/archive/scenario-led-portfolio/decisions.md`.

## 1. Mission

Today's calculator compares six retirement products from scratch. The next version starts from the user's actual situation — what they already have, where their next euro should go, and what their whole portfolio adds up to in retirement — while still giving brokers the product-vs-product comparison they need for client conversations.

The redesign is one feature with two equal-weight entry points: **Mein Plan** (combine the user's portfolio, recommend the next action) and **Produkte vergleichen** (compare candidate products side-by-side, equal-cash or equal-input).

## 2. Audience

Two first-class audiences. Both must work well at launch.

- **Consumers** — ten personas spanning age, family, employment, KV/PV status, income, portfolio depth, and trigger. Some are clean-slate (Anna, 26, first job), most have existing contracts (Bernd, 38, mid-career portfolio review), some are pre-retirement (Inge, 60). They want a recommendation, not a chart-fest.
- **Insurance brokers and investment advisors** — the explicit commercial-license audience under PolyForm Noncommercial. They need product comparison to advise and sell. Existing competitor tools have poor UX; a real revenue lever for the project's commercial-license tier.

## 3. Personas (condensed from `docs/user-scenarios.md`)

| # | Name | Trigger | Combine or Compare | Capabilities stressed |
|---|------|---------|--------------------|------------------------|
| 1 | Anna, 26, single, first job | HR bAV onboarding | Combine (clean-slate path) | Onboarding split, trigger-typed cards, in-line "what about Riester?" answer |
| 2 | Bernd, 38, mid-career, family | Promotion, €400 extra/Monat | Combine | Inventory wizard (multi-instance), baseline + what-ifs, "next-€X" recommender, cross-product interaction text |
| 3 | Clara, 41, freelancer, PKV | Steuerberater tip on Basisrente | Combine | Selbständig toggle (no GRV/bAV), pre-2005 pAV detection, variable-income what-if |
| 4 | Dilan, 34, job change | Letter from old bAV provider | Combine | Multi-instance bAV, paid-up flag, three-card per-contract template, contract-vintage warnings |
| 5 | Eva (45) + Frank (47), couple | Mid-life check | Combine, household mode (P2) | Household + Ehegattensplitting, inter-spouse optimisation, per-spouse product attribution |
| 6 | Gabi, 55, late starter + windfall | Inheritance + retirement runway | Combine | Lump-sum allocation wizard, late-starter caveats, glidepath surfacing |
| 7 | Hans, 49, GKV→PKV switch | PKV broker quote | Combine | GKV/PKV toggle through both phases, lifetime-sum view, irreversibility caveats |
| 8 | Inge, 60, pre-retirement | Anxiety after market headlines | Combine | Monte Carlo P10/Median/P90 in headline, retire-later slider, vintage privilege auto-detection (§40b a.F.) |
| 9 | Jens, 44, top-bracket lawyer | Steuerbescheid shock | Combine | Cap-detection across products (bAV cap exhausted → Basisrente), tax-saving cashflow table |
| 10 | Karin, 52, old-insurance check | Broker pitch to switch contract | Combine | Pre-2005 pAV detection, Halbeinkünfte privilege, three-card per-contract template, sensitivity range |
| Broker | Independent advisor / insurance broker | Client meeting prep | Compare | Equal-input sub-mode, side-by-side product cards, branded export (later, P2/P3) |

## 4. Capabilities

Priorities:

- **P1**: required for the Group G launch.
- **P2**: important shortly after launch.
- **P3**: later.

### 4.1 Foundation (P1)

- **F1. Two-mode entry.** Landing has two equal-weight CTAs: "Mein Plan" (combine) and "Produkte vergleichen" (compare). Mode is a property of the workspace and round-trips through share-URLs and the scenario library.
  *Acceptance:* Anna can pick "Mein Plan", Bernd can pick "Mein Plan", a broker can pick "Produkte vergleichen". The two paths are visually distinct, both reachable in one click from the landing screen.
- **F2. Combine-mode portfolio model.** A workspace carries one **baseline** (the user's actual portfolio) plus zero or more **what-if** scenarios (alternative allocations).
  *Acceptance:* Bernd's baseline (GRV + Riester + 2 bAV + ETF) computes a single combined net retirement income; a what-if "+€400 ETF" shows the delta against that baseline.
- **F3. Multiple instances per product type.** A user can hold two or more bAV / pAV / Riester / ETF / AVD contracts in one scenario, each with its own contract vintage, status (active / paid-up / surrendered), fees, and label.
  *Acceptance:* Dilan adds two bAV instances (paid-up old, active new) and sees them as separate cards with separate retirement payouts.
- **F4. Compare-mode evolution.** Two sub-modes: *equal-cash* (today's consumer fair-comparison, default for consumer entry) and *equal-input* (broker default — every selected product runs at the same nominal monthly contribution).
  *Acceptance:* A broker enters €200/Monat, picks three pAV candidates with different fees, and sees them ranked side-by-side at €200/Monat each.

### 4.2 Inventory and baseline (P1)

- **F5. Existing-portfolio inventory wizard.** "Hast du schon Verträge?" → checklist + per-product expandable cards covering 7 product types. Each card asks anchor + high-impact fields (~5–10 fields, depending on product); detail behind a per-card "Details" disclosure.
  *Acceptance:* Bernd can complete his inventory (5 products, 6 instances) in under 8 minutes. Anna, who has nothing, ticks no boxes and proceeds straight to the recommendation.
- **F6. Auto-pinned baseline.** The portfolio entered in the wizard *is* the baseline. No explicit "save as baseline" button. The word "baseline" surfaces in copy, the action is implicit.
  *Acceptance:* On wizard exit, the dashboard shows "Baseline: dein aktueller Plan" with the baseline numbers populated.
- **F7. Empty baseline is valid.** A clean-slate user has a baseline = "GRV only, no contracts". Their first what-if is meaningful as a delta against it.
  *Acceptance:* Anna's dashboard shows GRV-only retirement income immediately; her first what-if "Plan: €100 bAV + €100 ETF" diffs cleanly against it.
- **F8. Re-baselining.** Edit-baseline-in-place by default; one-click "Aktuellen Stand als Baseline speichern und neu starten" archives the current baseline and forks. What-ifs derived from the previous baseline show a "Baseline hat sich geändert" badge with re-base / keep-as-is options.
  *Acceptance:* Bernd, returning a year later, edits his bAV current value and sees his last year's "Plan 2026" what-if flagged as out-of-date.

### 4.3 Recommendation and what-ifs (P1)

- **F9. "Where does my next €X go?" recommender.** From baseline + a marginal-budget input, the recommender generates 3–4 what-if candidates and ranks them by median Netto-Rente (with total-lifetime-cash tie-break).
  *Acceptance:* Bernd enters €400/Monat, sees four ranked what-ifs (more bAV / Riester→AVD / Basisrente / +ETF) with one-sentence trade-off labels each.
- **F10. Trade-off labels per candidate.** Every ranked what-if carries one explicit trade-off sentence ("Höchste Rente, aber Kapital nicht verfügbar bis 67"). Generated by the rules engine, not free-text.
  *Acceptance:* No what-if appears as "winner" without a trade-off label. The rules engine emits structured atoms; templates render German strings.
- **F11. Hard filters on candidates.** Wunschnetto floor (if the user has set one) demotes candidates that don't reach it. User-stated flexibility need (later optional input) demotes illiquid candidates.
  *Acceptance:* Inge's Wunschnetto of €1,900 demotes any candidate whose median Netto-Rente falls below €1,900, with a "Wunschnetto nicht erreicht" badge.
- **F12. Re-sort by alternative criteria.** User can click a column header to re-rank by flexibility, risk (P10), tax leverage, or lifetime cash. Default ranking and reasons stay visible above.
  *Acceptance:* The ranking metric is always shown ("Rangliste: nach mittlerer Netto-Rente"). Re-sort updates the ordering and the visual indicator.

### 4.4 Cap and headroom engine (P1)

- **F13. Cross-product cap detection.** The rules engine surfaces unused headroom (bAV §3 Nr. 63, Basisrente §10 Abs. 3, AVD cap, Riester cap, Sparerpauschbetrag) as recommendations.
  *Acceptance:* Jens sees "Dein bAV-Cap ist ausgeschöpft. Nächster Steuer-Hebel: Basisrente (~€56k Cap, du nutzt 0)." Bernd sees "bAV-Cap noch zu 35 % frei (€188/Monat möglich)."

### 4.5 Per-instance contract decisions (P1)

- **F14. Three-card per-contract template.** Each active or paid-up contract on the dashboard has an "Optionen für diesen Vertrag" button generating up to four what-ifs: Weiterführen / Beitragsfrei stellen / Kündigen / Übertragen auf {target} (where applicable).
  *Acceptance:* Dilan can generate "alten bAV stehen lassen / übertragen / freiwillig weiterzahlen" as three named what-ifs in one click. Karin can generate "Vertrag weiter / beitragsfrei / kündigen mit €52k Rückkauf" similarly.
- **F15. Partial-transfer event log.** Übertragung between contracts is modelled as a transfer event on the source instance (`{ year, targetInstanceId, amountEUR }`). Source remains in the portfolio after partial transfer; ongoing accumulation continues on residual capital with original contract privileges intact.
  *Acceptance:* Karin can transfer 50 % of her 2002 pAV to ETF in 2030 and see the residual capital still benefit from Halbeinkünfte tax treatment in retirement.

### 4.6 Evidence and confidence (P1)

- **F16. Per-value evidence flag.** Every input on every instance card carries an evidence flag: `user_confirmed` (green), `model_estimate` (yellow), `statement` (blue, later via OCR). **Conservative default:** any field whose value the user did not explicitly type is `model_estimate`. This includes (a) accepted-as-is wizard defaults, (b) all fields on instances migrated from v1 legacy state (we cannot tell post-hoc which numbers the user typed), and (c) any newly-added schema field on a previously-saved workspace. Only fields the user typed in the wizard or sidebar are `user_confirmed`. One-click "Wert ist okay" promotes estimate → confirmed.
  *Acceptance:* The inventory wizard never shows a value without an evidence indicator. Estimates surface visibly. Migrated v1 workspaces show every field as a yellow estimate badge until the user explicitly confirms each (or accepts a "Alle bestätigen" bulk action — P2 follow-up).
- **F17. Confidence indicator on derived results.** Dashboard, recommendation copy, and exports show a confidence indicator next to retirement-income figures derived from any `model_estimate` value. Recommendation language uses "auf deinen Schätzungen ergibt sich…" rather than asserting correctness.
  *Acceptance:* If Karin accepted a default Effektivkosten value, her retirement-income card shows "🤔 Teilweise geschätzt" with a click-through to the underlying estimates.

### 4.7 Cross-product interaction text (P1)

- **F18. Rules-engine-driven explanations.** Plain-language statements about cross-product interactions ("Mehr bAV senkt zvE → Steuerspar-Hebel von Basisrente sinkt") are generated by the rules engine and rendered through per-rule templates. No free-text strings inside React components for these explanations.
  *Acceptance:* Bernd's recommendation card carries an explanation tying his bAV-cap headroom to the Basisrente trade-off. The text is generated, not hand-written for his specific scenario.

### 4.8 Persona scenarios at launch (P1 minimum coverage)

The following personas must be fully serviceable at the Group G launch:

- **F19. Anna** — clean-slate consumer, 4-question minimum-input flow, 1-page recommendation with 2–3 candidate what-ifs.
- **F20. Bernd** — existing-portfolio consumer, multi-instance, "next-€X" recommender, baseline + named what-ifs, scenario library save.
- **F21. Dilan** — job-change consumer, multi-instance bAV, three-card per-contract template, contract-vintage warning surfacing.
- **F22. Jens** — top-bracket consumer, cap-detection across products, "next steuer-hebel" recommendation.
- **F23. Karin** — old-insurance consumer, pre-2005 / Halbeinkünfte / 4 % Garantiezins auto-detection, three-card per-contract template, sensitivity-range support.
- **F24. Generic broker** — equal-input compare-mode, ≥3 candidate products at the same nominal contribution, side-by-side ranking and CSV export.

The remaining personas (Clara, Eva+Frank, Gabi, Hans, Inge) are P2 — see §4.10.

### 4.9 New persona slots (P1)

- **F25. Low-income parent / part-time household scenario.** Add to `docs/user-scenarios.md`. Drives Riester allowance proration, child-zulage UX, tight-budget what-if templates.
- **F26. Civil servant / Versorgungswerk professional scenario.** Add to `docs/user-scenarios.md`. Drives Beschäftigungsstatus-toggle UI surfacing of the existing engine variants (Beamtenpension, Versorgungswerk).

### 4.10 P2 scenarios and views

- **F27. Eva + Frank** — household / dual-profile mode + Ehegattensplitting UI surfacing + inter-spouse optimisation hints. **Schema foundation in P1**, UX in P2.
- **F28. Hans** — GKV/PKV decision view, lifetime-sum view (49 → 90), PKV-Beitrag-Steigerung input, irreversibility caveat.
- **F29. Gabi** — lump-sum/windfall input + allocation wizard + glidepath suggestion + late-starter caveats.
- **F30. Inge** — Monte Carlo P10/Median/P90 in headline + retire-later slider + §40b a.F. auto-detection emphasis.
- **F31. Clara** — Selbständig toggle (structurally removes GRV/bAV from comparison), variable-income what-if templates via the `freelance_basisrente` trigger.
- **F32. Trigger-based entry flows.** Each new trigger (job_change, inheritance, pkv_switch, pre_retirement, old_insurance_check, tax_max, freelance_basisrente, annual_checkin) ships independently as its own ticket using the P1 trigger-router infrastructure.
- **F33. Portfolio result view.** Combined retirement-income view stacking GRV + active products in one waterfall.
- **F34. Inline dismissal of irrelevant products.** When a user asks "what about Riester?" the answer renders inline ("ohne Kinder selten optimal — Kosten hoch, Förderung gering") with a "trotzdem hinzufügen" button.
- **F35. Vintage detection in UI.** Pre-2005 pAV, Halbeinkünfte, §40b a.F. bAV, old guarantee rates surface as evidence-state badges on inventory cards.
- **F36. Employment-status routing.** Selbständig / Beamter / Versorgungswerk / mixed paths hide impossible products instead of zero-filling them.
- **F37. Three-card decision templates extended** to Riester (paused/active), Basisrente (rare), AVD (rare).
- **F38. Year-by-year tax-saving table** for advisor-friendly export of Basisrente / bAV / Riester / AVD scenarios.
- **F39. Scenario library roles.** Distinguish baseline / draft what-if / chosen plan / archived. Add naming prompts ("Plan 2026") and annual check-in copy.

### 4.11 P3 later work

- **F40. Multi-year variable income** (alternating €40k/€90k schema and engine extension).
- **F41. Recommendation rule engine** richer layer (tax-bracket-aware, KVdR-aware, age-aware, broader rule set).
- **F42. Ad-hoc savings mode** (irregular ETF/cash contributions, one-off deposits).
- **F43. Career break / Elternzeit / divorce history** scenario.
- **F44. Risk-averse guarantee-seeker** scenario.
- **F45. Partial German career / international returnee** scenario (or document as out-of-scope).

## 5. Cross-cutting guardrails

These apply to every capability above and trump local optimisation.

- **G1. No silent default masquerading as user data.** Every retirement-income figure derived from at least one `model_estimate` value carries a confidence indicator on the dashboard, in recommendation copy, and in exports. Recommendation language phrases conditional on estimates ("auf deinen Schätzungen ergibt sich…") rather than asserting correctness.
- **G2. Disclaimer remains non-permanently-dismissible.** The session-only `DisclaimerBanner` (sessionStorage, never localStorage) and the disclaimer-as-first-block in CSV/PDF exports must remain. Group G must not regress this — adding new export formats inherits the rule.
- **G3. Not advice.** No capability claims to give advice. Every recommendation is an illustration. Brokers using the tool retain full responsibility for client-facing advice (commercial-license indemnification clause).
- **G4. Frontend-only until OCR.** No phone-home, no analytics without consent, no fetch outside CDN assets and the share-URL itself, no cookies. Group G ships fully offline-capable.
- **G5. Display-layer rounding only.** The engine returns full-precision floats. Statutory rounding only where the law requires it (`floorEuro(zvE)`). Display rounding via `formatCurrency` / `formatPercent` / `<NumberField decimals=...>`. Group G features must not round inside the engine.
- **G6. Keep external oracle goldens green.** `simulate.integration.test.ts` and the bAV-funding / payroll / retirement-tax oracle goldens remain byte-identical through the singleton-to-instance migration (length-1 array round-trip). No "tidying" goldens before the migration ships.

## 6. Non-goals

Explicitly out of scope for Group G:

- **N1. Mobile app.** Mobile-web-friendly is required; native app is not.
- **N2. Account / login.** No accounts. Workspace is a share-URL or local storage.
- **N3. Telemetry / analytics on the consumer site.** Privacy-respecting analytics (Plausible / Umami) is a Group P P2 item, decoupled from Group G.
- **N4. Backend.** No server-side anything. Group B (backend) ships only when triggered by a real feature need (OCR is the natural trigger).
- **N5. Cross-locale UI.** Bilingual EN support is Group P P2; Group G is German-only.
- **N6. Data import from broker systems.** No live integrations with Versicherer or banks. OCR (P3 / Group B) is the closest in-scope item.
- **N7. White-label / branded broker exports.** Tracked separately under license-tier features (Group P P1).
- **N8. Multi-year variable income at year granularity** (Clara's "I earn €40k odd years, €90k even years" scenario at full fidelity). P3 only.

## 7. Success criteria

The Group G launch is successful when:

- **S1. Coverage.** Personas Anna, Bernd, Dilan, Jens, Karin, plus the generic broker, can complete their full path through the tool without dead-ends or workarounds. The remaining five personas have a documented manual workaround.
- **S2. Time-to-first-recommendation.** A clean-slate consumer (Anna) reaches a personalised recommendation in under 5 minutes on first visit. An existing-portfolio consumer (Bernd) reaches the same in under 10 minutes.
- **S3. Compatibility.** Pre-Group-G share URLs and saved scenarios load without data loss. Schema migration is observable in tests and dogfooded once before launch.
- **S4. Engine identity.** External oracle goldens (`simulate.integration.test.ts`, payroll, retirement-tax, bAV-funding) stay byte-identical through the migration.
- **S5. Confidence visibility.** No retirement-income figure on the dashboard or in any export reaches the user without an associated confidence indicator when at least one input is `model_estimate`.
- **S6. Broker first-impression.** A broker completing the equal-input compare-mode path with three candidate pAV products produces a side-by-side comparison and an exportable PDF in under 5 minutes.

## 8. Launch-readiness appendix (Group P)

Pre-existing publication blockers from `BACKLOG.md` that must close before Group G's first public release:

- **L1. Branding decision.** App name, logo, domain, OG images. "Rentenrechner" is taken; pick a name before launch. Affects: page title, share-URL slug, exports header, donation page, license docs, Impressum strings.
- **L2. Public deployment.** Hosting (Cloudflare Pages or Vercel for the static frontend — SPA fallback already wired), build pipeline (GitHub Actions on `main`), custom domain, HTTPS, basic error tracking.
- **L3. Donation UI.** GitHub Sponsors badge on README, Stripe Payment Link "Spenden" button in topbar.
- **L4. Commercial license inquiry.** "Für Berater & Vermittler" footer link → static page describing the commercial license + `mailto:peter@hartwieg.com`.
- **L5. PDF report polish.** Branded header/footer (depends on L1), per-page disclaimer footer for multi-page output.

Group G can ship publicly only after L1 and L2 close. L3, L4, L5 can ship slightly after.

## 9. Scope shifts vs. BACKLOG.md

Several capabilities the PRD lists as P1 are flagged P2 or P3 in `BACKLOG.md`. This is intentional, driven by the persona analysis in §3:

- **F35 Vintage detection in UI** — was P2; promoted to P1 because Karin and Inge cannot reach decisions without it. Engine paths exist; surfacing is small UI work.
- **F16/F17 Evidence states + confidence indicators** — was P2; promoted to P1 because guardrail G1 (no silent default) cannot be honoured without `evidenceMap` on every instance.
- **F14 Three-card per-contract template** — was P2; promoted to P1 because Dilan and Karin cannot reach decisions without it.
- **F9–F12 Recommender + thin rules engine** — was P3; thin layer promoted to P1 because Bernd and Jens cannot reach a recommendation without it. Rich layer (F41) stays P3.

Items still flagged P2/P3 in BACKLOG.md remain deferred at their original priority: household mode (F27), OCR / Group B, prominent stress framing (P2), year-by-year tax tables (P2), Monte Carlo prominence (P2). See Plan §5.5 for the matching engineering note.

## 10. Document hygiene

- This PRD is the source of truth for *what* and *why*. The Plan (`Plan.md`) is the source of truth for *how*. Issues (`issues/*.md`) are the source of truth for the work-in-flight.
- When a capability ships, mark its acceptance criteria checked here and move the entry to `BACKLOG.md` as completed. Do not delete; the trail matters for refresh cycles.
- When a capability scope changes, update this PRD inline and note the change in the matching issue's `## Comments` section. The Plan auto-updates in the next pass.
- Cross-cutting guardrails (§5) trump per-capability convenience. If a capability tempts a guardrail violation, escalate; do not quietly relax.
