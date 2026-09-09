import { beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// The combine-mode workspace lives in a module-level store (see
// `src/app/portfolioState.ts`) so every route's `usePortfolioState` mount
// observes the same value. That store would otherwise survive between tests
// and shadow the localStorage fixture a test seeds in its own `beforeEach`.
//
// The hook is registered *before* the top-level `await` below: a `beforeEach`
// registered after it lands too late to run for every test.
let resetStore: (() => void) | null = null
beforeEach(() => {
  resetStore?.()
})

// Default jsdom-environment tests to desktop viewport. Tests that need other
// viewports call mockViewport('phone' | 'tablet') explicitly. Without this,
// components that call window.matchMedia throw because jsdom doesn't ship a
// matchMedia. Node-environment tests have no window, so we no-op there.
if (typeof window !== 'undefined') {
  // Lazy import so node-environment tests don't pull in the helper graph.
  const { mockViewport } = await import('./test/viewport')
  mockViewport('desktop')
  resetStore = (await import('./app/portfolioState')).resetPortfolioStore
}
