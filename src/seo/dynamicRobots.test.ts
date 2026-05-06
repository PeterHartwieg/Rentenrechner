// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyShareStateNoindex } from './dynamicRobots'
import * as urlShare from '../utils/urlShare'

vi.mock('../utils/urlShare', () => ({
  readUrlState: vi.fn(() => null),
}))

describe('applyShareStateNoindex — dynamic noindex injection on hydration', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    vi.mocked(urlShare.readUrlState).mockReturnValue(null)
  })

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('does nothing when no share state is present', () => {
    // Add a prerendered index,follow tag and confirm we leave it alone.
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'index,follow')
    document.head.appendChild(meta)

    expect(applyShareStateNoindex()).toBe(false)
    expect(meta.getAttribute('content')).toBe('index,follow')
  })

  it('overwrites existing robots meta to noindex,follow when share state is present', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'index,follow')
    document.head.appendChild(meta)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(urlShare.readUrlState).mockReturnValueOnce({ profile: {}, assumptions: {} } as any)

    expect(applyShareStateNoindex()).toBe(true)
    expect(meta.getAttribute('content')).toBe('noindex,follow')
  })

  it('creates a robots meta tag when none exists and share state is present', () => {
    expect(document.querySelector('meta[name="robots"]')).toBeNull()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(urlShare.readUrlState).mockReturnValueOnce({ profile: {}, assumptions: {} } as any)

    expect(applyShareStateNoindex()).toBe(true)
    const meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('noindex,follow')
  })

  it('returns false when readUrlState throws (defensive)', () => {
    vi.mocked(urlShare.readUrlState).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(applyShareStateNoindex()).toBe(false)
  })
})
