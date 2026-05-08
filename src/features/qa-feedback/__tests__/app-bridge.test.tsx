// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import App from '../../../App'
import { addInstanceToWorkspace } from '../../inventory/inventoryHelpers'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../../storage'
import type { Workspace } from '../../../domain/workspace'
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
  it('writes the live activeView into getQaWorkspaceContext on mount', async () => {
    // Seed a saved combine workspace so App's CalculatorRoute does not pause
    // on the LandingPage (the QA-context bridge lives in Calculator's
    // useEffect — it only fires once Calculator mounts past Suspense).
    let workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))

    render(<App />)
    await waitFor(
      () => expect(document.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0),
      { timeout: 8000 },
    )

    const ctx = getQaWorkspaceContext()
    expect(typeof ctx.activeView).toBe('string')
    expect(ctx.activeView).toBeTruthy()
  })
})
