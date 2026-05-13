// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { buildStateJson, STORAGE_KEY_V1 } from './storage'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

async function waitForCalculator(): Promise<void> {
  await waitFor(
    () => expect(document.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0),
    { timeout: 8000 },
  )
}

describe('App - Vergleich pane sidebar (#239)', () => {
  it('opens the Kapital pane from ?pane=kapital and isolates CapitalChart', async () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(defaultProfile, {
        ...defaultAssumptions,
        visibleProducts: ['bav', 'etf'],
      }),
    )
    window.history.pushState(null, '', '/?view=vergleich&pane=kapital')

    render(<App />)
    await waitForCalculator()

    const kapitalLeaf = await screen.findByRole('button', { name: /^Kapital$/ })
    expect(kapitalLeaf).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Monatliche Rente/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Break-Even/ })).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: /Verm.gen bis Rentenbeginn/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Monatliche Nettorente/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Break-Even|Auszahlungen/ }),
    ).not.toBeInTheDocument()
  })
})
