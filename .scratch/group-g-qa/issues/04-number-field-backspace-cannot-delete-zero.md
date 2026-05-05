---
title: Backspace cannot delete a lone "0" in a NumberField
Status: done
Area: UI / NumberField
---

## Description

When a `NumberField` contains the value `0`, pressing Backspace does not clear it. The digit cannot be deleted, making it impossible to type a new value starting with a non-zero digit without first selecting all.

## Steps to reproduce

1. Focus any `NumberField` that shows `0`.
2. Press Backspace.
3. The `0` remains; the field does not go empty or transition to a blank state.

## Expected

Backspace deletes the `0`, leaving the field empty (or showing a placeholder), so the user can immediately type a replacement value.

## Notes

The issue is likely in the controlled input logic inside `src/ui/NumberField.tsx`. The component probably guards against an empty/NaN parse result and re-injects `0`, which fights the user's Backspace. Consider tracking raw string state internally and only committing to the engine value on blur or a valid parse.
