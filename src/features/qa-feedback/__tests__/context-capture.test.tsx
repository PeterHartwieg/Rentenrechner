// @vitest-environment jsdom

/**
 * context-capture.test.tsx — Lane D / issue 05
 *
 * Verifies that `activeView` from the workspace context ref reaches the
 * rendered markdown in the QaPreview metadata grid and in the markdown output.
 *
 * Covers representative views: vergleich (comparison), angebot (offer/inputs),
 * details (details/export).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaPreview } from '../QaPreview'
import type { ResolvedTarget } from '../report'
import type { ComposerDraft } from '../QaComposer'
import type { WorkspaceContext } from '../report/types'

const TARGET: ResolvedTarget = {
  id: 'inputs.bav.employerSubsidy.label',
  precision: 'exact',
}

const DRAFT: ComposerDraft = {
  type: 'layout',
  severity: 'minor',
  comment: 'Alignment looks off.',
  suggestedText: '',
  includeScreenshot: false,
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

function getMarkdown(): string {
  const pre = document.querySelector('details pre')
  return pre?.textContent ?? ''
}

function renderWithView(activeView: string, extras?: Partial<WorkspaceContext>) {
  const ctx: WorkspaceContext = { activeView, ...extras }
  return render(
    <QaPreview
      target={TARGET}
      draft={DRAFT}
      screenshot={null}
      onBack={() => undefined}
      onCancel={() => undefined}
      collectWorkspaceContext={() => ctx}
    />,
  )
}

describe('context-capture — activeView in metadata grid', () => {
  it('shows activeView=vergleich in the metadata grid', () => {
    renderWithView('vergleich')
    expect(screen.getByText('vergleich')).toBeTruthy()
  })

  it('shows activeView=angebot in the metadata grid', () => {
    renderWithView('angebot')
    expect(screen.getByText('angebot')).toBeTruthy()
  })

  it('shows activeView=details in the metadata grid', () => {
    renderWithView('details')
    expect(screen.getByText('details')).toBeTruthy()
  })

  it('renders — when activeView is undefined', () => {
    render(
      <QaPreview
        target={TARGET}
        draft={DRAFT}
        screenshot={null}
        onBack={() => undefined}
        onCancel={() => undefined}
        collectWorkspaceContext={() => ({})}
      />,
    )
    // Should still render the row label.
    expect(screen.getByText('Aktive Ansicht')).toBeTruthy()
  })
})

describe('context-capture — workspace context in markdown', () => {
  it('includes the workspace-context section in markdown when activeView is set', () => {
    renderWithView('vergleich', { mode: 'compare' })
    // Open the markdown details panel.
    const summary = screen.getByText('Markdown anzeigen')
    fireEvent.click(summary)
    const md = getMarkdown()
    expect(md).toContain('## Workspace context')
    expect(md).toContain('Active view: `vergleich`')
    expect(md).toContain('Mode: `compare`')
  })

  it('omits the workspace-context section when all fields are undefined', () => {
    render(
      <QaPreview
        target={TARGET}
        draft={DRAFT}
        screenshot={null}
        onBack={() => undefined}
        onCancel={() => undefined}
        collectWorkspaceContext={() => ({})}
      />,
    )
    const summary = screen.getByText('Markdown anzeigen')
    fireEvent.click(summary)
    const md = getMarkdown()
    expect(md).not.toContain('## Workspace context')
  })

  it('includes activeProductId in markdown when provided', () => {
    renderWithView('angebot', { activeProductId: 'bav' })
    const summary = screen.getByText('Markdown anzeigen')
    fireEvent.click(summary)
    const md = getMarkdown()
    expect(md).toContain('Active product: `bav`')
  })

  it('includes flow in markdown when provided', () => {
    renderWithView('details', { flow: 'dialog: Riester Details' })
    const summary = screen.getByText('Markdown anzeigen')
    fireEvent.click(summary)
    const md = getMarkdown()
    expect(md).toContain('Flow: dialog: Riester Details')
  })
})

describe('context-capture — precision in metadata grid', () => {
  it('shows exact precision in the metadata grid', () => {
    renderWithView('vergleich')
    expect(screen.getByText('exact')).toBeTruthy()
  })

  it('shows nested precision in the metadata grid', () => {
    render(
      <QaPreview
        target={{ ...TARGET, precision: 'nested' }}
        draft={DRAFT}
        screenshot={null}
        onBack={() => undefined}
        onCancel={() => undefined}
      />,
    )
    expect(screen.getByText('nested')).toBeTruthy()
  })

  it('shows section precision in the metadata grid', () => {
    render(
      <QaPreview
        target={{ ...TARGET, precision: 'section' }}
        draft={DRAFT}
        screenshot={null}
        onBack={() => undefined}
        onCancel={() => undefined}
      />,
    )
    expect(screen.getByText('section')).toBeTruthy()
  })
})
