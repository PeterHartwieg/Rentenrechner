import { vi } from 'vitest'
import type { Viewport } from '../ui/chrome/useViewport'
import { PHONE_MAX, TABLET_MIN, TABLET_MAX } from '../ui/chrome/useViewport'

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: (event: string, cb: () => void) => void
  removeEventListener: (event: string, cb: () => void) => void
  addListener: (cb: () => void) => void
  removeListener: (cb: () => void) => void
  dispatchEvent: () => boolean
  onchange: null
}

function listenersFor(query: string, matches: boolean): MockMediaQueryList {
  return {
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    onchange: null,
  }
}

function viewportToWidth(viewport: Viewport): number {
  switch (viewport) {
    case 'phone':
      return 390
    case 'tablet':
      return 820
    case 'desktop':
    default:
      return 1280
  }
}

/**
 * Mock window.matchMedia to report a specific viewport. Use in tests that
 * need to assert viewport-dependent rendering. Pair with the matching CSS
 * media-query format expected by useViewport (max-width / min-width).
 */
export function mockViewport(viewport: Viewport): void {
  const width = viewportToWidth(viewport)
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })

  vi.stubGlobal('matchMedia', (query: string) => {
    const phoneMatch = query.includes(`max-width: ${PHONE_MAX}px`)
    const tabletMatch =
      query.includes(`min-width: ${TABLET_MIN}px`) && query.includes(`max-width: ${TABLET_MAX}px`)

    if (phoneMatch) return listenersFor(query, viewport === 'phone')
    if (tabletMatch) return listenersFor(query, viewport === 'tablet')
    // Unrecognised queries default to non-matching; covers components that
    // use additional queries we haven't taught the mock about.
    return listenersFor(query, false)
  })
}

/**
 * Run a callback for each of the three viewports. Use in tests that need
 * the same assertion to hold at phone/tablet/desktop. Mock is reset to the
 * default desktop after each iteration so subsequent tests aren't sticky.
 */
export function eachViewport(fn: (viewport: Viewport) => void): void {
  for (const viewport of ['phone', 'tablet', 'desktop'] as const) {
    mockViewport(viewport)
    fn(viewport)
  }
  mockViewport('desktop')
}
