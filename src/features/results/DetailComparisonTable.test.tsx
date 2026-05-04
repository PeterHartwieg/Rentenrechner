// @vitest-environment jsdom
/**
 * Render tests for DetailComparisonTable (Group G issue 26).
 *
 * Coverage:
 *   - share button is absent when onCopyLink is undefined (combine mode guard)
 *   - share button is present when onCopyLink is provided (compare mode)
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { DetailComparisonTable } from './DetailComparisonTable'

afterEach(() => cleanup())

const emptyProps = {
  products: [],
  linkCopied: false,
  onExportCsv: vi.fn(),
  onPrint: vi.fn(),
}

describe('DetailComparisonTable share button visibility', () => {
  it('hides the "Link kopieren" button when onCopyLink is undefined (combine mode)', () => {
    const { queryByText } = render(
      <DetailComparisonTable {...emptyProps} />
    )
    expect(queryByText('Link kopieren')).toBeNull()
  })

  it('shows the "Link kopieren" button when onCopyLink is provided (compare mode)', () => {
    const { getByText } = render(
      <DetailComparisonTable {...emptyProps} onCopyLink={vi.fn()} />
    )
    expect(getByText('Link kopieren')).not.toBeNull()
  })

  it('shows "Kopiert!" label (not "Link kopieren") when linkCopied=true and onCopyLink is provided', () => {
    const { getByText, queryByText } = render(
      <DetailComparisonTable {...emptyProps} linkCopied={true} onCopyLink={vi.fn()} />
    )
    expect(getByText('Kopiert!')).not.toBeNull()
    expect(queryByText('Link kopieren')).toBeNull()
  })
})
