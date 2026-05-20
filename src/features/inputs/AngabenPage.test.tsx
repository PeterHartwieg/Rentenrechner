// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import type { Route } from '../../app/useRoute'
import { AngabenPage } from './AngabenPage'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR } from '../../rules'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { buildStateJson, defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'
import { addInstanceToWorkspace } from '../../features/inventory/inventoryHelpers'
import type { Workspace } from '../../domain/workspace'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  // Compare-mode useCalculatorState lazy-initialises from URL + localStorage
  // on mount; tests that don't seed state must see a clean slate so the page
  // boots with `defaultProfile` / `defaultAssumptions`. Clearing both keys
  // prevents pollution from any v2 workspace a previous test wrote.
  localStorage.clear()
  // `?` query params are read once by `readUrlState`; reset the URL so the
  // page mounts in the absent-URL-state branch.
  window.history.pushState(null, '', '/eingaben')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, route: Route = '/eingaben') {
  return createElement(AppShell, { route, navigate: () => {}, children: node })
}

describe('AngabenPage — /eingaben route content', () => {
  it('renders the registry H1 verbatim', () => {
    const { getByRole } = render(<AngabenPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/eingaben'].h1,
    )
  })

  it('renders the registry summary as the page lead paragraph', () => {
    const { container } = render(<AngabenPage />)
    const lead = container.querySelector('.angaben-summary')
    expect(lead).not.toBeNull()
    expect(lead!.textContent).toBe(publicRouteRegistry['/eingaben'].summary)
  })

  it('renders every § section as an h2 with a stable slug id', () => {
    const { container } = render(<AngabenPage />)
    const h2 = Array.from(container.querySelectorAll('h2'))
    // The body emits four § sections; their ids drive `/eingaben#…` deep links.
    expect(h2.length).toBeGreaterThanOrEqual(4)
    // Ids are year-free so `/eingaben#renteneintritt` keeps working when
    // RULES_YEAR rolls forward.
    const expectedIds = ['person', 'einkommen', 'renteneintritt', 'annahmen']
    const renderedIds = h2.map((h) => h.id)
    for (const id of expectedIds) {
      expect(renderedIds).toContain(id)
    }
  })

  it('renders mono § kicker labels for each section', () => {
    const { container } = render(<AngabenPage />)
    const kickers = Array.from(container.querySelectorAll('.angaben-section-num')).map(
      (n) => n.textContent ?? '',
    )
    // The mock + handoff convention is "§ 1", "§ 2", …; assert each present.
    expect(kickers).toContain('§ 1')
    expect(kickers).toContain('§ 2')
    expect(kickers).toContain('§ 3')
    expect(kickers).toContain('§ 4')
  })

  it('emits no inline JSON-LD (head pipeline owns the /eingaben WebPage block)', () => {
    // The /eingaben WebPage JSON-LD is emitted into <head> by
    // `renderRouteHeadHtml('/eingaben')` via the SSG prerender path. Emitting
    // a second copy inline would duplicate the schema and trip the
    // "single JSON-LD per route" invariant.
    const html = renderToString(<AngabenPage />)
    expect(html).not.toMatch(/application\/ld\+json/)
  })

  it('contains no fictional bylines or unsanctioned licence claims', () => {
    const { container } = render(<AngabenPage />)
    const text = container.textContent ?? ''
    // Single-maintainer posture inherited from PR 2/3/4 retros.
    expect(text).not.toMatch(/Fachprüfung/i)
    expect(text).not.toMatch(/CC\s?BY-SA/i)
    expect(text).not.toMatch(/318\s?Contributor/i)
    expect(text).not.toMatch(/RentenWiki e\.\s?V\./i)
    // MIT is for someone else's project; we ship under PolyForm.
    expect(text).not.toMatch(/\bMIT-Lizenz\b/i)
    // Public chrome must not regress to "Rentenrechner" (P0 brand guardrail).
    expect(text).not.toContain('Rentenrechner')
  })

  it('renders all four section titles', () => {
    const { container } = render(<AngabenPage />)
    const titles = Array.from(container.querySelectorAll('.angaben-section-title')).map(
      (h) => h.textContent ?? '',
    )
    expect(titles).toContain('Person')
    expect(titles).toContain('Einkommen')
    expect(titles).toContain('Renteneintritt')
    expect(titles).toContain('Annahmen')
  })

  it('renders the breadcrumb back-link via SPA navigation', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const back = container.querySelector('.angaben-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('preserves modified-click default on the breadcrumb back-link', () => {
    // Modifier-click (Cmd/Ctrl/middle/Shift) must NOT preventDefault, so users
    // can open the breadcrumb target in a new tab. `shouldUseSpaNavigation`
    // guards every SPA-intercept anchor — verify the guard fires here too.
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const back = container.querySelector('.angaben-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!, { metaKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders TOC items with aria-current on the active section', () => {
    const { container } = render(<AngabenPage />)
    const tocLinks = Array.from(container.querySelectorAll('.angaben-toc-link'))
    // Before IntersectionObserver fires (jsdom doesn't implement it), the
    // first TOC item carries `aria-current="location"` as the fallback.
    const active = tocLinks.filter((a) => a.getAttribute('aria-current') === 'location')
    expect(active.length).toBe(1)
  })

  it('routes the Methode link in the right rail through the SPA navigator', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const methodeLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '') === '/methode',
    )
    expect(methodeLinks.length).toBeGreaterThan(0)
    fireEvent.click(methodeLinks[0])
    expect(navigate).toHaveBeenCalledWith('/methode')
  })

  it('preserves modified-click default on the Methode aside link', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const methodeLink = container.querySelector('a[href="/methode"]') as HTMLAnchorElement | null
    expect(methodeLink).not.toBeNull()
    fireEvent.click(methodeLink!, { ctrlKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders the registered Stand line', () => {
    const { container } = render(<AngabenPage />)
    const stand = container.querySelector('.angaben-stand')
    expect(stand).not.toBeNull()
    expect(stand!.textContent).toContain(
      `Stand: ${publicRouteRegistry['/eingaben'].dateModified}`,
    )
    expect(stand!.textContent).toContain(`Werte für Deutschland ${RULES_YEAR}`)
  })

  it('renders the "Warum wir das fragen" card with one entry per § section', () => {
    const { container } = render(<AngabenPage />)
    const items = container.querySelectorAll('.angaben-aside-list-item')
    // One bullet per § section (Person / Einkommen / Renteneintritt / Annahmen).
    expect(items.length).toBe(4)
    const text = Array.from(items).map((i) => i.textContent ?? '').join(' ')
    expect(text).toContain('§ 22 Nr. 1')
    expect(text).toContain('§ 32a Abs. 5')
    expect(text).toContain('§ 39b EStG')
    // "MSCI-World-Renditen" (hyphenated compound) in the right-rail body.
    expect(text).toMatch(/MSCI[‐‑–—\- ]?World/)
  })

  it('renders the not-advice disclaimer when wrapped in AppShell (compliance)', () => {
    const { container } = render(inShell(<AngabenPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('marks Angaben as the active chrome nav tab when wrapped in AppShell', () => {
    const { container } = render(inShell(<AngabenPage />))
    // The chrome's desktop nav renders the "Angaben" tab with the active class
    // when the route is `/eingaben` (per chromeRoutes.routeToNavId).
    const active = container.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Angaben')
  })

  it('renders the page without throwing at every viewport', () => {
    eachViewport(() => {
      expect(() => renderToString(inShell(<AngabenPage />))).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// NumberField tap-target — phone breakpoint must put every NumberField wrapper
// over the 44 px tap-target threshold (WCAG 2.2 SC 2.5.8). The pure-CSS bump
// is applied in `src/ui/forms.css` under `@media (max-width: 639px)`.
//
// jsdom doesn't apply stylesheets at full fidelity (no real layout engine),
// so we read the CSS source directly and assert the rule exists. This guards
// against accidental regression of the CSS itself.
// ---------------------------------------------------------------------------
describe('AngabenPage — phone tap target rule', () => {
  it('compiles a phone-specific padding bump for .field .input-shell input', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // process.cwd() is the repo root under vitest. The test guards the
    // canonical forms.css path that ships the WCAG 2.2 tap-target rule.
    const formsCssPath = join(process.cwd(), 'src', 'ui', 'forms.css')
    const formsCss = await readFile(formsCssPath, 'utf8')
    expect(formsCss).toContain('max-width: 639px')
    expect(formsCss).toMatch(/\.field\s+\.input-shell\s+input/)
    // Parallel rule for `<select>` — without this, select-size regressions
    // (e.g. someone editing forms.css and dropping the `, .field select`
    // selector from the phone-padding bump) would slip past the test that
    // currently only guards the `input` half of the pair.
    expect(formsCss).toMatch(/\.field\s+select/)
    expect(formsCss).toMatch(/padding-top:\s*12px/)
    expect(formsCss).toMatch(/padding-bottom:\s*12px/)
  })
})

// ---------------------------------------------------------------------------
// Right-rail accordion (round-1 review finding 5). Each `.angaben-aside-card`
// folds into a button-triggered disclosure on phone. The disclosure pattern
// is WAI-ARIA's: a `<button>` carries `aria-expanded` + `aria-controls`
// pointing to a body region with the matching `id`. Desktop + tablet render
// the cards expanded with the button `disabled` (kicker reads as a label).
// ---------------------------------------------------------------------------
describe('AngabenPage — right-rail accordion a11y', () => {
  it('renders an aria-expanded button per aside card with matching aria-controls/id', () => {
    const { container } = render(<AngabenPage />)
    const toggles = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.angaben-aside-toggle'),
    )
    // Two aside cards (Warum wir das fragen / Datenhaltung).
    expect(toggles.length).toBe(2)
    for (const toggle of toggles) {
      // Every toggle is a real `<button>` so keyboard a11y (Enter/Space)
      // comes for free from the platform.
      expect(toggle.tagName).toBe('BUTTON')
      expect(toggle.getAttribute('aria-expanded')).not.toBeNull()
      const controlsId = toggle.getAttribute('aria-controls')
      expect(controlsId).toBeTruthy()
      // The id must resolve to a real element so screen readers can
      // navigate from disclosure to body.
      const body = container.querySelector(`#${controlsId}`)
      expect(body).not.toBeNull()
    }
  })

  it('starts expanded on desktop (kicker is a label, body always visible)', () => {
    mockViewport('desktop')
    const { container } = render(<AngabenPage />)
    const toggles = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.angaben-aside-toggle'),
    )
    for (const toggle of toggles) {
      // aria-expanded="true" so the kicker reads as a label that owns the
      // visible body, not a closed disclosure.
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      // Disabled on desktop + tablet so the click handler is a no-op and
      // assistive tech does not surface a false interactive control.
      expect(toggle.hasAttribute('disabled')).toBe(true)
    }
  })

  it('starts collapsed on phone and toggles on click', () => {
    mockViewport('phone')
    const { container } = render(<AngabenPage />)
    const toggle = container.querySelector<HTMLButtonElement>('.angaben-aside-toggle')
    expect(toggle).not.toBeNull()
    // Phone: collapsed by default — aria-expanded reads "false" and the
    // body region carries the `hidden` attribute.
    expect(toggle!.getAttribute('aria-expanded')).toBe('false')
    expect(toggle!.hasAttribute('disabled')).toBe(false)
    const controlsId = toggle!.getAttribute('aria-controls')!
    const body = container.querySelector(`#${controlsId}`) as HTMLElement
    expect(body.hasAttribute('hidden')).toBe(true)

    // Click expands.
    fireEvent.click(toggle!)
    expect(toggle!.getAttribute('aria-expanded')).toBe('true')
    expect(body.hasAttribute('hidden')).toBe(false)

    // Click again collapses.
    fireEvent.click(toggle!)
    expect(toggle!.getAttribute('aria-expanded')).toBe('false')
    expect(body.hasAttribute('hidden')).toBe(true)
  })

  it('keeps the Methode link inside the Datenhaltung card functional after expand', () => {
    mockViewport('phone')
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const toggles = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.angaben-aside-toggle'),
    )
    // Datenhaltung is the second card; expand it so the Methode link is
    // visible to the click event.
    fireEvent.click(toggles[1])
    const methodeLink = container.querySelector(
      'a[href="/methode"]',
    ) as HTMLAnchorElement | null
    expect(methodeLink).not.toBeNull()
    fireEvent.click(methodeLink!)
    expect(navigate).toHaveBeenCalledWith('/methode')
    // Modified-click still falls through to native navigation.
    navigate.mockClear()
    fireEvent.click(methodeLink!, { ctrlKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// State pipeline — Codex round-3 P1: AngabenPage was discarding edits on
// refresh / navigation. The page now consumes `useCalculatorState`
// (compare-mode singleton) so edits flow into STORAGE_KEY_V1 and the `/`
// dashboard picks them up on the next mount.
// ---------------------------------------------------------------------------
describe('AngabenPage — compare-mode state wiring (useCalculatorState)', () => {
  /**
   * Find the "Alter" NumberField. The section component renders the label as
   * the first `<span>` child of the wrapping `<label>` — we read every label
   * on the page and pick the one whose text starts with "Alter".
   */
  function findAgeInput(container: HTMLElement): HTMLInputElement {
    const labels = Array.from(container.querySelectorAll('label.field'))
    for (const label of labels) {
      const span = label.querySelector('span')
      if (span && (span.textContent ?? '').trim().startsWith('Alter')) {
        const input = label.querySelector('input[type="number"]')
        if (input) return input as HTMLInputElement
      }
    }
    throw new Error('Alter NumberField not found in rendered AngabenPage')
  }

  it('writes edits to STORAGE_KEY_V1 (compare-mode singleton)', () => {
    // Clean slate (no seed) — page boots with `defaultProfile`. Editing the
    // Alter NumberField fires `onChange` per keystroke, which dispatches
    // `setProfile`. The `useEffect` in `useCalculatorState` then writes the
    // new state to STORAGE_KEY_V1.
    const { container } = render(<AngabenPage />)
    const ageInput = findAgeInput(container)
    expect(ageInput.value).toBe(String(defaultProfile.age))

    fireEvent.change(ageInput, { target: { value: '42' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      version: number
      profile: { age: number }
    }
    expect(parsed.version).toBe(1)
    expect(parsed.profile.age).toBe(42)
  })

  it('hydrates from STORAGE_KEY_V1 so persisted edits survive a fresh mount', () => {
    // Seed a non-default profile.age and assert the page renders it on mount.
    // This is the round-trip the Codex P1 finding called out: edits made on
    // /eingaben must persist across reload + navigation.
    const seededProfile = { ...defaultProfile, age: 47 }
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(seededProfile, defaultAssumptions),
    )

    const { container } = render(<AngabenPage />)
    const ageInput = findAgeInput(container)
    expect(ageInput.value).toBe('47')
  })

  it('shares state with the compare-mode dashboard via STORAGE_KEY_V1', () => {
    // Edits made on /eingaben must be visible to the compare-mode dashboard
    // on / — both routes use the same STORAGE_KEY_V1 envelope. We can't
    // mount Calculator here cheaply, so we assert the persisted envelope is
    // shape-compatible with the v1 reader: `{ version, profile, assumptions }`
    // with the new profile value in place.
    const { container } = render(<AngabenPage />)
    const ageInput = findAgeInput(container)
    fireEvent.change(ageInput, { target: { value: '55' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      version: number
      profile: { age: number; retirementAge: number; grossSalaryYear: number }
      assumptions: { compareSubMode?: string }
    }
    expect(parsed.version).toBe(1)
    expect(parsed.profile.age).toBe(55)
    // Other profile fields are preserved — only `age` changed.
    expect(parsed.profile.retirementAge).toBe(defaultProfile.retirementAge)
    expect(parsed.profile.grossSalaryYear).toBe(defaultProfile.grossSalaryYear)
    // The assumptions side is left intact so compare-mode rendering does
    // not pick up a stripped scenario shape.
    expect(parsed.assumptions).toBeDefined()
  })

  it('does not regress to the local-state defaults when a v1 envelope is present', () => {
    // Codex P1: before the fix the page initialised from `defaultProfile`
    // every mount, discarding any prior edits. This regression-guards that
    // path — seed a non-default `age`, mount, and confirm the input does
    // NOT show `defaultProfile.age`.
    const seededProfile = { ...defaultProfile, age: 33 }
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(seededProfile, defaultAssumptions),
    )

    const { container } = render(<AngabenPage />)
    const ageInput = findAgeInput(container)
    expect(ageInput.value).not.toBe(String(defaultProfile.age))
    expect(ageInput.value).toBe('33')
  })
})

// ---------------------------------------------------------------------------
// Field clamping — Codex round-4 P2: section setters wrote `Number(value)`
// directly to STORAGE_KEY_V1. Because `<input type="number">` does not reject
// typed out-of-range values, a user could persist an out-of-range
// `retirementAge` (e.g. age=30, retirementAge=25). validateState then rejects
// the snapshot on next load and the app silently falls back to defaults.
// Section setters now clamp to the same min/max bounds the NumberField
// declares so the persisted envelope is always validator-clean.
// ---------------------------------------------------------------------------
describe('AngabenPage — section setters clamp before persisting (round-4 P2)', () => {
  /**
   * Find the NumberField whose visible label starts with `prefix`. Reuses the
   * same `label.field` lookup as the `findAgeInput` helper above so the test
   * does not depend on internal section structure.
   */
  function findNumberInput(container: HTMLElement, prefix: string): HTMLInputElement {
    const labels = Array.from(container.querySelectorAll('label.field'))
    for (const label of labels) {
      const span = label.querySelector('span')
      if (span && (span.textContent ?? '').trim().startsWith(prefix)) {
        const input = label.querySelector('input[type="number"]')
        if (input) return input as HTMLInputElement
      }
    }
    throw new Error(`NumberField "${prefix}" not found in rendered AngabenPage`)
  }

  it('clamps retirementAge so it never falls below age + 1 (validateState invariant)', () => {
    // Seed age=30 with the default retirementAge (defaultProfile.retirementAge
    // is well above 30). Typing "25" into the retirementAge input would,
    // pre-fix, persist `retirementAge: 25` next to `age: 30`. validateState
    // would then reject the snapshot (`retirementAge >= age` invariant,
    // scenarioSchema.ts:32) and loadSavedState would return null. The clamp
    // adjusts to max(55, age+1) = 55 here.
    const seededProfile = { ...defaultProfile, age: 30 }
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(seededProfile, defaultAssumptions),
    )
    const { container } = render(<AngabenPage />)
    const retirementInput = findNumberInput(container, 'Renteneintrittsalter')

    fireEvent.change(retirementInput, { target: { value: '25' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      profile: { age: number; retirementAge: number }
    }
    // Clamp lifts 25 to max(55, age+1) = 55 for age=30.
    expect(parsed.profile.retirementAge).toBeGreaterThanOrEqual(
      parsed.profile.age + 1,
    )
    expect(parsed.profile.retirementAge).toBe(55)
  })

  it('persists a clamped retirementAge that round-trips through loadSavedState (no fallback to defaults)', () => {
    // The persisted envelope must pass validateState on next mount —
    // otherwise loadSavedState returns null and the page falls back to
    // defaultProfile, discarding the user's age=30. This guards the full
    // round-trip the wrong-number bug describes.
    const seededProfile = { ...defaultProfile, age: 30 }
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(seededProfile, defaultAssumptions),
    )
    const first = render(<AngabenPage />)
    fireEvent.change(
      findNumberInput(first.container, 'Renteneintrittsalter'),
      { target: { value: '25' } },
    )
    first.unmount()

    // Fresh mount — useCalculatorState re-runs the lazy initializer and
    // reads STORAGE_KEY_V1. If the persisted snapshot were invalid, the
    // hook would silently fall back to defaultProfile.age (something other
    // than 30). The clamp keeps the envelope validator-clean.
    const second = render(<AngabenPage />)
    const ageInput = findNumberInput(second.container, 'Alter')
    expect(ageInput.value).toBe('30')
  })

  it('clamps retirementAge above the page max (75) on typed overflow', () => {
    // The dynamic max (75) is enforced symmetrically. Typing 99 must clamp
    // to 75 so the persisted snapshot is still validator-clean (and
    // matches the user's visible NumberField max).
    const { container } = render(<AngabenPage />)
    const retirementInput = findNumberInput(container, 'Renteneintrittsalter')

    fireEvent.change(retirementInput, { target: { value: '99' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      profile: { retirementAge: number }
    }
    expect(parsed.profile.retirementAge).toBe(75)
  })

  it('clamps profile.age so it never crosses retirementAge - 1', () => {
    // Age must stay below retirementAge - 1 (validateState invariant).
    // Default retirementAge is 67, so typing 70 must clamp to 66.
    const { container } = render(<AngabenPage />)
    const ageInput = findNumberInput(container, 'Alter')

    fireEvent.change(ageInput, { target: { value: '70' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      profile: { age: number; retirementAge: number }
    }
    expect(parsed.profile.age).toBeLessThanOrEqual(parsed.profile.retirementAge - 1)
    expect(parsed.profile.age).toBe(defaultProfile.retirementAge - 1)
  })

  it('clamps retirementEndAge so it stays > retirementAge (cross-object invariant)', () => {
    // validateState rejects when retirementEndAge <= retirementAge
    // (scenarioSchema.ts:125). Default retirementAge is 67 here, so typing
    // 60 into "Kapital aufgebraucht bis" must clamp to 68.
    const { container } = render(<AngabenPage />)
    const endInput = findNumberInput(container, 'Kapital aufgebraucht bis')

    fireEvent.change(endInput, { target: { value: '60' } })

    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as {
      profile: { retirementAge: number }
      assumptions: { retirementEndAge: number }
    }
    expect(parsed.assumptions.retirementEndAge).toBeGreaterThan(
      parsed.profile.retirementAge,
    )
    expect(parsed.assumptions.retirementEndAge).toBe(
      defaultProfile.retirementAge + 1,
    )
  })
})

// ---------------------------------------------------------------------------
// Combine-mode state wiring — issue #282. PR 5 wired AngabenPage into
// compare-mode singleton state via `useCalculatorState`. Issue #282 adds a
// `useAngabenState` wrapper that detects whether the active session is in
// compare-mode or combine-mode and routes edits to the matching store. These
// tests cover the combine-mode branch (workspace at STORAGE_KEY_V2):
//   - mode detection picks `'combine'` when the v2 workspace says so.
//   - edits write to the workspace, not the compare-mode singleton.
//   - v1 is left untouched when the user is in combine-mode (no leak between
//     the two storage keys).
//   - the singleton view of the workspace correctly seeds the form on mount.
// The 4 compare-mode tests above (R3 batch) plus the 5 R4 clamp tests must
// continue to pass — they all run with a clean slate (no v2 workspace), so
// detectSavedMode returns null and useAngabenState falls back to the
// compare-mode branch (parity with PR 5).
// ---------------------------------------------------------------------------
describe('AngabenPage — combine-mode state wiring (useAngabenState)', () => {
  /** Re-implement the helper from the compare-mode block to keep both blocks
   *  self-contained. */
  function findNumberInput(container: HTMLElement, prefix: string): HTMLInputElement {
    const labels = Array.from(container.querySelectorAll('label.field'))
    for (const label of labels) {
      const span = label.querySelector('span')
      if (span && (span.textContent ?? '').trim().startsWith(prefix)) {
        const input = label.querySelector('input[type="number"]')
        if (input) return input as HTMLInputElement
      }
    }
    throw new Error(`NumberField "${prefix}" not found in rendered AngabenPage`)
  }

  /** Deep-clone the default workspace so each test can mutate freely. */
  function cloneWorkspace(): Workspace {
    return JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  }

  /** Build a minimal combine-mode workspace seed for these tests. */
  function buildCombineSeed(profileOverrides: Partial<typeof defaultProfile> = {}): Workspace {
    let workspace = cloneWorkspace()
    workspace = {
      ...workspace,
      mode: 'combine',
      baseline: {
        ...workspace.baseline,
        profile: { ...workspace.baseline.profile, ...profileOverrides },
      },
    }
    // Add a single bAV instance so the bAV-Brutto field has a place to write
    // back to (mirrors what a real combine-mode user produces via the wizard).
    workspace = addInstanceToWorkspace(workspace, 'bav')
    return workspace
  }

  it('writes profile edits to STORAGE_KEY_V2 (workspace) when v2 workspace has mode="combine"', () => {
    // Seed a combine workspace with profile.age=33 so we can detect that the
    // page actually hydrated from v2 (not from defaults via v1).
    const seed = buildCombineSeed({ age: 33 })
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { container } = render(<AngabenPage />)
    const ageInput = findNumberInput(container, 'Alter')
    expect(ageInput.value).toBe('33')

    fireEvent.change(ageInput, { target: { value: '42' } })

    // Workspace must reflect the edit.
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    expect(rawV2).not.toBeNull()
    const parsed = JSON.parse(rawV2!) as Workspace
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.mode).toBe('combine')
    expect(parsed.baseline.profile.age).toBe(42)
  })

  it('does NOT write to STORAGE_KEY_V1 (compare singleton) when in combine-mode', () => {
    // Critical isolation: combine-mode edits must not leak into v1. If they
    // do, the next mount of `/` in compare-mode would read those edits, and
    // the dual-key architecture documented in storage.ts breaks down.
    const seed = buildCombineSeed({ age: 33 })
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))
    // Pre-condition: v1 starts absent.
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull()

    const { container } = render(<AngabenPage />)
    const ageInput = findNumberInput(container, 'Alter')
    fireEvent.change(ageInput, { target: { value: '44' } })

    // v1 must still be absent — combine-mode edits do not touch it.
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull()
  })

  it('writes bAV-Brutto edits onto the first active bAV instance in combine-mode', () => {
    // The bAV-Brutto field is per-instance in combine-mode (vs. workspace-level
    // singleton in compare-mode). The hook routes the edit to the first active
    // bAV instance — mirrors `singletonViewOfWorkspace`'s firstActive selector.
    const seed = buildCombineSeed()
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { container } = render(<AngabenPage />)
    const bavInput = findNumberInput(container, 'bAV-Brutto pro Monat')

    fireEvent.change(bavInput, { target: { value: '275' } })

    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    expect(rawV2).not.toBeNull()
    const parsed = JSON.parse(rawV2!) as Workspace
    expect(parsed.baseline.assumptions.bav.length).toBeGreaterThanOrEqual(1)
    expect(parsed.baseline.assumptions.bav[0].monthlyGrossConversion).toBe(275)
  })

  it('persists workspace-level assumptions (retirementEndAge, monteCarlo, inflation) in combine-mode', () => {
    // retirementEndAge, monteCarlo.annualVolatility, and inflationRate are
    // workspace-level fields in v2 (no per-instance projection needed). The
    // hook writes them directly onto `baseline.assumptions`. This exercises
    // the 1:1 mapping path in `projectSingletonAssumptionsToWorkspace`.
    const seed = buildCombineSeed()
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { container } = render(<AngabenPage />)
    const endInput = findNumberInput(container, 'Kapital aufgebraucht bis')
    fireEvent.change(endInput, { target: { value: '92' } })

    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    expect(rawV2).not.toBeNull()
    const parsed = JSON.parse(rawV2!) as Workspace
    expect(parsed.baseline.assumptions.retirementEndAge).toBe(92)
    // Mode is unchanged; schemaVersion is unchanged.
    expect(parsed.mode).toBe('combine')
    expect(parsed.schemaVersion).toBe(2)
  })

  it('falls back to compare-mode when the v2 workspace says mode="compare"', () => {
    // A v2 workspace can carry mode='compare' (legacy users migrated v1→v2).
    // In that case the page must NOT treat them as combine-mode — they should
    // see compare-mode singleton behaviour identical to a fresh visitor. This
    // is a key safety check for the `detectSavedMode` heuristic.
    const compareWorkspace: Workspace = {
      ...cloneWorkspace(),
      mode: 'compare',
    }
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(compareWorkspace))

    const { container } = render(<AngabenPage />)
    const ageInput = findNumberInput(container, 'Alter')
    fireEvent.change(ageInput, { target: { value: '38' } })

    // Compare-mode write target is STORAGE_KEY_V1 — v1 should now hold the edit.
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
    expect(rawV1).not.toBeNull()
    const parsed = JSON.parse(rawV1!) as { version: number; profile: { age: number } }
    expect(parsed.version).toBe(1)
    expect(parsed.profile.age).toBe(38)
  })

  it('preserves combine-mode workspace fields the singleton view does not edit (whatIfs, pinnedComparisonIds)', () => {
    // The hook projects singleton → workspace via per-field mapping. Fields
    // the singleton does not expose (whatIfs, pinnedComparisonIds, scenario
    // metadata) must survive a round-trip — otherwise an edit on /eingaben
    // would silently wipe the user's what-if scenarios. This regression-guards
    // the architectural invariant that AngabenPage edits only touch the
    // baseline scenario, never the broader workspace structure.
    let seed = buildCombineSeed()
    // Stamp a fake pinned id to verify it survives a round-trip.
    seed = { ...seed, pinnedComparisonIds: ['some-whatif-id'] }
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { container } = render(<AngabenPage />)
    const ageInput = findNumberInput(container, 'Alter')
    fireEvent.change(ageInput, { target: { value: '41' } })

    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    const parsed = JSON.parse(rawV2!) as Workspace
    expect(parsed.pinnedComparisonIds).toEqual(['some-whatif-id'])
    expect(parsed.whatIfs).toEqual([])
    // The baseline edit still landed.
    expect(parsed.baseline.profile.age).toBe(41)
  })
})
