---
title: Onboarding product checkboxes are not clickable
Status: done
Area: Group G / onboarding
---

## Description

In the onboarding menu, the checkboxes that let the user select a product cannot be clicked. The click target appears to be misaligned or intercepted by an overlapping element.

## Steps to reproduce

1. Open the onboarding / guided-setup flow.
2. Try clicking a product checkbox.

## Expected

Checkbox toggles and product is selected/deselected.

## Actual

Nothing happens; the click is swallowed or misses the checkbox.

## Notes

Check whether the checkbox `<label>` wraps the input correctly, and whether any absolutely-positioned sibling is sitting on top of the hit area.
