---
title: Editing Einzelposten resets Fondskosten to 0 and mis-routes value to Mantelgebühr
Status: done
Area: UI / fee inputs
---

## Description

Observed with starting state: 1 % Effektivkosten (all-in).

1. User enters 0.3 % in the Fondskosten field.
2. The UI recalculates and shows: Mantelgebühr = 1.3 %, Fondskosten = 0 %.

This is the wrong direction: Fondskosten should go up to 0.3 %, and Mantelgebühr should go down to 0.7 % so that the all-in total stays at 1 %.

## Steps to reproduce

1. Set a product's fee to 1 % Effektivkosten.
2. Switch to Einzelposten mode (or edit the Fondskosten sub-field directly).
3. Type `0.3` in Fondskosten.
4. Observe the mis-split.

## Expected

When the user edits Fondskosten (fundAssetFee), the residual goes to Mantelgebühr (wrapperAssetFee) so that `wrapper + fund = total`. The just-edited field holds the user's value; the other field is the derived residual.

## Actual

The value appears to be written to the wrong field (Mantelgebühr receives the sum instead of the residual). Fondskosten is zeroed out.

## Notes

The split logic lives somewhere in `src/features/inputs/sections/FeeSection.tsx` (or equivalent). Verify which onChange handler maps to which `FeeModel` key and that the residual derivation subtracts rather than adds. Also confirm the Effektivkosten all-in toggle re-derives correctly after the split.
