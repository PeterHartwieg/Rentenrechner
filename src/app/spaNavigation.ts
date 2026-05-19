// ---------------------------------------------------------------------------
// SPA-navigation click guards.
//
// Anchors that intercept their own onClick (so the in-app router can take
// over instead of triggering a full page load) must NOT swallow modified
// clicks — users expect Cmd/Ctrl/middle/Shift-click to open the target in a
// new tab or window. Without these guards, the router preventDefaults
// everything and the modifier-click UX silently breaks.
//
// `shouldUseSpaNavigation` returns true only for a plain primary-button
// click with no modifier keys and no prior `preventDefault()` upstream.
// Callers should `preventDefault()` + invoke `navigate(target)` only when
// it returns true; otherwise let the browser handle the click natively.
// ---------------------------------------------------------------------------

import type { MouseEvent } from 'react'

export function shouldUseSpaNavigation<T extends Element>(event: MouseEvent<T>): boolean {
  if (event.defaultPrevented) return false
  if (event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return true
}
