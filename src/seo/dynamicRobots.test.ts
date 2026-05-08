// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyShareStateNoindex } from './dynamicRobots'

function setShareUrl(present: boolean): void {
  const search = present ? '?s=eyJmb28iOjF9' : ''
  window.history.replaceState(null, '', '/' + search)
}

describe('applyShareStateNoindex — dynamic noindex injection on hydration', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    setShareUrl(false)
  })

  afterEach(() => {
    document.head.innerHTML = ''
    setShareUrl(false)
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

    setShareUrl(true)

    expect(applyShareStateNoindex()).toBe(true)
    expect(meta.getAttribute('content')).toBe('noindex,follow')
  })

  it('creates a robots meta tag when none exists and share state is present', () => {
    expect(document.querySelector('meta[name="robots"]')).toBeNull()

    setShareUrl(true)

    expect(applyShareStateNoindex()).toBe(true)
    const meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('noindex,follow')
  })

  it('treats `?s=` with empty value as no share state', () => {
    // Defensive: a malformed link with an empty `?s=` should not flip the
    // page to noindex. `hasShareStateInUrl` requires a non-empty value.
    window.history.replaceState(null, '', '/?s=')

    expect(applyShareStateNoindex()).toBe(false)
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })
})
