// @vitest-environment jsdom

/**
 * VergleichProContraGrid tests (R1 — issue #319).
 *
 * Coverage:
 *   - Renders one card per product id
 *   - Each card has a PRO and a CONTRA section with the registry's
 *     short label
 *   - CONTRA strong tag is the only oxblood label (verified by class hook)
 *   - Empty products array returns null
 *   - Unknown product id is silently dropped (defensive: getProductMeta can
 *     return undefined per the CLAUDE.md gotcha)
 *   - Renders without throwing on the canonical 6-product list
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { VergleichProContraGrid } from './VergleichProContraGrid'
import type { ProductId } from '../../domain'
import { PRODUCT_IDS } from '../../engine/productRegistry'

afterEach(() => {
  cleanup()
})

describe('VergleichProContraGrid', () => {
  it('renders one card per visible product', () => {
    const products: ProductId[] = ['etf', 'bav', 'versicherung']
    const { container } = render(<VergleichProContraGrid products={products} />)
    const cards = container.querySelectorAll('.vergleich-pro-contra-card')
    expect(cards.length).toBe(3)
  })

  it('each card carries a data-product attribute keyed by ProductId', () => {
    const products: ProductId[] = ['etf', 'bav']
    const { container } = render(<VergleichProContraGrid products={products} />)
    const cards = container.querySelectorAll<HTMLElement>('.vergleich-pro-contra-card')
    expect(cards[0].dataset.product).toBe('etf')
    expect(cards[1].dataset.product).toBe('bav')
  })

  it('each card has a PRO and a CONTRA row', () => {
    const { container } = render(<VergleichProContraGrid products={['etf']} />)
    const pro = container.querySelector('.vergleich-pro-contra-card__row--pro')
    const contra = container.querySelector('.vergleich-pro-contra-card__row--contra')
    expect(pro).not.toBeNull()
    expect(contra).not.toBeNull()
    expect(pro!.textContent).toMatch(/PRO/)
    expect(contra!.textContent).toMatch(/CONTRA/)
  })

  it('CONTRA label is the row in the oxblood class hook (not PRO)', () => {
    const { container } = render(<VergleichProContraGrid products={['etf']} />)
    const contraRow = container.querySelector('.vergleich-pro-contra-card__row--contra')
    expect(contraRow).not.toBeNull()
    // The CSS rule `.vergleich-pro-contra-card__row--contra strong { color: var(--rw-accent) }`
    // covers exactly the CONTRA strong tag. Verify it exists.
    const contraStrong = contraRow!.querySelector('strong')
    expect(contraStrong).not.toBeNull()
    expect(contraStrong!.textContent).toBe('CONTRA')
  })

  it('returns null on empty products', () => {
    const { container } = render(<VergleichProContraGrid products={[]} />)
    expect(container.querySelector('.vergleich-pro-contra-grid')).toBeNull()
  })

  it('silently drops unknown product ids (getProductMeta returns undefined)', () => {
    // ProductId is derived from PRODUCT_REGISTRY literals — a synthetic unknown
    // id must be cast through `unknown` to reach the prop without widening the
    // canonical union elsewhere.
    const products = ['etf', 'made-up-id' as unknown as ProductId] as ProductId[]
    const { container } = render(<VergleichProContraGrid products={products} />)
    const cards = container.querySelectorAll('.vergleich-pro-contra-card')
    expect(cards.length).toBe(1)
    expect((cards[0] as HTMLElement).dataset.product).toBe('etf')
  })

  it('renders without throwing for all six registered products', () => {
    const { container } = render(<VergleichProContraGrid products={PRODUCT_IDS} />)
    const cards = container.querySelectorAll('.vergleich-pro-contra-card')
    expect(cards.length).toBe(PRODUCT_IDS.length)
  })
})
