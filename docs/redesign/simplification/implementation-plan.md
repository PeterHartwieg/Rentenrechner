# RentenWiki.de simplification — implementation handoff

Status: ready for a fresh implementation session; no production implementation performed in the planning session. Prepared 9 September 2026 against commit `1786fc2`. Recheck the checkout before editing.

## Outcome and precedence

Implement the reviewed, revised interactive mockup as the real calculator UI: a short path to a useful retirement overview, minimal required input, and optional depth close to the question it answers. Preserve advanced capabilities without making every user encounter them.

The latest user direction supersedes the May 2026 redesign's restrictions on calls to action and always-visible assumptions. In particular, use clear actions such as “Vorsorge ergänzen” and progressively disclose detailed assumptions. Legal, privacy, calculation, and storage invariants in AGENTS.md still apply. This is a UI and state-integration project, not a new calculation engine or a new product recommendation policy.

### Read these first

1. Root `CONTEXT.md`, `AGENTS.md`, and `docs/context/ui.md`.
2. [Revised interactive mockup](reference/mockup.html): inspect it through computer use, including onboarding, contracts, comparison, and saved alternatives. It is the current visual and interaction reference.
3. [Revision notes](reference/revision-notes.md) and [review synthesis](reference/review-synthesis.md). The [Astra](reference/astra-review.md) and [Fable](reference/fable-review.md) reports reviewed the earlier version; the revised mockup already addresses their main findings. The [original audit](reference/original-audit.md) provides background, not authority to expand this implementation indefinitely.
4. Relevant current modules in the map below. Code takes precedence over stale architecture descriptions. For example, `useWorkspace.ts` is now only a legacy storage-key export; the active workspace hook is `usePortfolioState` in `portfolioState.ts`.

The reference is copied into this repository so implementation does not depend on another task's history or an old preview server. For local inspection, serve `reference/` with a local static server and open `mockup.html`. Its inline scripts and CSS are self-contained; the optional host design controls may be absent outside Codex.

## Product decisions

| Area | Production behavior |
|---|---|
| Start | One primary action to start or resume the personal plan; a quieter comparison action. New users are not silently assigned example contracts. A clearly labelled example is optional and must not overwrite saved work. |
| Setup | Two short steps: personal basics, then pension information. Pension choices: document amount, rough estimate without documents, or later. Contracts are optional and added after the first overview. |
| Pension estimate | Ask approximate age at first work; pauses are optional. Direct contribution years and existing Entgeltpunkte entry remain available under detail. Explain that a career-based estimate is approximate, not an official contribution record. |
| Main plan | One net monthly household total, retirement age, money basis, source rows, and concise uncertainty/duration cues. Main actions: add pension provision and try a change. Saved alternatives appear directly when present. |
| Contract editor | Start with current value and monthly contribution; reveal product-relevant subsidy or essential classification questions only when needed. Fees, payout settings, name, and specialist fields remain optional detail. Unknown and zero remain different. |
| Comparison | Only selected products; one plainly labelled own-money monthly budget. Preserve the net-cost fairness calculation. Do not call alternative product payouts a combined retirement income. Explain payout duration beside each amount. |
| Alternatives | Select a contract only if there is more than one. Change contribution or use the existing paid-up decision, preview the real before/after outcome, then save or explicitly apply. Returning to the plan does not apply the change. |
| Management | Remove contracts and saved alternatives with undo. Applying an alternative also supports undo. Saving survives reload using existing local persistence. |
| Detail | Fees, taxes, health insurance, inflation, payout assumptions, sources, charts, export, and advanced contract actions remain reachable by clear secondary links. No global “expert mode” switch. |
| Wunschrente | Optional explicit target, using existing `desiredNetMonthlyPension`. No automatic salary-derived target presented as the user's own wish. Show a gap only when its total and target are comparable. |

### Translate the mockup; do not ship its shortcuts

- Replace every fixture and multiplier with existing engine results. Never copy the 1,900 € pension, simple contribution multipliers, hardcoded product payouts, default “lifelong” labels, or hardcoded end age 90 into production.
- Remove the mockup-only design-preview banner and “Beispiel-Ergebnis” from actual personal results. Use truthful language such as an estimated result with assumptions; retain explicit example labels only in a separate demo. Keep the real not-advice disclaimer.
- Production saving is already local and durable across reload. Replace the mockup's “lost on reload” messages with accurate local-storage wording. Handle storage failure visibly; do not promise cloud sync.
- The mockup hides unsupported pension systems behind “other.” Production already supports GRV, Versorgungswerk, Beamtenpension and none. Preserve these distinctions and collect appropriate conditional fields; do not regress to GRV-only calculations.
- Payout duration comes from the actual mode: lifelong annuity, fixed term, drawdown horizon, or the AVD payout plan. `retirementEndAge` is not an annuity's death date. AVD has `payoutPlanEndAge`; fixed-term products have their own term. ETF drawdown currently uses the shared horizon. Expose that honestly as a shared assumption, including which other drawdown sources it affects. Do not invent per-ETF end-age persistence that the engine ignores.
- Keep the existing real `/kapital` chart as optional depth. Replace the mockup's simple duration page with an accurate source-duration summary and a link to that real chart, not with an unrelated capital example.
- Reuse actual fee structures. The mockup's single annual-fee field is not a universal replacement for wrapper costs, fund costs, acquisition costs, RIY, or payout fees.

## Establish the state contract before distributing work

This is the first implementation milestone. Write down the chosen types and public helpers in a small implementation note; then downstream components can be built independently.

### Known, assumed, and unknown values

The current domain `EvidenceState` has `user_confirmed`, `model_estimate`, and `statement`; it has no explicit “unknown” variant. Inventory drafts also fill missing numeric fields with defaults. Merely relabelling a badge cannot preserve the user's “I don't know” answer.

Add validated, optional input-status metadata at the scenario boundary, covering profile/pension paths and per-instance paths. Keep it alongside the engine-compatible numeric data, not in a second unvalidated browser store. Prefer this small presentation/input metadata addition over widening every engine number to nullable. Reuse existing evidence mappings for provenance; extend their shared presentation boundary to incorporate explicit unknown status rather than building competing label maps.

The contract must cover:

- Explicit unknown, assumed/default, entered value, and document value. Numeric zero is a valid entered value. Changing an amount to unknown must not quietly make it zero or confirmed.
- Pension entry method and its source inputs (career start and optional pauses, years, points, or projected gross amount), so editing can show what was actually entered.
- Legacy data: missing new metadata does not mean everything is now unknown or confirmed. Preserve old amounts and existing evidence conservatively. Opening a screen never marks defaults as confirmed.
- All relevant load/save, workspace clone, what-if diff/rebase, migration, and currently supported share/export paths. Metadata survives reload and scenario forks. Use `storage.ts` and current validators; do not add direct load/save shortcuts. Inspect validator strictness before choosing an additive schema extension versus a versioned migration.

Define one pure result-readiness selector returning available/estimated/incomplete status, concise reasons, and links to the relevant editor. Use it for the plan, alternatives, comparison where applicable, and exports.

Policy: unknown statutory pension or core contract amount blocks a complete household total. Unknown PKV cost or other missing data required for the displayed net scope also blocks it. Optional costs or payout assumptions may use existing model defaults only with visible assumed/unknown provenance. Do not show a supposedly reliable partial net amount if it depends on unknown household tax or insurance inputs. “No statutory pension” is an explicit supported choice, not the same as unknown. Invalid calculations get an error state, never a plausible zero.

### Pension-estimation integration

Reuse the existing EP estimation path and statutory-pension pipeline. `estimateEpFromYears` in `inventoryHelpers.ts` currently hardcodes statutory values, including an average earnings value that differs from active `de2026.ts`. Before reusing it for the new career helper, make it consume the active rules. This is a bounded, directly relevant correction; document the changed estimate and update only tests that deliberately covered the obsolete helper behavior. Do not rewrite unrelated engine math or regenerate oracle expectations wholesale.

Career years are a rough UI estimate from age minus starting age minus pauses; validate impossible/negative ranges instead of silently clipping. Feed that estimate into the rules-backed helper. Explain the current-income assumption on demand. Do not pretend to reconstruct credited education, caring, child-rearing, or unemployment periods. Manual projected pension and points must keep their existing distinct meanings. Verify any newly authored legal/document instructions against primary sources during implementation.

### Mutations and navigation

Use the existing workspace baseline and `WhatIfScenario` snapshot/diff machinery. Keep edits in a draft until saved. Use stable instance IDs and existing product registry mappings (`versicherung` is a product ID; `insurance` is its workspace array key).

Make removal/apply mutations atomic, stamp baseline changes consistently, and restore complete affected state on undo, including metadata, visibility, and references. Existing removal helpers require particular attention to transfer events and stale-scenario detection. Never leave dangling active transfer references or silently overwrite unrelated intervening edits. Saved alternatives retain their frozen comparison basis. An out-of-date alternative must be recalculated/rebased and reviewed before application; reuse the existing rebase mechanisms.

Give “Mein Plan” and “Vergleich” deterministic destinations without overwriting each other's data. Preferred approach: add a typed `/vergleich` route for the independent comparison journey, keep `/` as landing/personal plan, and retain compatibility with existing compare entry points and topic/share links. Today `?view=compare` is not supported; do not assume it works. Preserve `/eingaben`, `/eingaben/produkte`, `/vertrag/:instanceId`, `/kapital`, and `/vergleich/details` as applicable detail destinations. Update route constructors, navigation, direct loads, and prerender/fallback configuration together. A comparison started from a plan may seed personal profile data explicitly, but must not replace baseline contracts or contributions.

## Implementation sequence and ownership

Model assignment is an explicit user requirement:

- **Astra: UI work only.** Layout, visual hierarchy, German interface copy, progressive disclosure, form interactions, accessibility, responsive styling, component composition, and computer-use UX review.
- **Opus 5 through the Claude Code CLI: mechanical work.** Domain/draft types, adapters, storage and migrations, readiness/duration selectors, rules-backed helper changes, routing plumbing, state mutations, scenario diff/rebase, undo, persistence/export wiring, automated tests, build fixes, and mechanical integration. Do not assign these to Astra merely because they support a UI feature.
- **Lead: orchestration and acceptance.** Define task boundaries, reconcile interface requirements, inspect evidence, and route implementation or fixes to the appropriate model. Shared files have one active editor at a time; the lead coordinates ownership rather than taking over mechanical edits.

Before dispatching mechanical work, inspect the installed Claude Code CLI and verify the exact model identifier that resolves to **Opus 5**. Specify it explicitly for each session and retain the returned model/session metadata in the implementation notes. Do not assume a generic `opus` alias means Opus 5, invent an identifier, or silently substitute another model. If unavailable, report the blocker and continue independent Astra UI work that does not depend on it.

Agree interfaces before parallel edits. Opus supplies the non-visual contract implementations; Astra consumes them through typed props/callbacks. Split mixed files by responsibility and sequence their edits: for example, Opus owns route/state plumbing in `App.tsx` / `Calculator.tsx`, while Astra owns their visible composition. An Astra UI finding requiring a storage or calculation-boundary fix returns to Opus.

Do not create separate user-owned Codex tasks for internal subtasks. Use Astra subagents for UI assignments and Claude Code CLI sessions for Opus assignments. Respect available agent slots; start with at most three active workers total and stage later UI packages as slots free up. CLI sessions do not automatically share the subagent coordination system, so give each an explicit brief, allowed files, dependencies, expected outputs, and a log/result location. Do not run overlapping mutations in parallel.

| Phase | Owner and scope | Exit condition |
|---|---|---|
| 0. Baseline and contracts | Lead coordinates. Astra inspects the mockup/current app and maps visible journeys and retained advanced controls. Opus 5 CLI inspects current state/calculation paths, runs baseline checks, and defines metadata, readiness, mutation, and routing interfaces. | Downstream UI tasks have explicit types/callbacks and a field-retention map. |
| 1. Shared foundation | Opus 5 CLI. Implement compatible metadata/storage/readiness boundaries, draft adapters, and the rules-backed pension helper, with targeted migration and semantic tests. | Unknown is not zero, old state still loads, and metadata round-trips. No downstream UI copies calculation logic. |
| 2A. Short start journey | Astra UI agent. `LandingPage`, `InventoryWizard`, personal and pension editor presentation/interactions. Opus owns supporting draft types, adapters, state wiring, and automated tests. | Fresh user reaches the real plan in two steps; no contracts required; document, career, direct-years/points and skip paths work; editing/cancel works. |
| 2B. Contract editing | Astra UI agent. `InstanceCard`, product input sections, contract editor presentation, optional help and product labels. Opus owns registry adapters, persistence/mutation wiring, and automated tests. | Add/edit/remove supported products and multiple instances. Minimum fields first; details preserve values/provenance; unknown differs from zero. |
| 2C. Comparison | Astra UI agent. `VergleichPage`, cards/selection, scope and payout labels, detail links. Opus owns selector/fair-budget integration, route wiring, and automated tests. | Only chosen products appear; fair own-money anchor and real outputs; durations are mode-correct; advanced comparison and export remain reachable. |
| 2D. Main plan and shell | Astra UI agent when a slot is free. Chrome, `MeinPlanPage`, visible shell composition, summary layout and progressive disclosure. Opus owns typed routing, summary/duration selectors, shared state wiring, and automated tests. | One scoped total, source rows, visible material assumptions, clear actions and optional deeper sections. No always-visible sensitivity table or crowded receipt rail on the default screen. |
| 3. Alternatives and undo | Split explicitly: Astra owns the visible before/after flow and saved-alternative management UI in `CombineWhatIfSection`; Opus 5 CLI owns `portfolioState`, `scenarioDiff`, `contractDecisions`, `workspaceIdentity`, mutation/undo APIs, persistence, and automated tests. | Real before/after, no accidental baseline mutation, durable saved alternatives, safe apply/rebase/remove/undo including reference cleanup. |
| 4. Integration and acceptance | Lead coordinates. Astra performs copy/layout/accessibility fixes and desktop/mobile computer-use checks. Opus 5 CLI handles mechanical integration, storage/export compatibility, regression checks and non-UI code review. | All acceptance journeys below pass and results agree with existing engine outputs. |

Suggested commits follow phases 1, 2A, 2B, 2C/2D, 3, and final integration. Keep each coherent and passing. Reserve shared schema, storage, routing, mutation and selector files for Opus; reserve visual components/styles for Astra except explicitly sequenced wiring changes. Preserve the existing copy catalog where a surface already uses it, especially landing copy; do not strand translations or QA target identifiers.

### Current code landing points

- Routing and shell: `src/App.tsx`, `src/Calculator.tsx`, `src/app/useRoute.ts`, `src/ui/chrome/`, `src/seo/publicRouteRegistry.ts`.
- Setup and saved inputs: `src/features/landing/`, `src/features/inventory/{InventoryWizard,InstanceCard,inventoryHelpers,inventoryProductRegistry,types}`, `src/features/inputs/{AngabenPage,AngabenProduktePage}`, `src/app/useAngabenState.ts`.
- Main result and chart depth: `src/features/mein-plan/`, `src/features/kapital/`, `src/features/vertrag-detail/`.
- Comparison: `src/features/vergleich/`, `src/features/vergleich-detail/`, `src/app/useSimulationResult.ts`, `src/utils/syncContributions.ts`.
- Saved alternatives and mutations: `src/features/produkte/CombineWhatIfSection.tsx`, `src/app/{portfolioState,workspaceIdentity,scenarioDiff,contractDecisions}.ts`.
- Data/result contracts: `src/domain/{workspace,instances,profile}.ts`, `src/domain/products/`, `src/domain/validation/`, `src/storage.ts`, `src/utils/scenarioSchema.ts`, `src/app/useCombineSimulation.ts`, `src/engine/combineContext.ts`, `src/features/results/provenanceHelpers.ts`.

## Acceptance checks

Use focused Vitest/React Testing Library tests for changed semantics and browser interaction for the complete journeys. Do not duplicate implementation in shallow tests or demand screenshots match fixture amounts. Run `npm run verify` as required by AGENTS.md after coherent changes and for the final integrated tree; it includes lint, unit tests, worker checks, build, and prerender in this checkout.

| Journey | Required evidence |
|---|---|
| Fresh user without paperwork | No prefilled personal values presented as confirmed. Approximate career entry reaches a real estimated total, with optional pauses and traceable assumptions. No compulsory contract entry. |
| Unknown information | Skip pension; add a contract with unknown capital/contribution; leave PKV premium unknown. Complete net total stays open in plan and alternatives and cannot become a misleading number through export. Explicit zero/no pension is handled separately. |
| Other profiles | Self-employed, Versorgungswerk, Beamtenpension, no statutory pension, private health insurance, and partner/children detail retain supported semantics. Conditional questions do not silently fall back to employee/GRV defaults. |
| Contract editing | At least two ETFs plus bAV and one insurance/certified product. Details survive collapse, cancel, navigation, and reload. Typing zero clears unknown; unknown does not clear known neighboring fields. |
| Duration and money basis | Lifelong, fixed-term, ETF drawdown, and AVD actual payout modes render accurately; shared horizons are labelled as shared. “Heutige Euro” is actually deflated consistently for total, rows, target, and both sides of alternatives. |
| Alternatives | Preview leaves original unchanged; save survives reload; reopen frozen before/after; changed baseline prompts rebase/review; apply affects intended fields only; undo/remove handles IDs, pins, metadata, transfers, and references. |
| Comparison | Select one/two/all/none; no unselected result cards. Equal net-cost anchor remains correct. Profile/contract baseline is unchanged after comparison. Input changes affect real calculations. |
| Navigation and compatibility | First visit, returning saved plan, old compare state, topic preselection, supported share links, direct contract/detail URLs, browser back/forward, save/cancel return paths. No loop or forced re-onboarding. |
| Accessibility/responsiveness | Computer-use checks at 1024, 736, 390/360 and 320 px; light/dark; native keyboard traversal, visible focus, labelled unknown controls, usable validation, no hidden focus or horizontal clipping. Test details and long saved names, not only the landing screen. Reset temporary viewport overrides. |
| Guardrails | Disclaimer remains session-only and visible as required; first in print and CSV. Public brand correct. No new telemetry/network. Registry identity and engine pipelines preserved. Existing oracles remain stable except a separately explained direct helper correction. |

Compare displayed totals against `runCombineSimulation` / existing compare results for representative fully specified fixtures, including tax-sensitive combinations. Never reconstruct household net by summing independently taxed product headlines. Hide advanced presentation, not calculations or source information needed to interpret the result.

## Review and completion

After implementation, perform an independent UI-only novice review with a fresh Astra reviewer and, if available, one Claude Code CLI session using the exact Fable 5.1 model. These reviewers must receive only the running UI, a neutral “little financial and IT knowledge” persona, and the tasks below. Do not provide source, implementation rationale, prior findings, or expected answers. Do not substitute another model and label it Fable if unavailable; report that limitation. Have mechanical/non-UI code review run separately through Opus 5 in the Claude Code CLI with source access. The explicitly requested Fable 5.1 novice review remains a review-only exception to the implementation model split.

Neutral reviewer tasks: start without pension documents; add an ETF with some unknown details; explain what the headline includes and whether it lasts for life; find costs and assumptions; try a contribution change, save it, return to the original, find it again, and apply it; remove a contract and recover it; compare two products; repeat key tasks on a phone-sized view. Ask for observed confusion and reproduction steps. These are AI role-play checks, not a human usability study.

Address material findings, rerun affected checks, and record what changed and any remaining limitations. Update the relevant UI/context docs to the final implementation. Finish with a concise summary, passing-check evidence, and reviewable local result or draft PR as appropriate. Deployment, publishing, and merging are not part of this handoff. No backend, OCR, commercial gating, broad engine rewrite, or replacement of advanced tools is authorized by this UI plan.
