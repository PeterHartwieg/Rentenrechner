// @vitest-environment jsdom
//
// Route-level acceptance for `/alternativen` (simplification Phase 3
// plumbing). What these pin:
//
//   - `/alternativen` dispatches to the container from `App.tsx`.
//   - `?id=<whatIfId>` reaches the container and opens that alternative.
//   - an id that no longer resolves falls back to the list, never to a crash.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import App from '../../App'
import { resolveWhatIfParam } from './alternativenParams'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

const WHAT_IF_ID = 'whatif-1'

function saveWorkspaceWithWhatIf(): void {
  const workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  const whatIf: WhatIfScenario = {
    ...(JSON.parse(JSON.stringify(workspace.baseline)) as Workspace['baseline']),
    id: WHAT_IF_ID,
    label: 'Weniger einzahlen',
    origin: 'manual',
    derivedFromBaselineId: workspace.baseline.id,
    derivedFromBaselineSnapshot: JSON.parse(
      JSON.stringify(workspace.baseline),
    ) as Workspace['baseline'],
  }
  workspace.mode = 'combine'
  workspace.whatIfs = [whatIf]
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
}

describe('resolveWhatIfParam', () => {
  it('reads ?id= and tolerates an absent or empty value', () => {
    expect(resolveWhatIfParam('?id=whatif-1')).toBe('whatif-1')
    expect(resolveWhatIfParam('id=whatif-1')).toBe('whatif-1')
    expect(resolveWhatIfParam('?produkt=etf')).toBeNull()
    expect(resolveWhatIfParam('?id=')).toBeNull()
    expect(resolveWhatIfParam('')).toBeNull()
  })
})

describe('/alternativen — App dispatch', () => {
  it('renders the container', async () => {
    window.history.pushState(null, '', '/alternativen')
    render(<App />)
    await waitFor(
      () => expect(document.querySelector('[data-testid="alternativen"]')).not.toBeNull(),
      { timeout: 8000 },
    )
  })

  it('opens the alternative named by ?id=', async () => {
    saveWorkspaceWithWhatIf()
    window.history.pushState(null, '', `/alternativen?id=${WHAT_IF_ID}`)
    render(<App />)

    await waitFor(
      () => expect(document.querySelector('[data-testid="alternativen-open"]')).not.toBeNull(),
      { timeout: 8000 },
    )
    expect(document.querySelector('[data-testid="alternativen-open"]')?.textContent).toBe(
      'Weniger einzahlen',
    )
  })

  it('falls back to the list for an id the workspace no longer holds', async () => {
    saveWorkspaceWithWhatIf()
    window.history.pushState(null, '', '/alternativen?id=geloescht')
    render(<App />)

    await waitFor(
      () => expect(document.querySelector('[data-testid="alternativen"]')).not.toBeNull(),
      { timeout: 8000 },
    )
    // A stale bookmark is not a dead end: the list renders, no open detail.
    expect(document.querySelector('[data-testid="alternativen-open"]')).toBeNull()
  })
})
