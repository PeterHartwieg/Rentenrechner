# UI package props

These components are presentational. They do not fetch, persist, navigate routes directly, run simulations, or mutate the workspace. Hosts own the state and callbacks. Named exports are defined in the corresponding component files.

## UnknownNumberField

`UnknownNumberFieldProps`: `label: string`, `value: number | null`, `status: InputStatus`, `onChange(next: number | null, status: 'entered' | 'unknown'): void`; optional `decimals`, `step` (default 1), `min`, `max`, `unit: string`, `disabled: boolean`.

Checking “Weiß ich nicht” emits `(null, 'unknown')`. **The host retains its previous numeric value and passes it back with status unknown.** The field hides that value; unchecking emits `(value, 'entered')`. Typing, including explicit zero, emits an entered value and clears unknown through the host's controlled update. Clearing emits `(null, 'entered')`, never zero. The host must validate empty entered values before saving. The field stays enabled while unknown so typing can replace it.

The native number input follows NumberField's bounded display precision and preserves unrounded edits. A separate primitive is necessary because NumberField accepts only numbers, cannot display controlled null, and does not expose input IDs/descriptions. Bounds are native constraints with a visible accessible range hint, not silent clamping. Each input and checkbox has a unique React ID; descriptions include provenance and any range hint. Numeric content retains the QA-sensitive marker.

## PlanOverview

`PlanOverviewProps`:

- `summary: PlanSummary | null`, `retirementAge: number`, `hasStarted: boolean`, `hasContracts: boolean`, `savedAlternativeCount: number`.
- `moneyBasis: 'real' | 'nominal'`; `onToggleMoneyBasis(): void`. The host updates the basis. Toggle is inside “Angaben & Annahmen prüfen”; pressed means nominal. The component selects the supplied total and row values without calculating them.
- `targetMonthly?: number` controls the optional target edit label even when no gap is available. `summary.gap` supplies the target aside. Per lead decisions, **the target comparison stays in explicitly labelled today's euros**, including when the income display is nominal. It uses `gap.targetMonthly` and `gap.gapReal`, with no conversion or gap arithmetic in this component.
- `assumptions: { age: number; grossSalaryYear: number; retirementAge: number; pensionMethodLabel: string; inflationRate: number }`; inflation is a ratio for `formatPercent`.
- Optional `notification: { message: string; onUndo?: () => void }`, rendered with `role="status"`.
- Required no-argument callbacks: `onStart`, `onAddContract`, `onTryAlternative`, `onOpenSavedAlternatives`, `onEditProfile`, `onEditPension`, `onEditTarget`, `onOpenDuration`, `onOpenKapital`, `onOpenMethode`, `onOpenEingaben`.
- `onEditSource(row: PlanSourceRow): void` receives the original row, including its instance/target metadata. `onNavigateReason(reason: ReadinessReason): void` receives the original blocking reason and its route/anchor metadata.
- Optional `children: ReactNode` are rendered inside an initially closed “Weitere Auswertungen” disclosure.

Readiness gates the total and gap. Incomplete results show “Noch offen” and blocking reasons as buttons; simulation errors get distinct copy. `summary: null` after starting shows an open result without fabricated amounts. Source rows remain editable. The delivered row type has no independent readiness flag, so **all row amounts are suppressed when the total is blocked**; unknown rows are always suppressed. The view never displays an independently taxed source amount as a safe household share. The parent should supply a summary with blocking reasons as soon as available.

## PlanDurationSummary

`PlanDurationSummaryProps`: `rows: readonly PlanSourceRow[]`, `onEditSharedHorizon(): void`, `onOpenKapital(): void`.

Lists all supplied sources, duration and consequence. Shared-horizon rows supply the affected-source labels; only those rows appear in the shared-duration notice. The host opens the real shared horizon editor and capital view. The duration view owns an H1 and is intended as a separate view, not a nested section beneath the overview H1.

`PlanDurationText({ duration: DurationDescriptor })` is also exported for reuse by overview rows. It renders the four delivered descriptor kinds exhaustively. No duration, product identity, end age, or years are inferred or calculated in the UI.

## Styling boundary

`UnknownNumberField.css` and `PlanOverview.css` use existing `--rw-*` colors/fonts for light and dark themes. The overview and duration view share the latter stylesheet. Small screens stack source amounts and actions; controls have visible focus and minimum 44px action height.

`ProductEditCards.css` adds `.pec-prov--unknown`. The delivered `ProvLabel` still has boolean-only props and cannot select unknown directly; its API is outside this package's allowed files. Consumers that already render the class gain its styling. Print's existing `.pr-confidence-default` is the actual unknown fallback from `printReportRows.ts`; only that class was restyled with a neutral dashed outline. This also affects other default print pills, while their text continues to distinguish “Keine Angabe” from “Unbekannt”.

## Verification

- Requested `src/ui` + `src/features/mein-plan` Vitest scope: 231 tests across 14 files pass (18 new tests).
- The normal CLI is blocked by the sandbox at Cloudflare's inspector port `9229` (`listen EPERM`). The successful run uses `startVitest` with an in-memory config, `pool: 'forks'`, the existing setup file, React plugin and build-date define; the Cloudflare development plugin is omitted. No configuration file was changed.
- `npx tsc --noEmit` and ESLint on all six new TSX files pass.
- Additional `npx tsc --noEmit -p tsconfig.app.json` reports only six existing concurrent-work errors in `src/features/inventory/onboardingDraft.test.ts` (lines 196, 208, 214, 237, 261, 270: `method: string` versus `PensionDraft`'s literal union). That file is outside this package and was not edited.
- No browser layout or screenshot validation was performed. Responsive sizing and focus treatments are implemented in CSS; host integration is a separate package.

## Package 2C — comparison journey (Astra, 2026-09-09)

Implemented only under `src/features/vergleich/`; this section is appended to the shared handoff file.

- `VergleichJourneyControls` now additionally passes `profile: PersonalProfile` and `setProfile: Dispatch<SetStateAction<PersonalProfile>>`. The existing selection, budget, seeding, simulation and export handlers remain intact. No scenario/readiness pass-through was needed: the result page already receives the effective scenario and its setter.
- `VergleichJourneyView` takes `controls`, registry-derived `productIds`, `onToggleProduct(id)` and `renderResult(onEditSetup)`. It owns only local setup/result navigation and heading focus. Initial empty selection opens setup; existing selections open results. Submitting no products deliberately opens the empty result. Setup uses NumberField and the existing profile QA IDs, explicit plan seeding, and real checkbox/fieldset semantics.
- `VergleichPage` adds optional `onEditSetup(): void`. Its existing callers remain compatible. Supplied and fallback simulation results are filtered by both selected products and the effective scenario. The existing net-descending table ordering is retained. Cards never produce a total. Scenario chips, the comparison table and pro/contra grid are secondary native disclosures; detail links and export callbacks retain their behavior.
- `VergleichResultCard` receives `row`, `profile`, `assumptions`, `ownMoneyMonthly`, `effectiveNetCost`, `scenarioId`. Amounts are **nominal**, matching `vergleichRows` and the existing table, and explicitly labelled accordingly. Assumptions disclose the real fee fields, budget and bAV funding anchor, payout mode, scenario and profile. Product identities and assumption keys come from PRODUCT_REGISTRY. Neutral taglines avoid promising lifelong payments for every private-insurance mode.
- Durations call `durationOfInstance` with the registry-selected compare assumptions. Its parameter currently requires an `AnyWorkspaceInstance` envelope although the implementation reads only payout fields; a documented local type assertion bridges the existing compare shape without creating or persisting a fake instance. All four duration kinds and their consequence lines are covered by RTL.
- Styling uses existing theme tokens, visible keyboard focus and single-column cards/choices at <=650px. No browser screenshot/layout measurement was performed; existing phone/tablet/desktop component tests pass.

Verification: `npx tsc --noEmit` passes. The requested Vitest prefix passes **150 tests / 11 files** (the prefix also matches `vergleich-detail`): normal CLI hit the sandbox's Cloudflare inspector-port EPERM, so the successful run used `startVitest` with config:false, pool:'forks', the existing setup file, React plugin and build-date define. Comparison ESLint passes. The additional substantive `npx tsc --noEmit -p tsconfig.app.json` has no comparison-file errors; concurrent InventoryWizard interface integration errors outside this package remain.

### 2C integration issues for the state/routing owner

1. **Explicit seed is undermined on ordinary reload by the existing loader.** `useCalculatorState` calls `loadSavedState`, which prefers a valid V2 combine workspace over V1 comparison data. With both saved, `/vergleich` already receives the plan profile/selection before clicking the seed button. The UI shows the actual currently used values. The seed integration test uses a share URL to supply independent comparison state, verifies the explicit copy and confirms V2 remains unchanged. Fixing the normal load requires a compare-specific read path outside this UI package; no container handler was changed here.
2. **Print host is absent on the new route.** The container calls `window.print()` but mounts no `PrintReport`; existing chrome print CSS hides `.rw-dashboard-body`. A selected-scope print mirror needs routing/container-owner integration. The toolbar's callback behavior is preserved and tested; this package does not claim a validated printable report.
3. **Readiness contract is household-only today.** `selectResultReadiness` takes a Workspace and combine simulation. This comparison never constructs a fake workspace or treats household readiness as per-product readiness. Results retain the mandated estimate label and disclose actual assumptions; a future compare-specific incomplete-result contract should be supplied by the state owner.

2C file inventory: `VergleichJourneyPage.tsx` (JSX + profile pass-through only), new `VergleichJourneyView.tsx`, `VergleichPage.tsx`, new `VergleichResultCard.tsx`, `VergleichPage.css`, `productTaglines.ts`, updated `VergleichPage.test.tsx`, new `VergleichJourneyPage.test.tsx`, new `VergleichResultCard.test.tsx`, and this append-only handoff. Existing table, strip, pro/contra components and `vergleichRows.ts` are reused unchanged. Nothing committed.


## Package 2D — mounted plan overview (Astra, 2026-09-09)

`MeinPlanPage` now selects `PlanOverview` whenever `summary` is supplied; the
optional separate `readiness` overrides the summary's readiness. Callers without
`summary` retain the legacy layout. The existing `workspace` prop supplies the
baseline profile/assumptions, retirement age, target, and `whatIfs.length`;
`summary.rows` supplies contract presence. `hasStarted` is `!planNotStarted`.
The receipt rail is absent from the overview; its basic information lives in
“Angaben & Annahmen prüfen”. No QA target IDs were removed (the old page had none).

The host owns `moneyBasis` (initially `real`), duration-view state and the compact
inline target draft. `MeinPlanPageProps.onSetTarget?(value: number | undefined)`
is the only added Calculator prop: its JSX callback calls `patchBaseline` with
the current baseline profile and `desiredNetMonthlyPension: value`. No other
Calculator logic was changed by this package. Removing the target writes
`undefined`; explicit zero writes `0`; opening/cancelling the editor writes
nothing. Blank/negative drafts cannot be submitted. Storage errors remain in
Calculator's existing banner.

`PlanOverviewProps` adds optional `targetEditor: ReactNode`, `analysisOpen: boolean`
and `onAnalysisToggle(open: boolean): void`. The target slot follows personal
editing actions. The latter two control “Weitere Auswertungen”; direct
`#mein-plan-sensitivitaet` loads and later hash navigation open it. Sensitivity
uses the existing selectors and is calculated only while opened and readiness
permits results. Its figures explicitly say nominal. Legacy sensitivity rendering
shares the same section component. `PlanDurationSummary` is mounted as a separate
view with “← Zurück zum Plan”; money basis survives returning. Shared-horizon
editing goes to `/eingaben#renteneintritt`, the verified AngabenPage section ID.
All source/profile/pension/reason and capital/method/input callbacks are wired.

Open integration items:

- Alternative actions temporarily navigate to `/eingaben/produkte`, with the
  requested `TODO(phase3): ROUTES.alternativen` comment.
- CSS reduces the phone bar to four tabs and gives Mein Plan/Vergleich more space.
  Angaben and Methode already exist in MobileSheet and are hidden in the bar.
  Start and Artikel remain in the bar because MobileSheet has no corresponding
  entries. Completing the two-tab shell requires markup changes outside this
  package's allowed files.
- Calculator's scenario toolbar and “Beiträge anpassen” CTA still surround the
  overview. Moving these into optional depth requires edits outside the allowed
  `<MeinPlanPage />` props block.

Verification: `npx tsc --noEmit` and focused ESLint pass. The requested Plan and
Calculator test prefixes pass 64 tests in 6 files via in-memory `startVitest`,
`pool: 'forks'`, existing setup, React/MDX plugins and build-date define. The normal
CLI is blocked at the Cloudflare inspector port (`9229`, `listen EPERM`). The
additional application type-check (`npx tsc --noEmit -p tsconfig.app.json`) reports
five concurrent InventoryWizard call sites in QA modal-coverage tests missing
`scenario`/`mode`; those files are outside this package. No commit was created.

## Package 2B — contract picker and editor (Astra, 2026-09-09)

Delivered the two route bodies without changing their draft, persistence or navigation handlers.
Only the allowed 2B files were edited. Nothing committed.

### Presentational contracts

- `vorsorge/ContractPicker.tsx`: takes the delivered `ContractPickerProps` plus
  `retirementEndAge: number` (read-only pass-through from the container workspace in JSX).
  Uses the supplied registry metadata order/labels. A selected product mounts `ContractEditor`;
  other-product navigation calls `navigate(ROUTES.vorsorgeNeu)`. AVD's hint comes directly from
  `productAvailabilityCopy.altersvorsorgedepot`, not a new market-availability assertion.
- `vertrag-detail/ContractEditor.tsx`: takes `draft`, visible `fieldSpecs`, `patchField`,
  `setFieldUnknown`, `errors`, `save(): boolean`, `mode: 'new' | 'edit'`, `productLabel`,
  `retirementEndAge`, `cancel`, `back`, `onEditSharedHorizon`, `onOpenFurtherInputs`, optional
  `remove(): void`, optional `productHint`. Owns only submit-attempt/focus state. The native
  details element preserves the hook's draft on collapse; conditional fields follow the specs.
- `ContractEditorField.tsx`: takes `draft`, `spec`, `patchField`, `setFieldUnknown`, optional
  field `error`. Unknown-capable numeric inputs reuse `UnknownNumberField`, including the
  remembered previous value for unchecking unknown. Pending core values remain blank and
  required. A cleared numeric value uses invalid `NaN` in the local draft; validation rejects
  it before persistence. No engine value is rounded or clipped. Ratios display as percentages.
  The scoped adapter extends the primitive's rendered input/checkbox descriptions and required
  flag, since its props do not expose these; shared source files remain unchanged.
- `ContractEditorHost.tsx`: receives the delivered `ContractEditorHostProps`. Handles the
  existing missing-instance state and holds the returned removal handle/label in local state.
  It stays mounted when removing makes `instance` null, so `Rückgängig` can restore the contract.
  The route component keys it by URL instance ID. H1 uses the product registry label.

### Field and component compatibility

All visible specs have controls, labels, units, status and error descriptions. Insurance's
conditional old-contract flag stays beside its minimum classification question. bAV statutory
pass-through, fixed employer contribution and percentage match remain distinct. Eligibility is
on the minimum screen only where the delivered spec declares `section: 'minimum'`. AVD's
certified payout-plan end age remains local; ETF and capital-consumption modes link to the
shared horizon via `/eingaben`. Further product details retain the `/eingaben/produkte` link.

The existing `FeeSection`, `PayoutModeSection` and `BeitragsdynamikField` were read but cannot
map 1:1 to this draft contract: their bounds differ from the specs, the payout primitive lacks
unknown/document status, the growth primitive clamps, and FeeSection requires an unavailable
computed RIY plus bulk fee writes without per-field status/error slots. Consequently the UI
renders the exact spec fields rather than supplying a fabricated RIY or changing neighbouring
field provenance. All seven fee entries remain available; ETF has only its real TER field.
Fee specs do not support explicit unknown, so untouched fees stay visibly `Angenommen` and
show their actual provisional numbers. No unsupported unknown fee toggle was added.

Numeric values can be explicitly marked `lt. Beleg` or returned to `Angenommen`. `ProvLabel`
is reused for entered values; its boolean-only API cannot represent the required exact
unknown/assumed/document vocabulary, so the other states use explicit text. Opening or
collapsing details never confirms a value.

### Integration issues for the state/routing owner

1. **Removal undo cannot travel through navigation.** `navigate` accepts only route/search;
   `remove` returns a handle but does not navigate, and the plan owns a separate portfolio hook.
   Per the permitted fallback, removal stays on this page with `role="status"`, the original
   label, `Rückgängig`, and a return-to-plan button. The real-container test verifies removal
   from storage and exact instance restoration. Leaving this page loses its in-memory handle;
   route-wide status ownership remains an integration task.
2. **Back to picker does not reset a new ETF draft.** The container uses ETF as the unselected
   placeholder product; the hook reseeds only on product/instance identity changes. Thus ETF →
   other-product picker → ETF can retain the unsaved draft. The UI's own disclosure/validation
   state remounts, but resetting the hook requires a container `reset` callback or seed key.
   No state logic was changed outside the authorized JSX replacement. Cancel to plan unmounts
   and discards normally.
3. **Broader app typecheck has five concurrent errors**, all in
   `src/features/qa-feedback/__tests__/modal-coverage.test.tsx` (missing InventoryWizard
   `scenario` and `mode`, at lines 530/541/552/584/608 at verification time). No 2B type errors.

### Verification and files

- `npx tsc --noEmit`: passes. Additional app-project typecheck has only the external errors above.
- `npx vitest run src/features/vorsorge src/features/vertrag-detail`: ordinary CLI hits sandbox
  `listen EPERM` on Cloudflare inspector port 9229. The equivalent in-memory `startVitest`
  run with `config:false`, `pool:'forks'`, React plugin, existing setup file and build-date define
  passes **26 tests / 3 files**, including 15 new tests. No config files changed.
- Targeted ESLint on the new picker/editor TSX and tests: passes.
- Covered: registry ordering/selection, direct product route, real add/save with entered zero
  versus omitted unknown capital, neighbour preservation, unknown restoration, cleared input
  rejection, required pending fields, focusable summary and automatic error disclosure,
  persistent collapse/expand values, percentage-to-ratio save, document provenance, cancel
  discard, bAV classification and hint associations, insurance/Basisrente/AVD payout visibility,
  real-container removal and undo.
- CSS uses existing light/dark `--rw-*` tokens, visible focus, minimum 44px actions, bounded
  widths and one column at <=650px. Browser screenshot/320px overflow measurements were not run.

Files: new `vorsorge/ContractPicker.tsx`, `ContractPicker.css`, `ContractPicker.test.tsx`;
`VorsorgeNeuPage.tsx` import + JSX mount only; new `vertrag-detail/ContractEditor.tsx`,
`ContractEditorField.tsx`, `ContractEditorHost.tsx`, `ContractEditor.css`, `ContractEditor.test.tsx`;
`VertragBearbeitenPage.tsx` import + JSX mount only; this append-only handoff.

## Shell polish — plan depth and phone navigation (Astra, 2026-09-09)

Resolved the two shell integration items from the 2D handoff. In Calculator's
combine composition, `MeinPlanPage` is now first. Three initially closed native
`details` follow: “Annahmen & Risiko” contains the existing ScenarioToolbar,
AssumptionsPanel and CalculationWarnings; “Empfehlung: Wo geht mein nächster Euro
hin?” contains the existing Beiträge-anpassen modal trigger; “Details & Export”
contains CombineDetailView and its existing CSV/print actions. Children stay
mounted while hidden, preserving their state and QA target registrations. The
`#details` section and its feedback props remain. The modal mounting and all
handlers, compare/share branch, wizard and PrintReport mounting are unchanged.
PrintReport remains outside every disclosure, with its disclaimer first.

MobileNav now renders exactly “Mein Plan” (`/`) and “Vergleich” (`/vergleich`).
MobileSheet contains Start (`/?view=landing`), Angaben, Artikel and Methode,
followed by its existing legal/external destinations. The former “Annahmen” menu
label is “Angaben”, retaining `/eingaben`. MobileSheet additionally accepts
optional `appView` and a navigator with optional `search`; AppHeader passes the
view through. Its active state uses the existing chrome route resolver for the
four navigation items, including article/input descendants and the landing
query override; legal items retain route matching. Escape, native button
activation and backdrop dismissal are preserved. Desktop/tablet retain all six
destinations, placing Plan and Vergleich first with stronger type/background.

CSS review: at 320px the phone header has 32px total horizontal padding, a
shrinkable/wrapping brand and a non-shrinking 44px menu button. The fixed bottom
bar has border-box sizing, two equal flexible columns with min-width zero and
wrapping text. Menu items use border-box sizing at 100% width. Header links,
phone tabs, menu buttons, disclosure summaries and plan export actions have
minimum 44px heights. Desktop/tablet navigation wraps. The secondary plan gutters
match the overview (40px, or 16px below 640px); the recommender CTA no longer
inherits the old outer page padding or a 240px phone-column flex basis. This was
a CSS inspection, not a browser measurement or screenshot verification.

Verification: `npx tsc --noEmit` passes. The requested chrome + Calculator +
mein-plan scope passes **191 tests / 10 files**, including the existing
Calculator CSV test. The new Calculator composition test checks the overview
comes first, all three disclosures start closed, their content is mounted and
hidden, opening reveals controls, printing invokes the existing handler, and
the print report stays mounted outside details with its disclaimer first.
Chrome tests cover exactly two tabs, all relocated menu destinations, primary
styling, current-page states, landing query handling and Escape/backdrop close.
The normal Vitest CLI hit Cloudflare inspector `listen EPERM` on port 9229; the
successful run used in-memory `startVitest`, config:false, pool:'forks', two
workers, existing setup, React/MDX/GFM plugins and build-date define. Focused
ESLint and diff whitespace checks pass. No repository test config was changed.

Open issues / limits:

- **Plan share link requires the state owner.** There was no Link action in the
  combine surface on entry. The available `useDerivedViews.handleCopyLink`
  serializes singleton comparison profile/assumptions using `buildShareUrl` and
  changes the current URL to that comparison share. It does not encode the V2
  plan. CSV and PDF remain reachable under Details & Export; no misleading plan
  Link action was added. The existing compare/share handler and buttons remain
  unchanged. A plan-specific link needs a real workspace sharing contract before
  the UI can expose it. This was raised as an optional clarification; absent a
  different preference, existing CSV/print functionality is retained.
- The extra `npx tsc --noEmit -p tsconfig.app.json` still reports five errors in
  `src/features/qa-feedback/__tests__/modal-coverage.test.tsx` (530, 541, 552, 584,
  608): old InventoryWizard calls lack `scenario` and `mode`. Those files are
  outside this package and were not edited.

Files edited in this package: `src/Calculator.tsx` (combine JSX only),
`src/Calculator.readiness-export.test.tsx`, `src/ui/chrome/AppHeader.tsx`,
`MobileNav.tsx`, `MobileSheet.tsx`, `chrome.css`, `chrome.test.tsx`, and this
append-only note. No changes to `src/features/mein-plan/**` in this package.
Nothing committed; concurrent edits were preserved.

## Package 3 — Alternativen UI (Astra, 2026-09-09)

`AlternativenPage` now renders `AlternativenSurface` using the existing
`AlternativenHostProps`. Its hook, route, workspace and simulation logic remain
unchanged; only the presentation import and placeholder return were replaced.
The surface implements the entry form, preview, saved detail and saved list on
`/alternativen`. The list is present even without contracts, so orphaned saved
alternatives remain reachable and removable.

All pension totals and the preview delta are supplied by the flow. Each side
independently observes its own `readiness.canShowHouseholdTotal` and formats
`netMonthlyTotalReal`; the UI performs no pension calculations. Saved details
use their frozen `before`/`after` plus the retirement age from the matching
what-if's `derivedFromBaselineSnapshot`, never today's baseline age. The saved
contract does not expose a delta, so saved details show the supplied pair
without inventing an arithmetic path in the UI.

Draft edits explicitly call `invalidatePreview`. The sole contract is selected
via the draft callback without writing plan metadata. Contribution entry uses
the existing `UnknownNumberField` (the journey map's nullable-number wrapper)
because the draft admits `null`: empty/unknown stays distinct from entered zero,
and display rounding stays in that existing field and `formatCurrency`.
bAV uses the supplied `contributionKind`; allowed decisions come from the host.
An instance with no allowed decisions has an explanatory message and disabled
preview action.

Save opens the new id and clears the draft preview, never applies it. Opening
an existing saved item also clears unrelated draft errors/preview. Direct
preview apply explicitly saves first inside an event-handler `flushSync`, then
calls `apply(id)`: `addWhatIf` uses a React state updater while `applyWhatIf`
reads the committed workspace ref. The flush makes that id available before
apply without changing either state owner. An integration test using the real
flow proves the contribution changes and undo restores it.

Stale items retain the frozen pair and cannot apply. Rebase success renders
"Änderung prüfen" with the updated supplied pair and focuses its heading; only
a subsequent explicit click applies the now-current item. Shape drift and
missing source render the hook's block reason. Apply/rebase refusals are
focussable alerts. Remove/apply notifications render immediately with
`role="status"` and the host's undo action; navigation is left to the return
button so the result stays visible.

`AlternativeComparison` shares the before/after presentation.
`alternativePresentation.ts` contains only German date/currency formatting and
the storage note. CSS follows PlanOverview's Sober D tokens, serif heading,
monospaced amounts, neutral rules and accent after-total. The columns collapse
at 650px; buttons wrap/stack, grid tracks have zero minimum widths, and page
padding is 16px on phones. The preview has a polite live region and receives
heading focus after calculation. Responsive/dark-mode checks here are CSS
inspection, not browser measurements or screenshots.

Verification: `npx tsc --noEmit` and the additional app-project typecheck pass;
focused ESLint passes. `src/features/alternativen` has **35 passing tests in
3 files**, including 18 new surface/integration tests covering all requested
states, independent readiness gates, draft invalidation/focus, save/open,
stale/rebase/review, apply refusal, remove/undo, list/date rendering, gross bAV
labels, unknown versus zero and real save-before-apply ordering. The regular
Vitest CLI is blocked by Cloudflare inspector `listen EPERM` on port 9229; the
successful in-memory run uses `startVitest`, `config:false`, `pool:'forks'`, two
workers, existing setup, React/MDX/GFM plugins and the build-date define.

Files: `src/features/alternativen/AlternativenPage.tsx`,
`AlternativenSurface.tsx`, `AlternativenSurface.css`,
`AlternativenSurface.test.tsx`, `AlternativeComparison.tsx`,
`alternativePresentation.ts`, plus this append-only note. No out-of-scope
files, state hooks or calculations were edited. No commits. No blocking issues
found in this package; browser layout verification remains unperformed.
