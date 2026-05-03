# 11 — Cap and headroom detection rules

Status: needs-triage
Milestone: M3
Plan section: §4 M3.3
PRD capabilities: F13, F18
Depends on: 10

## What

Add cross-product cap-detection rules to the rules engine. Each rule pre-computes the user's cap usage on a relevant statutory limit and emits an atom.

## Scope

Rules to ship:

- `bav_cap_remaining` — bAV §3 Nr. 63 + §1 SvEV cap. Atom carries `usedPct`, `remainingMonthly`, `nextLeverProductId` (Basisrente if cap nearly full).
- `basisrente_cap_remaining` — §10 Abs. 3 EStG single-cap (€30,826 in 2026) minus pension-system contributions. Atom carries `usedPct`, `remainingAnnual`.
- `riester_cap_remaining` — §10a EStG cap (€2,100 incl. allowances). Atom carries `usedPct`, `allowanceCovered`, `topUpToCap`.
- `avd_cap_remaining` — Altersvorsorgedepot 2027 cap (per `de2026.altersvorsorgedepot`). Atom carries `usedPct`, `remainingMonthly`.
- `sparerpauschbetrag_remaining` — Sparerpauschbetrag (€1,000 single / €2,000 married). Atom carries `usedAnnual`, `remainingAnnual`. Considers Vorabpauschale on ETF.

Rules consume `RuleEngineInput.combinedResult` plus instance arrays directly. Pure functions, no React.

## Out of scope

- UI rendering for these atoms (handled by issue 12 RecommenderCard / per-instance badges).
- Trigger-specific caps (e.g. `pkv_switch` PKV-related caps) — P2.

## Acceptance

- Jens-shape workspace (bAV at cap) emits `bav_cap_remaining` atom with `usedPct: 1.0` and `nextLeverProductId: 'basisrente'`. Also emits `basisrente_cap_remaining` with `usedPct: 0` (he's not paying Basisrente).
- Bernd-shape workspace (bAV partially used) emits `bav_cap_remaining` with `usedPct ≈ 0.65`, `remainingMonthly ≈ €188`.
- Single-bAV-instance workspace produces the same cap usage as multi-instance with same total contribution.
- Rules are deterministic for fixed input.

## Test plan

- Unit per rule with fixture workspaces from each persona.
- Edge: bAV at exactly the cap → `usedPct: 1.0` (not slightly over due to rounding).
- Edge: empty workspace → all caps `usedPct: 0`, `remainingMonthly = cap / 12`.
