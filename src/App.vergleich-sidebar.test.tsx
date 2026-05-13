// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { buildStateJson, STORAGE_KEY_V1 } from './storage'
import { ALL_VERGLEICH_PANES } from './features/results/vergleichPanes'

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

function seedState() {
  localStorage.setItem(
    STORAGE_KEY_V1,
    buildStateJson(defaultProfile, {
      ...defaultAssumptions,
      visibleProducts: ['bav', 'etf'],
    }),
  )
}

describe('App - Vergleich pane sidebar (#239)', () => {
  it('opens the Kapital pane from ?pane=kapital and isolates CapitalChart', async () => {
    seedState()
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

  it('defaults to the Überblick pane when no ?pane= param is present (#241)', async () => {
    seedState()
    window.history.pushState(null, '', '/?view=vergleich')

    render(<App />)
    await waitForCalculator()

    const ueberblickBtn = await screen.findByRole('button', { name: /^Überblick$/ })
    expect(ueberblickBtn).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('heading', { name: /^Überblick$/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Verm.gen bis Rentenbeginn/ }),
    ).not.toBeInTheDocument()
  })

  it('updates the URL when a sidebar leaf is clicked', async () => {
    seedState()
    window.history.pushState(null, '', '/?view=vergleich&pane=kapital')

    render(<App />)
    await waitForCalculator()

    const renteLeaf = await screen.findByRole('button', { name: /Monatliche Rente/ })
    fireEvent.click(renteLeaf)

    expect(window.location.search).toContain('pane=rente')
    expect(renteLeaf).toHaveAttribute('aria-current', 'page')
    expect(
      screen.queryByRole('heading', { name: /Verm.gen bis Rentenbeginn/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Monatliche Netto-Rente/ }),
    ).toBeInTheDocument()
  })

  it('shows Fairness leaf only when bAV is in visibleProducts', async () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(defaultProfile, {
        ...defaultAssumptions,
        visibleProducts: ['etf'],
      }),
    )
    window.history.pushState(null, '', '/?view=vergleich')

    render(<App />)
    await waitForCalculator()

    expect(
      screen.queryByRole('button', { name: /Fairness/ }),
    ).not.toBeInTheDocument()
  })

  it('shows Fairness leaf when bAV is in visibleProducts', async () => {
    seedState()
    window.history.pushState(null, '', '/?view=vergleich')

    render(<App />)
    await waitForCalculator()

    expect(
      await screen.findByRole('button', { name: /Fairness/ }),
    ).toBeInTheDocument()
  })
})

describe('App - migrated Vergleich panes (#240)', () => {
  it('declares the implemented pane slugs as deep-linkable panes', () => {
    expect(ALL_VERGLEICH_PANES).toEqual(
      expect.arrayContaining([
        'rente',
        'break-even',
        'fee-drag',
        'monte-carlo',
        'fairness',
      ]),
    )
  })

  it('opens the Fee Drag pane from ?pane=fee-drag and isolates FeeDragChart', async () => {
    seedState()
    window.history.pushState(null, '', '/?view=vergleich&pane=fee-drag')

    render(<App />)
    await waitForCalculator()

    const feeDragLeaf = await screen.findByRole('button', { name: /Fee Drag/ })
    expect(feeDragLeaf).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('heading', { name: /Geb.hren-Vergleich/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Verm.gen bis Rentenbeginn/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Monatliche Netto-Rente/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Kapital und Auszahlungen im Alter/ }),
    ).not.toBeInTheDocument()
  })

  it('opens the KV/PV-Last pane from ?pane=kv-pv-last and isolates its visualization (#244)', async () => {
    seedState()
    window.history.pushState(null, '', '/?view=vergleich&pane=kv-pv-last')

    render(<App />)
    await waitForCalculator()

    const kvPvLeaf = await screen.findByRole('button', { name: /KV\/PV-Last/ })
    expect(kvPvLeaf).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('heading', { name: /KV\/PV-Last/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Verm.gen bis Rentenbeginn/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Monatliche Netto-Rente/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Kapital und Auszahlungen im Alter/ }),
    ).not.toBeInTheDocument()
  })
})
