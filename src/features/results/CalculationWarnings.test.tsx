// @vitest-environment jsdom
/**
 * Failing test for #113: CalculationWarnings should group items under
 * three section headings by status (implementiert / vereinfacht / nicht-modelliert)
 * so users can quickly find what the calculator does NOT model.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CalculationWarnings } from './CalculationWarnings'
import { CALCULATION_WARNINGS } from '../../app/productPresentation'

afterEach(() => cleanup())

describe('CalculationWarnings grouping', () => {
  it('renders three status-group section headings', () => {
    const { container } = render(<CalculationWarnings />)

    // The component should render one heading per status group.
    // Acceptable heading text patterns (case-insensitive) for each group:
    const headings = Array.from(container.querySelectorAll('h3, [role="heading"], .warnings-group-heading'))
    expect(headings.length).toBeGreaterThanOrEqual(3)
  })

  it('places implementiert items under their group heading and not-modelled items under theirs', () => {
    const { container } = render(<CalculationWarnings />)

    const implementiertItems = CALCULATION_WARNINGS.filter((w) => w.status === 'implementiert')
    const nichtModelliertItems = CALCULATION_WARNINGS.filter((w) => w.status === 'nicht-modelliert')

    // There should be separate group containers for each status.
    const implementiertGroup = container.querySelector('[data-warning-group="implementiert"]')
    const nichtModelliertGroup = container.querySelector('[data-warning-group="nicht-modelliert"]')

    expect(implementiertGroup).not.toBeNull()
    expect(nichtModelliertGroup).not.toBeNull()

    // Items should live inside the correct group.
    if (implementiertItems.length > 0) {
      const categoryText = implementiertItems[0].category
      expect(implementiertGroup!.textContent).toContain(categoryText)
    }

    if (nichtModelliertItems.length > 0) {
      const categoryText = nichtModelliertItems[0].category
      expect(nichtModelliertGroup!.textContent).toContain(categoryText)
      // Must NOT appear in the implementiert group.
      expect(implementiertGroup!.textContent).not.toContain(categoryText)
    }
  })

  it('vereinfacht items are in their own group, not mixed with implementiert', () => {
    const { container } = render(<CalculationWarnings />)

    const vereinfachtItems = CALCULATION_WARNINGS.filter((w) => w.status === 'vereinfacht')
    const implementiertGroup = container.querySelector('[data-warning-group="implementiert"]')
    const vereinfachtGroup = container.querySelector('[data-warning-group="vereinfacht"]')

    expect(vereinfachtGroup).not.toBeNull()

    if (vereinfachtItems.length > 0) {
      const categoryText = vereinfachtItems[0].category
      expect(vereinfachtGroup!.textContent).toContain(categoryText)
      if (implementiertGroup) {
        expect(implementiertGroup.textContent).not.toContain(categoryText)
      }
    }
  })
})
