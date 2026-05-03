# 12 — "Next-€X" recommender + RecommenderCard UI

Status: needs-triage
Milestone: M3
Plan section: §4 M3.2 + M3.7 + M3.8
PRD capabilities: F9, F10, F11, F12
Depends on: 10, 11

## What

The killer feature for Bernd. Generate 3–4 candidate what-if scenarios from baseline + a marginal-budget input, rank them by median Netto-Rente, attach trade-off labels, render in a dashboard card with re-sort.

## Scope

Engine / logic:

**Marginal budget basis.** The `marginalMonthlyEUR` input is **net cash out-of-pocket per month** — the additional after-tax cash the user is willing to commit. This is the consumer's mental model ("I have €400 left after rent and groceries"). Each candidate is sized so the user's net cash outflow equals `marginalMonthlyEUR`:

- **ETF candidate:** gross contribution = `marginalMonthlyEUR` (no tax leverage; net cost = gross).
- **bAV candidate:** gross conversion sized so the resulting net cost (per `bavFunding.monthlyNetCost`) equals `marginalMonthlyEUR`. The engine's existing two-pass funding loop handles the inversion; the recommender solves it numerically (small bisection or single-step approximation given the user's tax bracket).
- **Basisrente candidate:** gross contribution sized so `(grossContribution - marginalSteuerersparnis) ≈ marginalMonthlyEUR`. Uses the user's marginal tax rate at current zvE as the deduction rate (deductibleFraction is 100% in 2026).
- **Riester candidate:** ownContribution sized so `(ownContribution - allowance/12) ≈ marginalMonthlyEUR`. Allowance from `riesterFunding`.
- **AVD candidate:** treated as ETF for budget purposes (no tax leverage during accumulation) — gross = `marginalMonthlyEUR`.

This means a "€400/Monat" budget produces e.g. ETF at €400 gross / month; bAV at ~€600 gross / month (assuming 33% tax-and-SV deferral), Basisrente at ~€600 gross / month (assuming 33% marginal rate). The user's monthly bank-account outflow is the same €400 in every candidate.

For compare-mode equal-input, the basis is **nominal monthly contribution** (broker mental model) — see issue 16.

- `recommendNextEuro(workspace, marginalMonthlyNetEUR): RecommendedCandidate[]` in `recommendations.ts`. Generates candidates by walking cap-headroom and obvious allocations:
  - **Add to existing ETF instance** (always available unless ETF is at zero cap — there is no ETF cap).
  - **Add to existing bAV instance up to remaining §3 Nr. 63 + SvEV cap.**
  - **Start new Basisrente at €X/Monat.**
  - **Start new AVD at €X/Monat.**
  - **Riester → AVD transfer scenario** (when the user has a Riester instance with non-trivial capital).
  - **Add to existing Riester instance up to §10a cap** (when subsidies still help).
- Each candidate runs through `combinePortfolio` to produce `medianNettoRente`, `lifetimeCash`, `flexibilityScore` (see below), `riskScore` (P10 from `monteCarlo.ts`).
- `flexibilityScore`: ordinal rating per product type (ETF = high, AVD/Riester = medium, Basisrente = low). Drives trade-off labels and re-sort.
- Hard filters: Wunschnetto floor (if set on profile) demotes candidates whose median falls below; no candidate is filtered out, only flagged with a "Wunschnetto nicht erreicht" tag in the rendered output.
- Trade-off labels: each candidate carries an `Atom[]` from the rules engine (e.g. `recommend_basisrente_high_tax`, `recommend_etf_for_flexibility`, `cap_full_warning`).

UI:

- `src/features/dashboard/RecommenderCard.tsx` — top-of-dashboard card in combine-mode.
- Marginal budget input (defaults to 0; quick presets €100 / €200 / €400).
- Ranked list of 3–4 candidates with one-sentence trade-off labels.
- Column headers (Netto-Rente / Flexibilität / Risiko / Lifetime cash) clickable to re-sort. Default ordering and "Rangliste: nach mittlerer Netto-Rente" indicator stay visible above.
- Each candidate has "Als Plan speichern" button that materialises the candidate as a named what-if in the workspace.

## Out of scope

- Vintage-detection rules (issue 13).
- Three-card per-contract template (issue 14).
- Trigger-specific candidate biasing (P2).

## Acceptance

- Bernd's baseline + €400/Monat marginal budget produces ≥3 ranked candidates with distinct trade-off labels.
- Default ranking is by median Netto-Rente; clicking "Flexibilität" header re-sorts visibly.
- "Als Plan speichern" creates a named what-if visible in the scenario library with `origin: 'recommender'`.
- Empty-baseline (Anna) + €200/Monat produces candidates dominated by ETF + bAV (her common decision pair).
- Wunschnetto floor demotion: if Wunschnetto > all candidates' median, every candidate carries the "Wunschnetto nicht erreicht" tag (no winner pretends to reach it).

## Test plan

- Unit: candidate generator deterministic on fixed workspaces.
- Unit: re-sort by each metric produces stable orderings.
- Snapshot: per-persona (Bernd, Jens) recommendation snapshots.
- E2E preview: card renders, click "Als Plan speichern" creates a what-if, navigate to library and verify.
