---
title: "Evidence promotion is overwritten when onboarding fields are edited"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Group G / onboarding / evidence
---

## What to build

Fix the InventoryWizard evidence update race so typing into an estimated field updates both the value and that field's `evidenceMap` entry in one durable state transition.

Today the InstanceCard handlers call `setEvidence(..., 'user_confirmed')` and then call `onChange({ ...draft, field: value })`. The wizard's `onChange` wrapper replaces the whole draft with that stale `draft` snapshot, so the promoted evidenceMap can be overwritten in the same React batch.

Affected examples:

- bAV / pAV / Basisrente `fees.wrapperAssetFee`
- bAV / pAV / Basisrente `rentenfaktor`
- non-ETF `contractStartYear`
- all products `currentValueEUR`
- ETF `annualAssetFee`

## Repro

1. Open the app.
2. Click `Mein Plan erstellen`.
3. Go to step 2 and check bAV.
4. Type `2.7` into `Effektivkosten p.a. (aus PIB/KID)`.
5. Observe that the numeric value changes but the `Schaetzung` badge remains.

Persisted state also lacks `bav[0].evidenceMap["fees.wrapperAssetFee"] = "user_confirmed"` after the edit.

## Acceptance criteria

- [ ] Editing each badge-backed field changes the badge from `Schaetzung` to confirmed immediately.
- [ ] Completing the wizard after editing bAV Effektivkosten persists `evidenceMap["fees.wrapperAssetFee"] = "user_confirmed"` on the saved instance.
- [ ] The fix covers `contractStartYear`, `currentValueEUR`, `fees.wrapperAssetFee`, `rentenfaktor`, and ETF `annualAssetFee`.
- [ ] The existing `Wert ist okay` confirm button still promotes evidence without changing the numeric value.
- [ ] A regression test exercises the real InventoryWizard parent wrapper, not only the custom InstanceCard harness.

## Red test

Run:

```bash
npx vitest run src/features/inventory/InventoryWizard.regression.test.tsx
```

Relevant tests:

- `promotes bAV Effektivkosten evidence when the user edits the field`
- `persists confirmed bAV fee evidence when completing after an edit`

## Implementation notes

Good fixes include either:

- merge `next.evidenceMap` with the freshest previous `evidenceMap` in every wizard `onChange` wrapper, or
- have field handlers send a single object containing both the new value and the promoted `evidenceMap` entry.

Avoid a shallow replacement like `a[i] = next` when `next` was built from a render-time draft snapshot.

## Blocked by

None - can start immediately.
