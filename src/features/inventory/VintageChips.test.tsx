// @vitest-environment jsdom
/**
 * Component render tests for VintageChips.
 *
 * Uses jsdom + @testing-library/react per the M2 sidebar test pattern.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { VintageChips } from './VintageChips'
import type { Atom } from '../../app/recommendations'

afterEach(cleanup)

function makeAtom(id: Atom['id'], instanceId = 'inst-1'): Atom {
  return { id, priority: 'high', context: { instanceId, productId: 'bav' } }
}

describe('VintageChips', () => {
  it('renders nothing when atoms array is empty', () => {
    const { container } = render(<VintageChips atoms={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when atoms contain no vintage ids', () => {
    const atoms: Atom[] = [
      { id: 'reason_employer_subsidy', priority: 'high', context: { instanceId: 'inst-1' } },
    ]
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one chip per vintage atom', () => {
    const atoms: Atom[] = [
      makeAtom('bav_40b_alt_eligible'),
      makeAtom('bav_40b_alt_conditions_unmet'),
    ]
    const { container } = render(<VintageChips atoms={atoms} />)
    const chips = container.querySelectorAll('.vintage-chip')
    expect(chips).toHaveLength(2)
  })

  it('privilege chip gets --privilege variant class', () => {
    const { container } = render(
      <VintageChips atoms={[makeAtom('pre_2005_pav_taxfree_capital')]} />,
    )
    expect(container.querySelector('.vintage-chip--privilege')).not.toBeNull()
  })

  it('caveat chip gets --caveat variant class', () => {
    const { container } = render(
      <VintageChips atoms={[makeAtom('bav_40b_alt_conditions_unmet')]} />,
    )
    expect(container.querySelector('.vintage-chip--caveat')).not.toBeNull()
  })

  it('info chip gets --info variant class', () => {
    const { container } = render(
      <VintageChips atoms={[makeAtom('bav_durchfuehrungsweg_direktzusage')]} />,
    )
    expect(container.querySelector('.vintage-chip--info')).not.toBeNull()
  })

  it('filters non-vintage atoms from the same array', () => {
    const atoms: Atom[] = [
      makeAtom('bav_40b_alt_eligible'),
      { id: 'sensitivity_default', priority: 'low', context: { text: 'test' } },
    ]
    const { container } = render(<VintageChips atoms={atoms} />)
    const chips = container.querySelectorAll('.vintage-chip')
    expect(chips).toHaveLength(1)
    expect(container.querySelector('.vintage-chip--privilege')).not.toBeNull()
  })

  it('renders all seven vintage atom id variants', () => {
    const atoms: Atom[] = [
      makeAtom('pre_2005_pav_taxfree_capital', 'i1'),
      makeAtom('halbeinkuenfte_pav_eligible', 'i2'),
      makeAtom('pre_2005_pav_high_garantiezins', 'i3'),
      makeAtom('bav_40b_alt_eligible', 'i4'),
      makeAtom('bav_40b_alt_conditions_unmet', 'i5'),
      makeAtom('bav_durchfuehrungsweg_direktzusage', 'i6'),
      makeAtom('riester_pre_2008_zulage', 'i7'),
    ]
    const { container } = render(<VintageChips atoms={atoms} />)
    const chips = container.querySelectorAll('.vintage-chip')
    expect(chips).toHaveLength(7)
    expect(container.querySelectorAll('.vintage-chip--privilege')).toHaveLength(3)
    expect(container.querySelectorAll('.vintage-chip--caveat')).toHaveLength(3)
    expect(container.querySelectorAll('.vintage-chip--info')).toHaveLength(1)
  })
})
