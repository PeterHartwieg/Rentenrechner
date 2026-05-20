/**
 * Policy-default constants for the Mein-Plan sensitivity rows (PR 6).
 *
 * These are **product-policy defaults**, NOT statutory values — they parametrise
 * the "Was sich ändern würde, wenn …" perturbations shown on the Mein-Plan page.
 * Statutory cohort values, contribution caps, tax brackets and similar live in
 * `src/rules/de2026.ts` (year-bound) or `src/rules/legalConstants.ts` (cross-year).
 * Per CLAUDE.md "No statutory values outside `src/rules/`" — the literals here
 * never feed engine math; they only choose which perturbation to compare against
 * the baseline. Each row's effect is rendered through the same combine-mode
 * simulation pipeline as the baseline, so the resulting deltas are
 * always engine-derived, never hand-rolled.
 *
 * Design intent for each constant is paragraph-cited below so a future reader
 * understands why these specific perturbations are surfaced.
 */

/**
 * Return scenario id consumed by the "Rendite konservativ" row. Looked up by
 * `id` against `WorkspaceAssumptionsV2.returnScenarios` — never by array index
 * (positional indexing of `returnScenarios` is a documented anti-pattern per
 * CLAUDE.md "returnScenarios[0] is not necessarily 'basis'"). The default
 * scenario array ships `[konservativ, basis, optimistisch]`; konservativ is the
 * 10th-percentile-bound conservative return used by Sober D Methode references
 * (~3 % p.a. on MSCI World rolling 30-year history per defaultScenario).
 *
 * The row surfaces "what if equity markets deliver the lower-quantile path you
 * already see as a Renditeannahme on /eingaben?" — it's a pure
 * scenario-substitution, no fee or tax assumption touched.
 */
export const SENSITIVITY_RETURN_KONSERVATIV_ID = 'konservativ' as const

/**
 * Renteneintritt 70 row — postpone the user's retirement to age 70. The cap is
 * a soft user-experience choice (70 is the legal upper bound for
 * Regelaltersrente Hinausschieben in practice and matches the mock copy in
 * `direction-d.jsx`'s "Was sich ändern würde, wenn …" block).
 *
 * The selector still clamps the perturbed `profile.retirementAge` against the
 * workspace's `retirementEndAge − 1` so a user with a low `retirementEndAge`
 * (e.g. 75) does not end up with `retirementAge >= retirementEndAge`, which
 * the simulation rejects.
 */
export const SENSITIVITY_RETIREMENT_AGE_DELAY = 70 as const

/**
 * Inflation 3 % row — bump `assumptions.inflationRate` from whatever the user
 * has set to 3 % p.a. flat. 3 % is "noticeably above the EZB Mittelfrist-Ziel"
 * (the 2 % default rendered on /eingaben as the inflation hint) — concretely a
 * stress-case that nominal headline figures will look unchanged but the real
 * purchasing-power figure on the receipt drops.
 *
 * Inflation only affects `realBalance` / display rounding, not nominal
 * `monthlyNetIncome` (the engine pipes inflation through accumulation row
 * `realBalance` but does NOT deflate `netMonthlyPayout`). The row body copy on
 * the page must therefore frame the delta against real purchasing power, not
 * nominal monthly net.
 */
export const SENSITIVITY_INFLATION_RATE = 0.03 as const

/**
 * "+100 €/Monat in den ETF" — bump the **first active ETF instance's**
 * `monthlyContribution` by 100 EUR/Monat. Mirrors the mock copy in the
 * sensitivity list ("… du den ETF-Sparplan um 100 € erhöhst → +N €/Mon."). The
 * selector skips the row entirely (no perturbation, headlineDelta = 0,
 * `note: 'no_etf_instance'`) when the workspace has zero active or paid-up ETF
 * instances. We do NOT fabricate an ETF instance from scratch — fabricating
 * one introduces fee, equity-partial-exemption, and contractStartYear choices
 * that would silently bias the comparison.
 *
 * 100 EUR/Monat is the same anchor magnitude the recommender uses by default
 * when no explicit budget is set (see `marginalMonthlyEUR` plumbing). Keep the
 * two aligned so the user reads them as the same lever.
 */
export const SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR = 100 as const
