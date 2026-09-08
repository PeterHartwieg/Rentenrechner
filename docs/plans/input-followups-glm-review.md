# Independent GLM 5.3 Flash plan review

Date: 2026-09-08. CLI: `claude-glm`, model: `glm-5.3-flash`. Session: `7e1c651c-5497-49e8-9c09-68ac18cb53d2`. Source baseline: `ffa40ee920046a071542227a25403e1df8d605a2`. Read-only review; the reviewer did not implement or deploy changes.

The review below applies to the initial plan. Its factual corrections and delivery order have since been incorporated into [the revised plan](input-followups.md). Suggestions are review input, not verified legal guidance or new delivery authorization.

---

Verification complete. Here is the independent review. Everything below was checked against the source in this worktree; no files were modified.

# Review of `docs/plans/input-followups.md`

## Plan 1 — Personal-information controls

**Verdict: honest and correctly scoped, with one factual correction — the "existing" tax-class input does not exist and must be built.**

Confirmed against code:
- `familienstand`/`bundesland` are page-local state that never reaches the engine: `src/features/inputs/AngabenPage.tsx:297-298`, reset at `:518-519`, and the docstring at `:289-296` says so explicitly. Neither field exists on `PersonalProfile` (`src/domain/profile.ts`).
- `churchTax` is persisted and validated (`src/domain/profile.ts:12`, `src/utils/scenarioSchema.ts:39`) but read by nothing in `src/engine/` — `retirementTax.ts:65` lists it as unimplemented, and `productPresentation.ts:63` states "Kirchensteuer nicht berechnet (immer 0 %)". The plan's "persisting the strings would not fix the calculation" is right.
- Salary `taxClass` is real and substantive: `src/engine/salary.ts:204-256` runs the full §39b class dispatch (III → splitting + married soli/deduction status, II → §24b Alleinerziehende, V/VI → statutory V/VI tariff), and it flows into bAV funding via net salary.
- Combine filing status derives from partner presence, not tax class: `src/engine/combineContext.ts:88-90` (`hasPartner → 'married'`), pinned by `portfolioCombine.test.ts:693-719`.

Corrections:
1. **Factual blocker (scope-affecting):** the plan says to replace the dropdown with "the existing, persisted salary tax-class input". Persistence and engine support exist; **no tax-class UI control exists anywhere** — a grep of `src/features/**` for `taxClass|Steuerklasse` finds only combine-mode InfoTips, and legacy `ProfileInputs.tsx` has none either. The PR must build the 1–6 select. Label copy should mirror the `salary.ts` semantics (class III = Splitting, V/VI = Zweitverdienst hint).
2. The "inspect legacy `ProfileInputs`" instruction is moot: it has zero imports (dead code) and contains no marital/state/church claims — I read it in full. Conversely, the combine splitting toggles (`CombineHaushaltSection.tsx:51`, `InventoryWizard.tsx:291`) **are** wired and correct, so their copy must not be changed. Narrow that checklist item accordingly.
3. Acceptance timing nuance: profile edits (salary, tax class) do not re-run `syncMonthlyContributions` same-tick on either state hook; the derived bAV gross re-solves only on the next harmonize (`useCalculatorState.ts:57-67`) or a net edit. The "meaningful salary/funding change" test must assert post-navigation, not same-render.
4. Exact copy to remove: `AngabenPage.tsx:553-555` (aside: "Familienstand schaltet das Ehegattensplitting"), `:590-598` (Datenhaltung persistence disclosure), `AngabenPersonSection.tsx:89-93`, `:136-140`, `:162-166`, `:237-241`.
5. Storage is a non-event: keeping `churchTax`/`taxClass` in the schema (already validated at `scenarioSchema.ts:34,39`; defaults `defaultScenario.ts:14,16`, `urlShareDefaults.ts:16,18`) satisfies the "preserve stored data" requirement with no migration.

Owner decisions: remove the church-tax checkbox vs. keep it disabled with an honest "wird nicht berechnet" hint (the plan picks removal — defensible, but a UX call); tax-class label wording. Do **not** wire the checkbox to a statutory rate as a shortcut — church tax has no implementation path, and that would be exactly the unsupported tax assumption the plans forbid.

## Plan 2 — Conflicting bAV gross input

**Verdict: problem, mechanism, and fix are all confirmed. The recommended read-only derived gross in compare mode is honest and sufficient. One combine-mode presentation decision is left open.**

Confirmed against code:
- Direct write in both modes: `AngabenEinkommenSection.tsx:77-100` writes `assumptions.bav.monthlyGrossConversion` via plain `setAssumptions`, bypassing the sync.
- The anchor is edited in §4: `NettoBelastungControl` ("Netto-Beitrag", `NettoBelastungControl.tsx:40-47`) → `setSyncedMonthlyContribution` (`useAngabenState.ts:552-567`, which also releases a pinned AVD Eigenbeitrag atomically) → `syncMonthlyContributions` re-solves gross (`src/utils/syncContributions.ts:186,228`). Note `src/app/syncContributions.ts` is only a re-export barrel; canonical home is `src/utils/`.
- The revert chain is exactly as the plan describes: dashboard mount runs `harmonizeOnLoad` (`useCalculatorState.ts:84`, helper `:57-67`) and the persistence effect (`:96-101`, no first-run skip) writes the harmonized state back to STORAGE_KEY_V1, so `/eingaben` reads the reverted gross on return. The €500 → ≈€741 magnitude is consistent with the mechanism (default salary 75 000 €, class 1) but should be reproduced numerically during implementation.
- Audit claim confirmed: `AngabenEinkommenSection.tsx:89` is the **only** compare-mode direct gross write; `BavInputs.tsx:90-98` routes its net field through `onSyncMonthlyContribution`; `BavInstanceInputs.tsx:62` is the legitimate per-contract combine write.

Corrections / sharpening:
1. **Combine-mode §2 today silently writes the first active bAV instance, or silently drops the edit with zero instances** — `useAngabenState.ts:183-228` (`projectSingletonAssumptionsToWorkspace`), with the empty-slot default rendered via `SINGLETON_VIEW_DEFAULTS` (`:150-157`). The plan describes this hazard but never says what Schritt-1 §2 should *be* in combine mode. That is the main owner decision: hide the field in combine mode, or keep it read-only with an explicit contract label. Recommendation: hide or read-only on Schritt 1 in both modes; per-contract gross editing stays on Schritt 2's instance disclosure and `/vertrag/:instanceId`.
2. Optional hardening (separate concern, don't fold in): scenario-library load in §4 (`ScenariosPanel` → `useScenarioLibrary`) does not re-harmonize — no sync call exists in `useScenarioLibrary.ts` or `storage.ts` — so a pre-fix save could carry an inconsistent gross until the next dashboard mount.
3. Process note for the cron pipeline: this is a UI-consistency fix, so the PR body must name the fair-comparison invariant per the architectural-invariant-naming guardrail; no engine math changes.

## Plan 3 — GRV provenance

**Verdict: every claim verified. Recommendation is honest and sufficient; the copy surface is duplicated (drift risk is real), while the print/export check turns out to be a no-op.**

Confirmed against code:
- Compare card: `ProdukteEingabenPanel.tsx:235` ("Werte aus deiner DRV-Rentenauskunft übernommen"), `:240` (`status="übernommen"`), `:242-244` (disabled "PDF erneut hochladen" + "Bald verfügbar" tooltip), `:247` (accent referencing the DRV-PDF). Combine duplicates the same literals at `:475`, `:488`, `:494-496`, `:507`. No upload exists anywhere.
- "Stand" is the browser month in both builders: `:703-707,718` and `:755-759,770`.
- Manual mode semantics match the plan: `GRVInputs.tsx:45` (`manualMonthlyGross !== null` = manual), `:130` (selecting manual sets an explicit 0); the engine bypasses EP estimation when non-null (`src/domain/products/grv.ts:38-39`; pinned by `simulate.integration.test.ts:277`).
- Print/export carry **no** GRV import claims (greps over `PrintReport.tsx` and `csvExport.ts` come back clean) — that checklist item closes with "verified, nothing to change".
- Tests pin the offending copy and must be updated in the same change: `ProdukteEingabenPanel.test.tsx:82,668,719`, `DProduktRow.test.tsx:48-56`.
- `AngabenProduktePage.tsx:193-196` (documents checklist) is legitimate "where to find the document" guidance, not an import claim — leave it alone.

Sharpening:
1. The useful edit action already exists: the secondary "Manuell überschreiben" disclosure toggle (compare `:245-246`; combine `:497-506`). Simplest fix: drop the disabled primary (or swap primary/secondary), keep `GRVInputs` unchanged. In combine mode the toggle is gated on `canOverrideGrv` (`onPatchBaseline` + `statutoryPensionResult`, `:482-484`) — the replacement must respect that gate or it reintroduces the dead control the gate was added to remove (CR-PR4-R1-5 comment at `:477-480`).
2. Make "cannot drift" structural: the four card literals exist twice and the Stand logic twice. Extract one shared GRV-card config + field-builder module consumed by both branches.
3. `GRVInputs` is shared by both modes via the `toSingletonAssumptionsForGrvOverride` bridge (`:516-540`), so rewording the Grundlage option "Aus Renteninformation (manuell)" (`GRVInputs.tsx:139`) to a neutral "Manuell eingegeben" is a single edit with automatic two-mode coverage.
4. The GRV card has **no** `EvidenceState` today (evidence flags live on instances; `statutoryPension` carries none) — the plan is right to forbid inventing one, and `evidenceStateToProvKind` should not be wired here because there is nothing to map. Static honest copy is the correct scope.

Owner decisions: final badge wording (single "Schätzung" vs. manual/estimated split by `manualMonthlyGross`); whether to keep any "Upload folgt" hint at all (recommend dropping it entirely).

## Hidden couplings found (cross-cutting)

- **Mode coupling is the deepest trap**: `AngabenEinkommenSection` is mode-agnostic, and in combine mode its write silently projects onto the first active bAV instance (`useAngabenState.ts:183-228`). Any fix that changes affordances must add an explicit `mode`/ownership prop — the plan says this; it is the load-bearing part of the change.
- **Storage**: none of the three plans needs a schema or migration change. All stored fields stay valid; the church-tax compatibility requirement is met by leaving the field in the schema untouched.
- **Harmonize asymmetry**: `/eingaben` never harmonizes on mount; only the dashboard does. The §2 field is the last remaining direct write of a derived contribution; closing it closes the class of bug. Future edit surfaces must route through the sync.
- **PR #373 relationship**: that hotfix addressed the stale-workspace revert on navigation; plan 2's gross/net anchor conflict is a distinct mechanism and is not affected by the merge. The plan's "separate from the hotfix" posture is correct.

## Factual blockers vs. optional improvements

**Blockers (must fix in the plan text before implementation):**
1. Plan 1: "existing … tax-class input" does not exist — the PR includes new UI.
2. Plan 2: no stated decision for what §2 shows in combine mode (hide vs. labeled read-only proxy).

**Optional improvements (do not block):**
- Plan 2: route scenario-library load through the same harmonize as the dashboard.
- Plan 3: extract the shared GRV-card config module (the drift-proofing could also be done by updating both literal sets in one PR).
- Plan 1: drop the moot `ProfileInputs` inspection item.

No plan introduces an unsupported tax assumption; plan 1 explicitly defers household/church-tax modeling, and plans 2–3 are copy/affordance-only. The follow-on household/church-tax feature correctly stays an owner decision, as the plan states.

## Recommended implementation order

1. **Plan 3** — smallest diff, pure copy/affordance change, zero state-flow risk, immediate honesty win.
2. **Plan 2** — one identified surface plus the mode-prop refactor; carries the numeric repro to confirm (€500 → derived gross) in its regression test.
3. **Plan 1** — needs new tax-class UI and label design; its "meaningful funding change" acceptance is easiest to assert once plan 2's anchor consistency has landed.

The plans are independent — this order is by risk and effort, not dependency. One process note: since these will likely ship through the QA-implementer cron, each PR should name its invariant per the cron-dispatch guardrails (fair-comparison invariant for plan 2; truthful-inputs/capability-wording invariant vs. `retirementTax.ts:65`'s church-tax exclusion for plan 1; no-import-claim honesty for plan 3), and plan 1's PR must not touch the oracle goldens — none of the recommended changes reach engine math, so goldens should be untouched in all three.
