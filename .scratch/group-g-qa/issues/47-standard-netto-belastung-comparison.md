---
title: "Make Netto-Belastung the only public comparison anchor"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Vergleich / comparison model
---

## What to build

Replace visible comparison modes with one public comparison model: every product is compared against the same user-selected monthly net out-of-pocket burden.

The default comparison amount is 200 EUR/month. bAV, Basisrente, Riester, AVD, and other tax/subsidy products should be back-solved so the user's bank-account burden is equal. The UI must no longer frame standard comparison as bAV-anchored or offer equal-gross-contribution mode.

## Acceptance criteria

- [ ] Standard comparison has one visible monthly `Netto-Belastung` input, defaulting to 200 EUR/month.
- [ ] Preset chips include at least 100, 200, and 400 EUR/month.
- [ ] ETF/pAV use the net amount directly where no tax/subsidy leverage applies.
- [ ] bAV, Basisrente, Riester, and AVD use existing funding/backsolve helpers so the true monthly user net burden matches the target where statutory caps allow.
- [ ] User-facing `Vergleichsmodus` copy, badge, radio group, and equal-gross-contribution controls are removed.
- [ ] Copy no longer says `bAV-Anker`, `Gleiche Netto-Belastung (bAV-Anker)`, or equivalent.
- [ ] Existing saved state that contains old compare sub-mode fields still loads without breaking.
- [ ] Tests cover that all visible products are sized from the same net monthly target, not from bAV's current contribution.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/app/syncContributions.ts`
- `src/app/useCalculatorState.ts`
- `src/features/inputs/InputsPanel.tsx`
- `src/data/defaultScenario.ts`
- `src/engine/equalInputComparator.ts` if now dead or internal-only
- tests around `syncContributions` and `simulate.integration`

Do not add a broker/expert fallback mode. The product decision is to remove equal gross contribution completely from public UI.

## Blocked by

None - can start immediately.
