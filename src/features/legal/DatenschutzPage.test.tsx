// @vitest-environment jsdom
/**
 * Verify that DatenschutzPage renders every localStorage and sessionStorage
 * key the app actually writes — sourced from the constants, not hardcoded
 * strings. This is a publication-blocking GDPR/legal compliance check
 * (issue #12).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { DatenschutzPage } from './DatenschutzPage'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'
import { LIBRARY_KEY } from '../../data/scenarioLibrary'
import { WORKSPACE_KEY } from '../../app/useWorkspace'
import { DISMISS_KEY } from '../workspace/DisclaimerBanner'

/** Legacy key from the removed Geführter-Einstieg feature. */
const LEGACY_SETUP_FLAG_KEY = 'rentenrechner-guided-setup-v1'

afterEach(() => cleanup())

describe('DatenschutzPage storage key enumeration', () => {
  function renderPage() {
    const { container } = render(
      <DatenschutzPage navigate={() => undefined} />
    )
    return container.textContent ?? ''
  }

  it('lists the v1 state key (STORAGE_KEY_V1)', () => {
    expect(renderPage()).toContain(STORAGE_KEY_V1)
  })

  it('lists the v2 workspace state key (STORAGE_KEY_V2)', () => {
    expect(renderPage()).toContain(STORAGE_KEY_V2)
  })

  it('lists the scenario library key (LIBRARY_KEY)', () => {
    expect(renderPage()).toContain(LIBRARY_KEY)
  })

  it('lists the legacy guided-setup flag key for transparency on stale entries', () => {
    expect(renderPage()).toContain(LEGACY_SETUP_FLAG_KEY)
  })

  it('lists the workspace view key (WORKSPACE_KEY)', () => {
    expect(renderPage()).toContain(WORKSPACE_KEY)
  })

  it('lists the disclaimer-dismissed sessionStorage key (DISMISS_KEY)', () => {
    expect(renderPage()).toContain(DISMISS_KEY)
  })

  it('all localStorage keys appear in the same section 4 list', () => {
    const { container } = render(
      <DatenschutzPage navigate={() => undefined} />
    )
    // Find the list of storage keys — it lives in section h2 "4. Lokale Speicherung im Browser"
    const section = Array.from(container.querySelectorAll('section')).find(
      (s) => s.textContent?.includes('Lokale Speicherung')
    )
    expect(section).toBeDefined()
    const sectionText = section?.textContent ?? ''
    expect(sectionText).toContain(STORAGE_KEY_V1)
    expect(sectionText).toContain(STORAGE_KEY_V2)
    expect(sectionText).toContain(LIBRARY_KEY)
    expect(sectionText).toContain(LEGACY_SETUP_FLAG_KEY)
    expect(sectionText).toContain(WORKSPACE_KEY)
    expect(sectionText).toContain(DISMISS_KEY)
  })

  it('DISMISS_KEY is annotated as sessionStorage (not localStorage)', () => {
    const { container } = render(
      <DatenschutzPage navigate={() => undefined} />
    )
    const section = Array.from(container.querySelectorAll('section')).find(
      (s) => s.textContent?.includes('Lokale Speicherung')
    )
    const items = Array.from(section?.querySelectorAll('li') ?? [])
    const disclaimerItem = items.find((li) => li.textContent?.includes(DISMISS_KEY))
    expect(disclaimerItem?.textContent).toContain('sessionStorage')
    // confirm it does NOT claim localStorage for the disclaimer key
    expect(disclaimerItem?.textContent).not.toMatch(/\blocalStorage\b/)
  })
})
