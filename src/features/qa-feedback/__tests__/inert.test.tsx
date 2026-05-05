// @vitest-environment jsdom

/**
 * "Inert when disabled" regression coverage (PRD US-33).
 *
 * QA mode must not affect normal rendering or fire any DOM listeners when
 * the activation flag is off. These tests pin that contract — every Lane
 * B/C/D change must keep them passing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { QaModeIndicator } from '../QaModeIndicator'
import { qaTargetAttrs, useFeedbackTarget } from '../useFeedbackTarget'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function HostedTarget() {
  const { targetProps } = useFeedbackTarget({
    id: 'inputs.bav.employerSubsidy.label',
    label: 'AG-Zuschuss',
  })
  return (
    <button type="button" {...targetProps} data-testid="host">
      Host
    </button>
  )
}

describe('QaFeedbackProvider — inert when disabled', () => {
  it('does not render the indicator chip', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('does not render the overlay layer', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-overlay-hover')).toBeNull()
    expect(screen.queryByTestId('qa-overlay-pinned')).toBeNull()
  })

  it('does not add data-qa-target attributes to host elements', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    const host = screen.getByTestId('host')
    expect(host.getAttribute('data-qa-target')).toBeNull()
    expect(host.getAttribute('data-qa-precision')).toBeNull()
    expect(host.getAttribute('data-qa-label')).toBeNull()
  })

  it('does not attach a global pointermove listener (clicking does not pin)', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    fireEvent.pointerMove(screen.getByTestId('host'))
    fireEvent.click(screen.getByTestId('host'))
    expect(screen.queryByTestId('qa-composer')).toBeNull()
    expect(screen.queryByTestId('qa-preview')).toBeNull()
  })

  it('does not set the data-qa-mode attribute on the document root', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(document.documentElement.getAttribute('data-qa-mode')).toBeNull()
  })

  it('renders children identically with and without the provider', () => {
    function StaticChild() {
      return (
        <div>
          <h1>Hello</h1>
          <HostedTarget />
        </div>
      )
    }
    const { container: bare } = render(<StaticChild />)
    const bareHtml = bare.innerHTML
    cleanup()
    const { container: wrapped } = render(
      <QaFeedbackProvider>
        <StaticChild />
      </QaFeedbackProvider>,
    )
    // The provider only inserts overlay/composer/indicator nodes when QA mode
    // is enabled. With the flag off, the children HTML must be identical.
    expect(wrapped.innerHTML).toBe(bareHtml)
  })

  it('does not call sessionStorage.setItem with the QA key when disabled', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    const qaWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.includes('qa-feedback'),
    )
    expect(qaWrites).toEqual([])
    setItemSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Section-precision hook + qaTargetAttrs helper — regression coverage for
// the Phase 3 review notes:
//   1. `useFeedbackTarget({precision: 'section'})` must auto-emit
//      `data-qa-section="true"` (not just `data-qa-precision="section"`),
//      otherwise resolveTarget classified the site as exact/nested.
//   2. Sites that emit `data-qa-target` raw (loops, dynamic ids) must gate
//      the attribute behind QA mode via `qaTargetAttrs`, otherwise the
//      attributes leak into non-QA sessions.
// ---------------------------------------------------------------------------

describe('useFeedbackTarget — section precision emits both attrs', () => {
  function SectionHost() {
    const { targetProps } = useFeedbackTarget({
      id: 'legal.footer.container',
      precision: 'section',
    })
    return (
      <footer data-testid="section-host" {...targetProps}>
        Footer
      </footer>
    )
  }

  beforeEach(() => {
    window.history.replaceState(null, '', '/?qa=1')
  })

  it('emits both data-qa-precision="section" AND data-qa-section="true" when QA is on', () => {
    render(
      <QaFeedbackProvider>
        <SectionHost />
      </QaFeedbackProvider>,
    )
    const host = screen.getByTestId('section-host')
    expect(host.getAttribute('data-qa-target')).toBe('legal.footer.container')
    expect(host.getAttribute('data-qa-precision')).toBe('section')
    expect(host.getAttribute('data-qa-section')).toBe('true')
  })
})

describe('qaTargetAttrs — synchronous helper for loops/maps', () => {
  it('returns empty object when QA mode is disabled (inert)', () => {
    const attrs = qaTargetAttrs(false, {
      id: 'results.detailComparisonTable.rowGroup.bav',
    })
    expect(attrs).toEqual({})
  })

  it('returns full attribute bag when QA mode is enabled', () => {
    const attrs = qaTargetAttrs(true, {
      id: 'workspace.tabs.vergleich',
      label: 'Vergleich',
    })
    expect(attrs['data-qa-target']).toBe('workspace.tabs.vergleich')
    expect(attrs['data-qa-precision']).toBe('exact')
    expect(attrs['data-qa-label']).toBe('Vergleich')
    expect(attrs['data-qa-section']).toBeUndefined()
  })

  it('emits data-qa-section when precision is "section"', () => {
    const attrs = qaTargetAttrs(true, {
      id: 'inputs.section',
      precision: 'section',
    })
    expect(attrs['data-qa-section']).toBe('true')
    expect(attrs['data-qa-precision']).toBe('section')
  })

  it('emits data-qa-sensitive when sensitive is true', () => {
    const attrs = qaTargetAttrs(true, {
      id: 'inputs.profile.grossSalary',
      sensitive: true,
    })
    expect(attrs['data-qa-sensitive']).toBe('true')
  })
})

describe('qaTargetAttrs in JSX (loops/maps) — inert when QA off', () => {
  function TabsHost({ qaEnabled }: { qaEnabled: boolean }) {
    const tabs = ['vergleich', 'angebot', 'details'] as const
    return (
      <nav>
        {tabs.map((id) => (
          <button
            key={id}
            data-testid={`tab-${id}`}
            {...qaTargetAttrs(qaEnabled, { id: `workspace.tabs.${id}` })}
          >
            {id}
          </button>
        ))}
      </nav>
    )
  }

  it('does not emit data-qa-target when QA mode is off', () => {
    render(<TabsHost qaEnabled={false} />)
    expect(screen.getByTestId('tab-vergleich').hasAttribute('data-qa-target')).toBe(false)
    expect(screen.getByTestId('tab-angebot').hasAttribute('data-qa-target')).toBe(false)
    expect(screen.getByTestId('tab-details').hasAttribute('data-qa-target')).toBe(false)
  })

  it('emits per-row data-qa-target when QA mode is on', () => {
    render(<TabsHost qaEnabled={true} />)
    expect(screen.getByTestId('tab-vergleich').getAttribute('data-qa-target')).toBe(
      'workspace.tabs.vergleich',
    )
    expect(screen.getByTestId('tab-angebot').getAttribute('data-qa-target')).toBe(
      'workspace.tabs.angebot',
    )
    expect(screen.getByTestId('tab-details').getAttribute('data-qa-target')).toBe(
      'workspace.tabs.details',
    )
  })
})
