// @vitest-environment jsdom

/**
 * Sensitive-field redaction tests (issue 03 — Phase 1 Lane B).
 *
 * Pin the contract of `applySensitiveRedaction` and `withSensitiveRedaction`:
 *   - mark every `data-qa-sensitive="true"` element with `filter: blur(8px)`
 *     (DECISIONS §5);
 *   - restore the live UI on success AND on capture failure;
 *   - leave nested children of a sensitive container masked (they inherit
 *     the parent's CSS `filter`);
 *   - never mutate elements outside the marked subtree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applySensitiveRedaction, withSensitiveRedaction, SENSITIVE_ATTRIBUTE } from './redact'

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('applySensitiveRedaction', () => {
  it('applies a blur(8px) mask to every data-qa-sensitive element', () => {
    document.body.innerHTML = `
      <div id="safe">visible</div>
      <label data-qa-sensitive="true" id="a">A</label>
      <label data-qa-sensitive="true" id="b">B</label>
    `
    const handle = applySensitiveRedaction()
    expect(handle.redactedCount).toBe(2)
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    expect(a.style.filter).toContain('blur(8px)')
    expect(b.style.filter).toContain('blur(8px)')
    // The element outside the mask is untouched.
    const safe = document.getElementById('safe') as HTMLElement
    expect(safe.style.filter).toBe('')
  })

  it('does not match data-qa-sensitive="false" or missing attribute', () => {
    document.body.innerHTML = `
      <label data-qa-sensitive="false" id="off">Off</label>
      <label id="missing">Missing</label>
    `
    const handle = applySensitiveRedaction()
    expect(handle.redactedCount).toBe(0)
    expect((document.getElementById('off') as HTMLElement).style.filter).toBe('')
  })

  it('restores the original inline filter after restore()', () => {
    document.body.innerHTML = `
      <label data-qa-sensitive="true" id="a" style="filter: brightness(0.9);">A</label>
      <label data-qa-sensitive="true" id="b">B</label>
    `
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    const handle = applySensitiveRedaction()
    expect(a.style.filter).toContain('blur(8px)')
    expect(b.style.filter).toContain('blur(8px)')

    handle.restore()
    // Element with a pre-existing inline filter is rolled back to that filter.
    expect(a.style.filter).toBe('brightness(0.9)')
    // Element with no prior filter has the property removed entirely.
    expect(b.getAttribute('style') ?? '').not.toContain('filter')
  })

  it('restore() is idempotent', () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a">A</label>`
    const handle = applySensitiveRedaction()
    handle.restore()
    const styleAfterFirst = document.getElementById('a')?.getAttribute('style') ?? ''
    handle.restore()
    expect(document.getElementById('a')?.getAttribute('style') ?? '').toBe(styleAfterFirst)
  })

  it('removes the data-qa-redacted marker after restore()', () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a">A</label>`
    const a = document.getElementById('a') as HTMLElement
    const handle = applySensitiveRedaction()
    expect(a.getAttribute('data-qa-redacted')).toBe('1')
    handle.restore()
    expect(a.getAttribute('data-qa-redacted')).toBeNull()
  })

  it('masks nested children via CSS filter inheritance (parent-only mask is sufficient)', () => {
    document.body.innerHTML = `
      <div data-qa-sensitive="true" id="parent">
        <input id="child" value="100" />
        <span id="grandchild">100</span>
      </div>
    `
    const parent = document.getElementById('parent') as HTMLElement
    applySensitiveRedaction()
    // The contract is: mask the parent so its descendants render blurred via
    // CSS inheritance. The descendants do not need their own inline filter.
    expect(parent.style.filter).toContain('blur(8px)')
    const child = document.getElementById('child') as HTMLElement
    expect(child.style.filter).toBe('')
  })

  it('exposes SENSITIVE_ATTRIBUTE so callers do not duplicate the literal', () => {
    expect(SENSITIVE_ATTRIBUTE).toBe('data-qa-sensitive')
  })
})

describe('withSensitiveRedaction', () => {
  it('runs capture with the mask applied and restores on success', async () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a">A</label>`
    const a = document.getElementById('a') as HTMLElement

    let filterDuringCapture = ''
    const { result, redactedCount } = await withSensitiveRedaction(document, async () => {
      filterDuringCapture = a.style.filter
      return 'ok'
    })

    expect(filterDuringCapture).toContain('blur(8px)')
    expect(result).toBe('ok')
    expect(redactedCount).toBe(1)
    // After capture: filter restored.
    expect(a.getAttribute('style') ?? '').not.toContain('filter')
  })

  it('restores even when capture throws synchronously', async () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a">A</label>`
    const a = document.getElementById('a') as HTMLElement

    await expect(
      withSensitiveRedaction(document, () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Live UI must be back to its untouched state.
    expect(a.getAttribute('style') ?? '').not.toContain('filter')
    expect(a.getAttribute('data-qa-redacted')).toBeNull()
  })

  it('restores even when capture rejects asynchronously', async () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a">A</label>`
    const a = document.getElementById('a') as HTMLElement

    await expect(
      withSensitiveRedaction(document, async () => {
        throw new Error('async boom')
      }),
    ).rejects.toThrow('async boom')

    expect(a.getAttribute('style') ?? '').not.toContain('filter')
    expect(a.getAttribute('data-qa-redacted')).toBeNull()
  })

  it('preserves the pre-existing inline filter across capture', async () => {
    document.body.innerHTML = `<label data-qa-sensitive="true" id="a" style="filter: brightness(1.1);">A</label>`
    const a = document.getElementById('a') as HTMLElement

    await withSensitiveRedaction(document, () => {
      // During capture the brightness has been replaced by the blur mask.
      expect(a.style.filter).toContain('blur(8px)')
      return undefined
    })

    expect(a.style.filter).toBe('brightness(1.1)')
  })
})
