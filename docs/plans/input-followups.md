# Plans for the remaining input findings

Prepared 2026-09-08 after the €500 persistence fix in PR #373 (merged as ffa40ee920046a071542227a25403e1df8d605a2). These plans are separate from the production hotfix. Reviewed against the released source via the `claude-glm` CLI using `glm-5.3-flash`; factual corrections and the recommended delivery order are incorporated below. See [the independent review](input-followups-glm-review.md). These are implementation plans; no follow-up code has been changed or deployed.

## 1. Make personal-information controls match supported calculations

### Confirmed problem

`AngabenPage.tsx` holds `familienstand` and `bundesland` in page-local state. `AngabenPersonSection.tsx` changes only those strings, while the help text promises splitting and regional church-tax effects. Neither value enters `PersonalProfile` or the engine, and both reset on navigation. The existing `profile.churchTax` checkbox persists, but the engine does not consume it; `retirementTax.ts` explicitly lists church tax as unsupported. Simply persisting the two strings would not fix the calculation problem.

The engine does support salary `profile.taxClass`. Joint retirement taxation is a different concept: `calculateRetirementTax` accepts filing status, and combine-mode `buildCombineContext` currently derives it from partner presence. Do not equate marital status with tax class, default a spouse's income to zero, or activate splitting from a dropdown alone.

### Recommended first release: expose supported inputs and state the limitation honestly

- Replace the non-functional marital-status dropdown with a new salary tax-class select (I–VI) bound to the already persisted `profile.taxClass`. The engine and storage support this field, but no selector exists in the current UI. Label it explicitly as the salary-phase tax class; do not promise joint retirement taxation or infer a class from marital status.
- Remove the non-functional Bundesland dropdown and interactive church-tax checkbox from this surface until their calculation paths exist. Preserve existing stored `churchTax` data for compatibility; do not delete or reinterpret old saved fields.
- Remove copy claiming that marital status, state, or church-tax selection currently changes the calculation. Add one concise explanation at the relevant section: this surface does not calculate a complete joint household tax assessment or church tax. Avoid overwhelming users with implementation details.
- Remove unused page-local state, constants, prop plumbing, reset code, and misleading storage disclosures. Preserve age, income, insurance, children, and the now-fixed compare persistence behavior.
- Update the active personal section, its aside, and its data-storage disclosure (`AngabenPersonSection.tsx`; `AngabenPage.tsx:553–555,590–598`). The legacy `ProfileInputs` is unused and needs no cleanup in this change. Preserve the separate wired combine-household controls; this fix targets unsupported claims in the personal-information form.

### Acceptance and regression tests

- Tax class changes flow through the existing profile store in compare and combine modes, survive navigation/reload/share URL round-trips, and produce a meaningful salary/funding change for a suitable synthetic fixture after saving and navigating to the calculation. Profile edits do not currently re-synchronize compare contributions in the same render; test the actual save/navigation boundary.
- Selecting a tax class does not silently change retirement filing status or create a partner.
- There are no interactive controls on this surface that claim unsupported marital/state/church-tax effects.
- Existing saved church-tax values still load without wiping state. Leave both schema fields and their defaults intact; this UI change requires no storage migration.
- Existing tax oracle goldens remain unchanged. Run `npm run verify` and browser-test both modes.

### Follow-on feature: real household and regional tax support

This is a separate product/calculation feature, not a quick wiring patch. Before implementing it:

1. Decide explicitly whether compare mode remains an individual illustration or supports complete households, and whether users enter marital status, legal tax-assessment choice, or both. Capture partner income and retirement-income components when joint taxation is chosen; distinguish unknown from zero.
2. Persist the supported model through the single validation/migration pipeline, defaults, share URLs, scenario library, workspace baseline/what-if projections, and exports. Extend `PersonalProfile` / scenario household types only after agreeing ownership; do not overload `Workspace.partner` or inferred presence as assessment consent.
3. Define church-tax coverage in salary, retirement, and capital-gains channels, including regional treatment and any supported special cases. Verify current official primary sources before implementing statutory rules; store statutory constants only in `src/rules/`.
4. Extend existing salary/tax and `calculateRetirementTax` / `calculateMonthlyRetirementPayout` pipelines; route combine and recommender through the shared context. Do not duplicate tax formulas in the UI or product simulators.
5. Establish independent oracle fixtures for individual vs joint assessment, partner income effects, supported regional church-tax cases, and reload/share/export consistency. Publish only the supported scope in UI copy.

Decision for the owner: the recommended first release restores truthful, functional inputs quickly; full household/church-tax support needs its own scoped design and validation before release.

## 2. Eliminate the conflicting bAV gross input in compare mode

### Confirmed problem

`AngabenEinkommenSection.tsx` directly edits `bav.monthlyGrossConversion`. Compare mode's authoritative amount is `equalInputAmountEUR` / the contribution-input anchor, and `harmonizeOnLoad` / `syncMonthlyContributions` recompute gross from that amount. Browser reproduction with net €500: gross shows about €741, the user enters €500 gross, opens the comparison, then returns to approximately €741.

### Recommended behavior

- In compare mode, present bAV gross as a formatted, calculated amount with a short explanation that it is derived from the shared net contribution. Link or point to “Netto-Beitrag” as the place to change the monthly comparison budget. Prefer a read-only metric, not a disabled control that looks editable.
- In combine mode, hide the bAV gross field from the first-step income section. Keep genuine per-contract editing in step 2 and `/vertrag/:instanceId`. This resolves the current singleton projection silently editing the first active contract (or dropping edits when none exists); do not replace it with an ambiguous proxy.
- Make mode/ownership explicit in the section's props. Use the existing contribution synchronization for compare inputs and the existing per-instance workspace mutation for combine. Do not change financial formulas, fair-comparison equality, or storage layout.
- The source audit found this is the only direct compare-mode gross write. `BavInputs` already routes its net field through `onSyncMonthlyContribution`; `BavInstanceInputs` is the legitimate per-contract writer. Keep those paths intact. The PR should explicitly name the fair-comparison invariant it preserves.

### Separate hardening item discovered during review

Scenario-library loading does not harmonize contributions until dashboard mount. A historical scenario can temporarily contain inconsistent gross/net values. Track this separately: reproduce loading a pre-fix inconsistent scenario, route restoration through the canonical contribution synchronization if needed, and verify net and pinned AVD-own anchors survive. Do not add a storage migration or bundle this into the display-only fix without evidence of the user-visible path.

### Alternative if gross-led comparisons are required

Introduce an explicit gross input mode, with a durable anchor and well-defined behavior when income, employer subsidy, or product choices change. Converting gross to net once and leaving net authoritative does not guarantee the original gross stays fixed. This requires a deliberate domain design similar to the existing AVD-own contribution mode; do not sneak it into this UI fix.

### Acceptance and tests

- Compare mode has one authoritative editable budget; €200 and €500 produce matching displayed derived gross and simulated funding after save/navigation/refresh. If the gross metric is shown while salary or tax class is being edited, derive it with the existing synchronization helper for those current inputs rather than displaying a stale saved gross value; do not introduce a second funding formula.
- Editing net releases pinned AVD-own mode through the existing setter, without bypassing synchronization.
- Combine mode: zero, one, and multiple active bAV contracts never expose a gross edit in step 1; a named contract edit in its contract surface survives reload without touching other contracts.
- Currency display uses shared formatters; no engine rounding. Run regression tests at the page/state seam, then `npm run verify` and both-mode browser checks.

## 3. Show honest provenance for statutory pension figures

### Confirmed problem

Both compare and combine branches of `ProdukteEingabenPanel.tsx` unconditionally say values were imported from a DRV statement, set status “übernommen”, and offer disabled “PDF erneut hochladen”. No upload exists. `buildGrvFieldsCompare` and `buildGrvFieldsCombine` also label the current browser month as “Stand”, which can look like a document date.

### Recommended behavior

- For the current model, default to clearly labelled model estimates / current inputs. Never claim a document was imported or verified.
- `manualMonthlyGross !== null` can support a “Manuell eingegeben” input-mode label, including an explicit zero. It cannot prove the user read a document; do not call it “lt. Beleg” or “Bestätigt”. Keep projected values labelled as estimates even when their starting values were entered manually.
- Remove the disabled re-upload action and its upload hint. Reuse the existing manual-edit disclosure and GRV input panel. In combine mode, preserve the existing `canOverrideGrv` gate (`onPatchBaseline` and `statutoryPensionResult`): do not expose an edit action where it cannot work.
- Rename ambiguous “Stand” to “Berechnungsstand” or a rule-year label. Do not invent a DRV statement date from the current browser date.
- Share the card copy/provenance decision and calculation-date label between compare and combine branches using a small helper. The GRV card currently has no `EvidenceState` to map; use honest static/input-mode copy without adding an evidence enum or inferring evidence from values. Label manual input “Manuell eingegeben” (including in the shared `GRVInputs` selector) and projected results “Schätzung”.
- The review verified that print/export contain no such import claims: no changes needed there. Preserve disclaimer placement and the legitimate step-2 checklist explaining where users can find their documents.

### Acceptance and tests

- A brand-new session contains no “übernommen”, “DRV-PDF”, or “erneut hochladen” claim on the GRV card.
- Explicit manual zero and positive manual values are represented honestly; estimated projection rows remain estimates.
- Compare and combine use the same provenance decision; the edit action still opens the functioning GRV fields.
- No upload/network/backend functionality is added. Existing stored profiles and numerical results remain unchanged.
- Update rendering tests that currently pin the misleading copy (`ProdukteEingabenPanel.test.tsx`, `DProduktRow.test.tsx`). Cover both branches, manual/estimated states, and unavailable combine editing; run `npm run verify` and browser checks at desktop and phone widths.

## Delivery sequence

Implement as separate reviewable changes in GLM’s recommended order: (1) honest statutory-pension provenance (plan 3, smallest change), (2) mode-correct bAV contribution surface (plan 2), (3) truthful personal-information controls and the new tax-class selector (plan 1). Each gets reproduction evidence and tests of user-visible behavior. No engine formulas or oracle goldens should change. These plans require no storage schema migration. Do not merge or deploy follow-ups as part of the €500 hotfix. The full household/church-tax feature remains a separate design decision.

The source review is not a legal audit. Its suggestions about exact tax-class help text and a possible cron delivery pipeline are not adopted as requirements; use neutral labels and the repository’s actual review workflow. The immediate UX choices are fixed above (remove unsupported controls, hide the combine proxy field, and drop the upload hint), so they need not block implementation on further preference questions.
