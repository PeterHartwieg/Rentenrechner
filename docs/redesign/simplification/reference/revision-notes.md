# Novice-review revision — 9 September 2026

Updated the interactive mockup using the independent Astra and Fable 5.1 reports in `independent-reviews/`. The reviewed version is preserved in `reviewed-v1/`.

## Changes

- No-document pension setup starts with approximate age at first work instead of unexplained contribution years. Optional pauses and direct contribution-year entry remain available. The summary identifies the resulting count as a rough estimate, not an official pension history.
- Unknown pension information still leaves the total open. Statement entry has optional help identifying the requested amount.
- Plain-language design-preview boundary replaces developer terms. Landing figures explicitly belong to an example; result screens carry an example label. No personal pension calculation is claimed.
- Unknown costs and assumed payout end ages stay visible in the plan. Contract details include brief contextual help; payout end age is also editable for the future-depot example.
- The plan explains when a component ends. The unrelated fixed-capital chart has been replaced with a per-source payout-duration view. Comparison cards explain finite versus lifelong payments beside the amounts.
- Contract and alternative removal support immediate undo. Saved alternatives are directly reachable from the plan, and their temporary lifetime is disclosed before saving.
- A reviewed alternative can be applied to the plan, with undo. Applying an old alternative after its underlying plan changes is blocked with a visible explanation. Saved snapshots remain readable.
- Profile and pension edits return directly to the plan. Product names and the comparison-budget label are consistent and simpler. A one-contract alternative no longer has a redundant selector.
- Wunschrente remains optional, with on-demand help using familiar monthly expenses as a starting point.

## Browser verification

Used computer interaction in the in-app browser against the assembled fragment, with both light and dark appearances. Inspected desktop width 1024, intermediate width 736, and phone widths 390, 360, and 320. No horizontal overflow in the inspected narrow comparison and incomplete-alternative views.

Exercised: onboarding with age 35, income 60000 and career start 22; optional two-year pause yielding an explicitly approximate eleven-year history; contract addition with unknown fees and payout age; before/after contribution change; saving/reopening/applying and undoing an alternative; removing/restoring contracts and alternatives; profile return navigation; payout-duration view; changing known fee/end-age values; blocking a stale saved alternative; incomplete totals in both before/after panels. JavaScript syntax checks passed for all three modules.

## Scope and limits

Mockup only. Numbers are freely chosen illustrative fixtures and simple visual responses, not outputs from the retirement engine. Inputs and saved alternatives last only until reload. No production application files, calculation logic, backend, or persistence were changed. The two prior reviews are AI novice-roleplay reviews, not a study with human users. The revised version has been interaction-checked by the implementing agent, not independently re-reviewed.
