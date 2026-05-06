# Keyboard shortcut to toggle QA mode

Status: done
Type: enhancement
Priority: minor

## Parent

.scratch/qa-feedback-mode/PRD.md

## Problem

Activating QA mode currently requires navigating to `?qa=1` in the URL bar. This is awkward during QA sessions: the tester has to click the URL bar, append the parameter, hit Enter, and wait for the page to reload (or at least re-render). Deactivating requires removing the parameter or navigating to `?qa=0`.

A keyboard shortcut would make toggling instant without leaving the calculator UI.

## What to change

1. **`QaFeedbackProvider.tsx`** — Add a `keydown` listener for `Ctrl+Shift+Q` (or `Cmd+Shift+Q` on macOS) that toggles the `enabled` state. The listener should:
   - Be attached unconditionally (even when QA mode is off), so the shortcut can *activate* QA mode.
   - Write the new state to `sessionStorage` (same as the existing `?qa=1` path).
   - Not interfere with browser-native shortcuts (Ctrl+Shift+Q closes the browser on some platforms — if that's a conflict, use `Ctrl+Shift+F` or another safe combo).

2. **`QaModeIndicator.tsx`** — Show the shortcut hint in the indicator chip tooltip so testers discover it.

3. **Tests** — Add a test in `QaFeedbackProvider.test.tsx` that simulates the keyboard shortcut and asserts QA mode toggles on/off.

## Keyboard shortcut candidates

| Shortcut | Risk |
|----------|------|
| `Ctrl+Shift+Q` | Closes browser in some Linux WMs; may conflict on Chrome/Linux |
| `Ctrl+Shift+F` | "Find in page" variant on some browsers |
| `Ctrl+.` | Used by VS Code but safe in browser |
| `Ctrl+Shift+.` | Very low conflict risk |

Recommend `Ctrl+Shift+.` as the safest default. Can be documented in the QA mode indicator tooltip.

## Acceptance criteria

- [ ] Pressing the chosen shortcut toggles QA mode on and off.
- [ ] The shortcut works from any state (QA on or off, composer open or closed).
- [ ] When composer is open, the shortcut deactivates QA mode and closes the composer cleanly.
- [ ] The indicator chip tooltip shows the shortcut.
- [ ] No browser-native shortcut is shadowed on major platforms (Chrome, Firefox, Safari on Windows/macOS/Linux).
- [ ] Test coverage for the toggle behavior.

## Blocked by

Nothing — standalone change.
