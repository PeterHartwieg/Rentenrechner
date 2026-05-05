// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import App from '../../../App'
import { getQaWorkspaceContext } from '../context/workspaceContextRef'

/**
 * P2#1 review fix: App.tsx must call setQaWorkspaceContext on mount and
 * whenever workspace.activeView changes, otherwise reports show "—" for
 * the active view in real `?qa=1` use even though Lane D is wired.
 *
 * This test catches a regression of the App-side bridge specifically.
 * Lane D's tests already cover the ref → report path; this one covers
 * the App → ref path that the review note flagged.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

describe('App — wires QA workspace-context ref', () => {
  it('writes the live activeView into getQaWorkspaceContext on mount', () => {
    render(<App />)
    const ctx = getQaWorkspaceContext()
    // Default workspace boots into vergleich (compare-mode landing).
    expect(typeof ctx.activeView).toBe('string')
    expect(ctx.activeView).toBeTruthy()
  })
})
