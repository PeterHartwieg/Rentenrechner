// @vitest-environment jsdom
//
// Route-level acceptance for the simplification split of `/` (Mein Plan) and
// `/vergleich` (the independent comparison). What these pin:
//
//   - `/vergleich` reads compare-mode singleton state and never writes the
//     combine workspace — not its mode, not its contracts.
//   - with products already selected (the default `visibleProducts`), the
//     journey lands on the result, not the setup step — setup is for an empty
//     selection or an explicit "Auswahl ändern".
//   - `/` renders the plan for a saved compare-only user, in its not-started
//     state, without opening the onboarding wizard.
//   - a `?s=` share link on `/` still renders the comparison, as before.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import App from './App'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import { buildStateJson, defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from './storage'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { buildShareUrl } from './utils/urlShare'
import type { Workspace } from './domain/workspace'

// The first render in this file pays the one-shot `React.lazy` chunk
// resolution for `Calculator`; the polls below allow 8s for it, which is above
// vitest's 5s default test timeout. Raise the timeout rather than shortening
// the poll — under full-suite load the wait is real, not a hung assertion.
vi.setConfig({ testTimeout: 20_000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

function readSavedWorkspace(): Workspace {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_V2) ?? '{}') as Workspace
}

function saveCombineWorkspace(): Workspace {
  let workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
  return workspace
}

describe('/vergleich — independent of the plan', () => {
  it('renders the comparison journey, landing on the result for a preselection', async () => {
    window.history.pushState(null, '', '/vergleich')
    render(<App />)
    await waitFor(() => expect(document.querySelector('.vergleich-journey')).not.toBeNull(), {
      timeout: 8000,
    })
    // `defaultAssumptions.visibleProducts` is non-empty, so the intended
    // landing is the comparison itself.
    expect(document.querySelectorAll('[data-testid^="vergleich-result-"]').length)
      .toBe(defaultAssumptions.visibleProducts.length)
    expect(document.querySelector('[data-testid="vergleich-setup"]')).toBeNull()
  })

  it('never rewrites the saved combine workspace', async () => {
    const saved = saveCombineWorkspace()
    const before = localStorage.getItem(STORAGE_KEY_V2)

    window.history.pushState(null, '', '/vergleich')
    render(<App />)
    await waitFor(() => expect(document.querySelector('.vergleich-journey')).not.toBeNull(), {
      timeout: 8000,
    })

    // Mode and contracts survive verbatim. `/vergleich` writes only
    // STORAGE_KEY_V1 (the compare singleton).
    const after = readSavedWorkspace()
    expect(after.mode).toBe('combine')
    expect(after.baseline.assumptions.bav).toHaveLength(saved.baseline.assumptions.bav.length)
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(before)
  })
})

describe('/ — the personal plan', () => {
  it('renders the plan (not the comparison) for a saved compare-only user', async () => {
    // Legacy v1-only save: `detectSavedMode()` reports 'compare'. Pre-2D this
    // opened the comparison at `/`; now `/` is always the plan and the
    // comparison lives at its own route.
    localStorage.setItem(STORAGE_KEY_V1, buildStateJson(defaultProfile, defaultAssumptions))

    render(<App />)
    await waitFor(() => expect(document.querySelector('.mein-plan-shell')).not.toBeNull(), {
      timeout: 8000,
    })
    expect(document.querySelector('.vergleich-shell')).toBeNull()
  })

  it('does not open the onboarding wizard by itself', async () => {
    localStorage.setItem(STORAGE_KEY_V1, buildStateJson(defaultProfile, defaultAssumptions))

    render(<App />)
    await waitFor(() => expect(document.querySelector('.mein-plan-shell')).not.toBeNull(), {
      timeout: 8000,
    })
    // A not-started plan must explain itself in place, never trap the user in
    // a modal they did not ask for.
    expect(document.querySelector('.inventory-body')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('still renders the comparison for a ?s= share link', async () => {
    const url = new URL(buildShareUrl(defaultProfile, defaultAssumptions), 'http://localhost')
    window.history.pushState(null, '', '/' + url.search)

    render(<App />)
    await waitFor(() => expect(document.querySelector('.vergleich-shell')).not.toBeNull(), {
      timeout: 8000,
    })
    expect(document.querySelector('.mein-plan-shell')).toBeNull()
  })
})
