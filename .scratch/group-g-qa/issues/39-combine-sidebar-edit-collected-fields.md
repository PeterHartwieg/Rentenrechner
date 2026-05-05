---
title: "Mein Plan sidebar cannot edit fields collected during onboarding"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Group G / combine mode / inventory editing
---

## What to build

Bring the combine-mode dashboard sidebar to parity with the onboarding wizard for editable contract fields. After a user completes onboarding, every field they entered in the wizard should be visible and editable from `Meine Vertraege`.

The current sidebar exposes only a thin subset. ETF is the clearest failure: `EtfInstanceCard` shows no editable Sparrate or current value at all, so an ETF added from the dashboard is created with default values and cannot be configured meaningfully.

## Scope

At minimum, support editing the fields the wizard collects:

- Shared fields: label, `contractStartYear` where applicable, `currentValueEUR`, monthly contribution/conversion, status, provider/tariff name.
- bAV: `durchfuehrungsweg`, Effektivkosten/FeeModel, `payoutMode`, `rentenfaktor`, Beitragsdynamik.
- pAV: Effektivkosten/FeeModel, `payoutMode`, `rentenfaktor`, Beitragsdynamik.
- Basisrente: monthly contribution, Effektivkosten/FeeModel, `rentenfaktor`.
- AVD: monthly contribution, subtype, glidepath toggle.
- Riester: monthly contribution, `payoutMode`.
- ETF: monthly contribution, current depot value, provider/broker, TER/FeeModel, Beitragsdynamik.

## Acceptance criteria

- [ ] A user can edit an ETF's monthly contribution and current depot value after onboarding.
- [ ] A user can edit bAV current value, status, provider, Durchfuehrungsweg, payout mode, Rentenfaktor, and fees after onboarding.
- [ ] Equivalent wizard-collected fields are editable for pAV, Basisrente, AVD, and Riester.
- [ ] Edits patch `portfolioState.workspace.baseline.assumptions`, persist through reload, and recompute combine-mode results.
- [ ] Existing what-if stale/freeze behavior still marks what-ifs stale when the baseline is edited.
- [ ] Tests cover at least ETF monthly contribution/current value and one insurance-wrapper product-specific field.

## Red test

Run:

```bash
npx vitest run src/features/inventory/CombineDashboardSidebar.test.tsx
```

Relevant tests:

- `ETF instances expose Sparrate and current depot value fields`
- `bAV instances expose every onboarding-collected contract field after onboarding`

## Implementation notes

Prefer extracting shared field sets from the onboarding cards instead of duplicating a second version in `CombineDashboardSidebar.tsx`. If extraction is too large for one pass, keep the edits scoped but leave the component boundaries ready for reuse.

Use the display-layer formatting rules from `AGENTS.md`: numeric UI should go through existing numeric input patterns, and engine values should not be rounded before storage.

## Blocked by

None - can start immediately.
