---
title: "B7: Verify — Preview end-to-end + `npm run verify`"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / verification
---

## What to do

Final verification slice. Confirms B1–B6 land cleanly together and that
the no-backend / no-telemetry posture is preserved.

This is **not an implementation slice**. It's a verification gate; the
agent's deliverable is a short report (and any tiny follow-up fixes
that surface during verification, kept inline if low-risk and
mechanical).

## Acceptance criteria

- [ ] `npm run verify` is **green on `main`** after B6 has merged.
      Lint clean, all tests pass, build succeeds.
- [ ] Preview verification per the steps below. Use the `preview_*`
      tools per `CLAUDE.md`'s preview workflow. Capture
      `preview_screenshot` proof for at least the disclaimer step,
      overview step, and instance step on a representative workspace.
      Capture `preview_network` proof showing **zero** external
      requests originating from the new modal.

### Preview steps

1. `preview_start` (or `preview_eval window.location.reload()` if a
   server is already running).
2. Seed a workspace via `preview_eval` with three instances:
   - One bAV active with `wrapperAssetFee + fundAssetFee +
     pensionPayoutFeePct > 0.012` (e.g. `0.014`).
   - One Riester with at least one offer field marked
     `evidence === 'model_estimate'`.
   - One ETF active with no special flags.
3. Click the new `Optimiere deine Vorsorge` button on the dashboard.
   - Verify acknowledge step heading: `"Hinweis: Modellrechnung,
     keine Beratung"`.
   - Verify the `Verstanden, weiter` button is present and the
     `Abbrechen` button closes the modal.
   - Verify there is no shortcut around the acknowledge step.
4. Click `Verstanden, weiter`. Overview step renders.
   - Verify three rows in this order: bAV → Riester → ETF.
   - Verify bAV carries a `Hohe Kosten` chip.
   - Verify Riester carries an `Angebotsdaten fehlen` chip.
   - Verify ETF carries no flags.
   - Verify the persistent banner is rendered above the list.
5. Drill into the Riester (`Anpassen` CTA).
   - Verify decision cards include `Übertragen auf neues
     Altersvorsorgedepot` (the `create_new` virtual target).
   - Verify each card eventually renders a Δ Netto-Rente / Monat
     chip (loading skeleton ↔ numeric value).
6. Back to overview, drill into the bAV.
   - Verify the `Beitrag erhöhen` card is shown with a default
     value derived from `currentMonthly × 1.5`.
   - Type a value above the §3 Nr. 63 cap (e.g. `1000`).
   - Verify a `Über dem gesetzlichen Förderdeckel` (or equivalent
     `funding_cap_hit` template) chip appears on the card.
7. Tick at least two decisions across at least two contracts.
   - Click `Weiter`. Confirm step renders the ticked pairs with
     editable default scenario names.
   - Click `Pläne erstellen`.
   - Saved step renders the created what-if names.
8. Close the modal. Verify the workspace scenario list contains the
   N new what-ifs (one per ticked pair).
9. Re-open the modal.
   - Verify the acknowledge step renders again (regression test for
     "never persisted").
10. Cancel from any step on a fresh open. Verify
    `combineBasisResult.monthlyNetIncome` is unchanged from before
    the modal opened.
11. Run `preview_console_logs` and `preview_network`:
    - Console: zero new errors or warnings introduced by the modal.
    - Network: zero requests originating from the modal lifecycle.
- [ ] If verification surfaces a regression that is **mechanical and
      under 30 LOC** to fix (e.g. wrong atom id label, an off-by-one
      step transition, missed CSS class), fix inline and re-verify.
- [ ] If verification surfaces a structural defect (e.g. wrong save
      shape, broken cap-check on a product slot, disclaimer skippable
      under any state), open a follow-up issue under
      `.scratch/optimiere-vorsorge/issues/` and stop. Do **not** patch
      structural defects in this slice.
- [ ] After all verifications pass: flip
      `.scratch/group-g-qa/issues/59-optimiere-vorsorge-backlog.md`
      `Status:` to `done` with a short Resolution block summarising
      what shipped and pointing at this folder.

## Implementation notes

- Engine code remains React-free at the end of this batch. Confirm via
  `npm run lint` (the existing config already disallows React imports
  in `src/engine/`).
- Disclaimer-acknowledge state is **never** persisted. If a future
  agent ever proposes saving it to localStorage or sessionStorage, this
  is publication-blocking per `CLAUDE.md`. Add a regression test if
  one isn't already in B6 to pin the invariant for the long term.
- The `preview_screenshot` and `preview_network` artefacts are the
  evidence the user reviews; embed direct paths in the final report.

## Blocked by

B1 + B2 + B3 + B4 + B5 + B6 all merged to `main`.
