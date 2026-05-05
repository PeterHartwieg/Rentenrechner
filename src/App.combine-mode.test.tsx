// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import App from './App'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import { defaultWorkspace, STORAGE_KEY_V2 } from './storage'
import type { Workspace } from './domain/workspace'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

function cloneWorkspace(workspace: Workspace): Workspace {
  return JSON.parse(JSON.stringify(workspace)) as Workspace
}

function saveCombineWorkspace() {
  let workspace = cloneWorkspace(defaultWorkspace)
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
  localStorage.setItem('rentenrechner-workspace-v1', 'angebot')
}

describe('App — Mein Plan combine-mode chrome and profile editing', () => {
  it('uses a Mein Plan heading instead of comparison copy in combine mode', () => {
    saveCombineWorkspace()
    const { container } = render(<App />)

    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('Mein Plan')
    expect(h1?.textContent).not.toContain('vergleichen')
  })

  it('uses plan-oriented tab labels in combine mode', () => {
    saveCombineWorkspace()
    const { container } = render(<App />)

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
      .map((tab) => tab.textContent ?? '')
    expect(tabs.some((tab) => /Meine Vertr.ge|Meine Vertraege/.test(tab))).toBe(true)
    expect(tabs.some((tab) => /Uebersicht|.bersicht/.test(tab))).toBe(true)
    expect(tabs).toContain('Details & Export')
    expect(tabs).not.toContain('Vergleich')
  })

  it('renders an editable personal-details section in combine mode', () => {
    saveCombineWorkspace()
    const { container } = render(<App />)

    const text = container.textContent ?? ''
    expect(/Pers.nliche Angaben|Persoenliche Angaben|Profil/.test(text)).toBe(true)
    expect(text).toContain('Bruttogehalt')
    expect(text).toContain('Renteneintrittsalter')
    expect(text).toContain('Krankenversicherung')
  })
})
