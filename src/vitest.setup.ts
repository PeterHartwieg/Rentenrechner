import '@testing-library/jest-dom/vitest'

// Default jsdom-environment tests to desktop viewport. Tests that need other
// viewports call mockViewport('phone' | 'tablet') explicitly. Without this,
// components that call window.matchMedia throw because jsdom doesn't ship a
// matchMedia. Node-environment tests have no window, so we no-op there.
if (typeof window !== 'undefined') {
  // Lazy import so node-environment tests don't pull in the helper graph.
  const { mockViewport } = await import('./test/viewport')
  mockViewport('desktop')
}
