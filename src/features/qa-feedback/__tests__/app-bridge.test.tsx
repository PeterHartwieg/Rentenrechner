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
    // The legacy `.rw-dashboard-meta__title` chrome heading was removed —
    // each Sober D surface owns its own H1. Wait for the combine-mode
    // shell instead, which mounts as soon as the lazy `Calculator` chunk
    // resolves for the seeded combine workspace.
    await waitFor(
      () => expect(document.querySelector('.mein-plan-shell')).not.toBeNull(),
      { timeout: 8000 },
    )

    // Workspace-tabs collapse: Calculator stamps a stable `'vergleich'`
    // constant into the QA context (the live tab id is gone). Pin the
    // exact value so a regression to `''` / `'angebot'` / a stale tab id
    // would fail this assertion. The shell can paint before Calculator's
    // passive effect runs under a saturated parallel test worker, so wait on
    // the bridge itself rather than assuming the effect already flushed.
    await waitFor(() => {
      expect(getQaWorkspaceContext().activeView).toBe('vergleich')
    })
  })
})
