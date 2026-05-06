# PRD — Optimiere deine Vorsorge

Status: ready-for-human-review
Created: 2026-05-05
Resolves (after sign-off): `.scratch/group-g-qa/issues/59-optimiere-vorsorge-backlog.md`

## Problem statement

Today the calculator has one optimisation surface — `Lücke schließen` — that ranks **additional saving** options against a target monthly net cash burden. It does not help users who already have one or more existing contracts decide whether to keep, change, surrender, or transfer those contracts.

The dashboard does expose per-instance contract decisions through the `Optionen` button on each contract card (`ContractDecisionMenu`), which already supports `Weiterführen | Beitragsfrei | Kündigen | Übertragen` for one contract at a time. But there is no portfolio-level audit: the user has to click into each contract individually, and there is no consolidated view of which contracts deserve attention (high cost, weak guarantee, low flexibility, missing offer data) and how alternative actions would affect their net retirement income.

A separate `Optimiere deine Vorsorge` feature has been on the backlog (`.scratch/group-g-qa/decisions.md` → "Future backlog") with the maintainer flagging it as needing product/legal framing before implementation, because **changing existing contracts** has a stronger advice-risk profile than the additional-saving flow.

## Solution

Add a new portfolio-level modal — **`Optimiere deine Vorsorge`** — that audits all active and paid-up contracts in the user's combine-mode workspace, surfaces per-contract flags, and lets the user explore what-if changes for any subset of those contracts. The flow:

1. **Disclaimer-acknowledge step.** Modal opens on a stronger-than-banner screen that frames this surface as illustrations of decisions about existing contracts, never advice. User must explicitly click `Verstanden, weiter` to proceed. State is **not** persisted across modal opens (mirrors the session-only `DisclaimerBanner` invariant).
2. **Overview step.** Lists every active/paid-up contract with: contract label, product type, monthly contribution (if any), evidence state, and a row of audit-flag chips (`high_cost_active | weak_guarantee | low_flexibility | missing_offer_data`). Sorted worst-first by flag severity. Each row exposes a `Anpassen` CTA.
3. **Instance step.** When a contract is selected, shows the existing per-contract decision cards (`Weiterführen`, `Beitragsfrei stellen`, `Kündigen`, `Übertragen`, **plus the new `Beitrag erhöhen`**), each with a Δ Netto-Rente / Monat chip computed lazily on the displayed instance. User can tick decisions across one or several contracts.
4. **Confirm step.** Shows the user the list of `(contract, decision)` pairs they ticked, with the proposed name of each new what-if scenario. Single click `Pläne erstellen` saves them.
5. **Saved step.** Confirmation listing the created what-ifs by name with a CTA back to the workspace overview.

The baseline is **never** mutated until the final save. Each `(contract, decision)` pair becomes one new what-if scenario (matches the existing `ContractDecisionMenu` save model) so the user can A/B compare them in the workspace scenario list.

The flow is **strictly separate** from `Lücke schließen`. v1 does not allow combining "change existing contract X" with "save more for new contract Y" in a single what-if. That cross-flow combination is a deliberate v2+ scope item.

## User stories

1. As a user with one or more existing retirement contracts, I want to see at a glance which contracts have potential issues (high fees, weak guarantee, low flexibility, missing offer data), so that I can focus my attention on the contracts that matter most.
2. As a user, I want to enter the optimisation flow from a dedicated button on my dashboard, so that the entry path is symmetrical with `Lücke schließen` and equally discoverable.
3. As a user about to change an existing contract in this tool, I want to be reminded that this is an illustration not advice, so that I do not confuse a what-if with a recommendation.
4. As a user, I want to acknowledge a stronger disclaimer specific to changing existing contracts, so that the legal posture is intentional and clear.
5. As a user, I want to drill into one of my contracts and see all available what-if changes (keep, paid-up, surrender + invest, transfer where allowed, increase contribution), so that I can evaluate the realistic alternatives.
6. As a user, I want to see the EUR/month change in my net retirement income for each what-if, so that I can rank the options.
7. As a user, I want to tick multiple options across multiple contracts and save them all as named what-if scenarios in one go, so that I can compare them side-by-side later.
8. As a user, I want my baseline scenario to be untouched if I cancel, so that exploring options is risk-free.
9. As a user, I want to re-open the modal later and re-do the audit, so that I can iterate as offer data improves.
10. As a user transferring a Riester contract into a new AVD, I want the certified transfer path to be picked automatically per AltZertG, so that the resulting plan is statutorily realistic.
11. As a user with a pre-2005 private insurance contract, I want a clear caveat chip on the kündigen option, so that I do not unwittingly throw away a tax-free capital privilege.
12. As a user proposing a Beitrag erhöhen value above the §3 Nr. 63 / §10 Abs. 3 / Riester / AVD statutory caps, I want a `funding_cap_hit` warning, so that I understand the limit applies but I am not auto-clamped.
13. As a user, I want surrender-haircut defaults to be visible per product type and clearly labelled as estimates, so that the kündigen option is not misread as exact.
14. As a user, I want Basisrente contracts to never offer a kündigen option, because §10 Abs. 2 EStG legally prohibits a capital payout.
15. As a maintainer, I want all per-contract decisions to flow through the existing `applyContractDecision` pipeline, so that statutory rules (AltZertG, §169 VVG, §10 Abs. 2 EStG) are not duplicated.
16. As a maintainer, I want each what-if produced by Optimiere to carry `origin: 'recommender'`, so that downstream filtering and labels work without changes.
17. As a maintainer, I want `simulateContractDecision` to be a pure helper that calls `runCombineSimulation`, so that the math is testable without React.
18. As a maintainer, I want every audit flag to be a structured atom, so that future filters / language packs / export labels work the same as the existing recommendation atoms.
19. As a developer, I want the per-instance decision cards to be a single shared component used by both `ContractDecisionMenu` and `OptimiereVorsorgeModal`, so that copy and chip logic stay in one place.
20. As a developer, I want `simulateContractDecision` to be lazy and memoised by `(workspaceFingerprint, decision.id)`, so that opening the modal does not cost N×M `simulatePortfolio` runs upfront.
21. As a privacy-conscious project owner, I want this surface to introduce no backend / fetch / cookies / telemetry, so that the existing publication posture is preserved.
22. As a privacy-conscious project owner, I want the disclaimer-acknowledge state to be modal-scoped and not persisted, so that a user cannot inadvertently dismiss it forever.
23. As a product reviewer, I want copy on every option to use German that matches the rest of the app (decisions.md "Onboarding and wording"), so that the new surface feels native.
24. As a product reviewer, I want the audit-flag thresholds to be locked in `decisions.md` before implementation, so that engineering does not invent statutory bands ad hoc.
25. As a legal reviewer, I want the kündigen option to never default-recommend itself; it must always read as one of several alternatives the user is exploring.
26. As a future iteration owner, I want OCR / document upload of existing contracts to remain out of scope for v1, so that this lands without dragging in the backend introduction.

## Capability map

References used throughout `Plan.md` and follow-up issues:

| Code | Capability |
|---|---|
| **F1** | Modal entry — button in `RentenluckeDashboard` adjacent to `Lücke schließen`. |
| **F2** | Disclaimer-acknowledge step — explicit `Verstanden` click required, persistent banner across subsequent steps, not persisted. |
| **F3** | Overview step — per-instance row, audit flags, sorted worst-first, drill-in CTA. |
| **F4** | Instance step — decision cards with Δ Netto-Rente / Monat chip per card. |
| **F5** | Confirm step — list of `(contract, decision)` pairs with proposed scenario names. |
| **F6** | Saved step — confirmation listing created what-ifs. |
| **E1** | Engine: `Beitrag erhöhen` decision — extend `WorkspaceDelta` + new generator + applier + statutory cap check. |
| **E2** | Engine: `simulateContractDecision` — pure helper using `runCombineSimulation`. |
| **E3** | Atoms: `weak_guarantee`, `low_flexibility`, `missing_offer_data`, `high_cost_active` (new). |
| **E4** | Atoms: `funding_cap_hit` (new) — surfaced on `Beitrag erhöhen` when proposed value exceeds statutory cap. |
| **E5** | Audit aggregator — `auditPortfolio(workspace, simResult, rules) → InstanceAudit[]`, sorts worst-first. |
| **U1** | Refactor: extract `<ContractDecisionCards>` from `ContractDecisionMenu.tsx` into a sibling shared component. |
| **U2** | Copy module — `src/content/optimiereCopy.ts` (German labels, banner, disclaimer body, atom templates extension). |
| **L1** | Stronger disclaimer copy — see `decisions.md` §1. |
| **L2** | "Not advice" language reinforced on every kündigen option. |
| **S1** | What-if persistence — `addWhatIf` per `(contract, decision)` pair, `origin: 'recommender'`. |

## Reuse map

| Concern | Existing module | What we reuse |
|---|---|---|
| Per-contract decision generators | `src/app/contractDecisions.ts` | `weiterfuehrenWhatIf | beitragsfreiWhatIf | kuendigenWhatIf | uebertragenWhatIf | uebertragenVirtualWhatIf`, `WorkspaceDelta`, `applyContractDecision`, statutory rules. |
| Per-instance decision UI | `src/features/dashboard/ContractDecisionMenu.tsx` | Card layout, atom→chip mapping, multi-select save logic. **Refactor U1** extracts the card list into a shared sibling. |
| Modal pattern | `src/features/dashboard/LueckeSchliessenModal.tsx` | Step state machine, transient state, Escape handling, `onSaveAsPlan` boundary. |
| Pure simulation entry | `src/app/useCombineSimulation.ts` | `runCombineSimulation` non-React factory. |
| What-if persistence | `src/app/portfolioState.ts` | `addWhatIf`, `forkBaselineScenario`, `newScenarioId`. |
| Atom rules engine | `src/app/recommendations.ts` | `runRules`, `HIGH_FEE_THRESHOLD = 0.012`, existing privilege/caveat atoms. |
| Atom display copy | `src/content/recommendationCopy.ts` | `renderAtom` German templates (extended with new atoms in U2). |
| Evidence flags | `src/app/evidence.ts`, `src/features/results/provenanceHelpers.ts` | `PRODUCT_EVIDENCE_FIELDS` per product → `missing_offer_data` rule input. |

## Audit-flag taxonomy (proposed)

Concrete thresholds for the four flags. Final values are fixed in `decisions.md` §4.

- **`high_cost_active`** (priority `medium`): `wrapperAssetFee + fundAssetFee + pensionPayoutFeePct > 0.012` on an **active** instance. Reuses `HIGH_FEE_THRESHOLD`. The existing `paid_up_high_fee_warning` covers paid-up instances; `high_cost_active` covers active ones. Only applicable to bAV, insurance, basisrente (the products that have `fees.pensionPayoutFeePct`).
- **`weak_guarantee`** (priority `medium`): For products with a guarantee component (insurance/bAV/Basisrente/Riester), `Garantieleistung at retirement < 0.8 × cumulative paid contributions`. Surfaces a low Garantiezins relative to paid-in capital. ETF and AVD-Standarddepot do not emit this flag (no statutory guarantee).
- **`low_flexibility`** (priority `low`): default surrender haircut ≥ 10% **and** payout mode = `leibrente` **and** product slot ∈ {bAV, insurance, riester}. Captures "money locked in for life". Note Basisrente is locked too but never gets a kündigen option, so flexibility framing differs — Basisrente emits a separate informational flag rather than `low_flexibility`.
- **`missing_offer_data`** (priority `medium`): any of the per-product `PRODUCT_EVIDENCE_FIELDS` is in `'model_estimate'` state. Per `src/app/evidence.ts` this is the inverse of "fully statement-backed". Tells the user "this audit relies on guesses; consider attaching real numbers."

## Step-machine sketch

```
                ┌────────────────────────┐
                │ disclaimer-acknowledge │  (cannot skip; resets each open)
                └───────────┬────────────┘
                            ▼
                ┌────────────────────────┐
                │       overview         │  (one row per active/paid-up instance,
                └───────────┬────────────┘   flag chips, "Anpassen" CTA)
                            ▼
                ┌────────────────────────┐
                │       instance         │  (decision cards w/ Δ Netto-Rente; user ticks)
                └────┬────────────┬──────┘
                     │ "Zurück"   │ "Weiter"
                     ▼            ▼
               (overview)   ┌──────────────┐
                            │   confirm    │  (list of ticked (contract, decision) pairs)
                            └──────┬───────┘
                                   ▼
                            ┌──────────────┐
                            │    saved     │  (lists created what-ifs)
                            └──────────────┘
```

State stays in the modal until `saved` step calls `onCreatePlans(whatIfs)` which routes to `portfolioState.addWhatIf`. Cancel from any step invokes `onClose()` without state mutation.

## Save semantics

For each ticked `(contract, decision)` pair, build one `WhatIfScenario`:

- `origin: 'recommender'` (existing convention; keeps downstream filtering working)
- `derivedFromBaselineId`, `derivedFromBaselineSnapshot` populated by `forkBaselineScenario`
- `assumptions` produced by `applyContractDecision(workspace, decision)` then read out via `applied.baseline.assumptions`
- `id` from `newScenarioId('whatif')`
- `label` proposed automatically as e.g. `"bAV Allianz beitragsfrei"`, `"Riester Volksbank → AVD übertragen"`. Final names are editable on the confirm step.

This is the same model `ContractDecisionMenu` already uses. The two surfaces produce identical-shaped what-ifs; they differ only in the audit step before selection.

## Non-goals (v1)

- **No backend / OCR / document upload.** Existing contracts are entered via the inventory wizard and editable evidence flags. OCR is a separate Group B item, gated on backend introduction.
- **No combination with `Lücke schließen` in a single what-if.** A user who wants to model "surrender pAV **and** save more in ETF" creates two separate what-ifs today. v2+ scope.
- **No auto-clamp of Beitrag erhöhen to statutory caps.** Cap exceedance emits a flag (`funding_cap_hit`); user decides.
- **No `Beitrag senken` decision** in v1. Symmetric counterpart but not in the issue's required-actions list. Future scope.
- **No permanent dismissal of the disclaimer-acknowledge step.** Every modal open returns to it. (Aligns with the session-only `DisclaimerBanner` invariant: this is publication-blocking compliance.)
- **No commercial-license gating.** Default to free per `CLAUDE.md` "License posture", same as `Lücke schließen`.

## Open questions (resolved in `decisions.md`)

1. Disclaimer copy — exact German wording.
2. `Beitrag senken` inclusion — recommend exclude in v1.
3. Entry-point placement — recommend dashboard button next to `Lücke schließen`.
4. Audit thresholds — concrete numbers locked.
5. Cross-flow combination with `Lücke schließen` — recommend out-of-scope for v1.
