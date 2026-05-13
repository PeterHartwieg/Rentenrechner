// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALL_VERGLEICH_PANES, type VergleichPaneSlug } from './vergleichPanes'
import { VergleichSidebar } from './VergleichSidebar'

afterEach(() => cleanup())

describe('VergleichSidebar overview pane (#241)', () => {
  it('registers ueberblick as a deep-linkable pane slug', () => {
    expect(ALL_VERGLEICH_PANES).toContain('ueberblick')
  })

  it('selects ueberblick from the sidebar overview entry', () => {
    const onPaneChange = vi.fn()
    const { getByRole } = render(
      <VergleichSidebar
        activePane={'ueberblick' as unknown as VergleichPaneSlug}
        onPaneChange={onPaneChange}
        bavVisible={true}
      />,
    )

    fireEvent.click(getByRole('button', { name: 'Überblick' }))

    expect(onPaneChange).toHaveBeenCalledWith('ueberblick')
  })
})
