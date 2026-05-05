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
import { renderAtom } from '../../content/recommendationCopy'
import {
  pavDraftVintageAtoms,
  bavDraftVintageAtoms,
  riesterDraftVintageAtoms,
} from './vintageChipsUtils'
import type { BavDraft, PavDraft, RiesterDraft } from './types'

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

// ---------------------------------------------------------------------------
// F5 — wizard draft preview tests
// ---------------------------------------------------------------------------

describe('VintageChips — wizard draft preview (F5)', () => {
  afterEach(cleanup)

  it('renders a privilege chip for a pAV draft with contractStartYear <= 2004', () => {
    const draft: PavDraft = {
      productId: 'versicherung',
      status: 'active',
      contractStartYear: 2003,
      monthlyContribution: 150,
      effektivkostenPct: 1.0,
      rentenfaktor: 28,
      payoutMode: 'leibrente',
    }
    const atoms = pavDraftVintageAtoms(draft, 40, 67)
    // Must produce at least one chip (pre_2005_pav_taxfree_capital and/or pre_2005_pav_high_garantiezins)
    expect(atoms.length).toBeGreaterThan(0)
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip')).not.toBeNull()
    // pre_2005_pav_taxfree_capital is a privilege chip
    expect(container.querySelector('.vintage-chip--privilege')).not.toBeNull()
    // Chip headline must match what the dashboard renders for the same atom id
    const pre2005Atom = atoms.find((a) => a.id === 'pre_2005_pav_taxfree_capital')
    expect(pre2005Atom).toBeDefined()
    const { headline } = renderAtom(pre2005Atom!)
    const chipLabel = container.querySelector('.vintage-chip-label')?.textContent
    expect(chipLabel).toBe(headline)
  })

  it('pavDraftVintageAtoms returns empty array for a post-2004 contract near retirement (runtime < 12 years)', () => {
    // With PREVIEW defaults: retirementYear = RULES_YEAR + (67 - 35).
    // For runtime < 12: contractStartYear must be > retirementYear - 12.
    // Using 2060 is well past the boundary — runtime < 0 → no halbeinkuenfte, not pre2005.
    const draft: PavDraft = {
      productId: 'versicherung',
      status: 'active',
      contractStartYear: 2060,
      monthlyContribution: 100,
      effektivkostenPct: 0.5,
      rentenfaktor: 28,
      payoutMode: 'leibrente',
    }
    const atoms = pavDraftVintageAtoms(draft, 40, 67)
    // No vintage conditions met → no atoms → VintageChips renders null
    expect(atoms).toHaveLength(0)
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a privilege chip for a bAV draft with direktversicherung_40b_alt and contractStartYear <= 2004', () => {
    const draft: BavDraft = {
      productId: 'bav',
      status: 'paid_up',
      contractStartYear: 2001,
      monthlyContribution: 0,
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      effektivkostenPct: 1.2,
      rentenfaktor: 28,
      payoutMode: 'leibrente',
    }
    const atoms = bavDraftVintageAtoms(draft, 40, 67)
    expect(atoms).toHaveLength(1)
    expect(atoms[0].id).toBe('bav_40b_alt_eligible')
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip--privilege')).not.toBeNull()
    // Chip text is identical to what the dashboard's atom renderer produces
    const { headline } = renderAtom(atoms[0])
    expect(container.querySelector('.vintage-chip-label')?.textContent).toBe(headline)
  })

  it('renders no chip for a standard direktversicherung_3_63 bAV draft', () => {
    const draft: BavDraft = {
      productId: 'bav',
      status: 'active',
      contractStartYear: 2020,
      monthlyContribution: 200,
      durchfuehrungsweg: 'direktversicherung_3_63',
      effektivkostenPct: 0.8,
      rentenfaktor: 30,
      payoutMode: 'leibrente',
    }
    const atoms = bavDraftVintageAtoms(draft, 40, 67)
    expect(atoms).toHaveLength(0)
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a caveat chip for a Riester draft before 2008 when profile has a post-2007 child', () => {
    const draft: RiesterDraft = {
      productId: 'riester',
      status: 'active',
      contractStartYear: 2005,
      monthlyContribution: 100,
      payoutMode: 'leibrente',
      zulageStatus: '',
    }
    const atoms = riesterDraftVintageAtoms(draft, [2010], 40, 67)
    expect(atoms).toHaveLength(1)
    expect(atoms[0].id).toBe('riester_pre_2008_zulage')
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip--caveat')).not.toBeNull()
    const { headline } = renderAtom(atoms[0])
    expect(container.querySelector('.vintage-chip-label')?.textContent).toBe(headline)
  })

  it('renders no chip for a Riester draft before 2008 when no post-2007 children', () => {
    const draft: RiesterDraft = {
      productId: 'riester',
      status: 'active',
      contractStartYear: 2005,
      monthlyContribution: 100,
      payoutMode: 'leibrente',
      zulageStatus: '',
    }
    const atoms = riesterDraftVintageAtoms(draft, [2005], 40, 67) // child born 2005, before 2008
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a privilege chip (halbeinkuenfte) for a post-2004 pAV draft with sufficient runtime and retirementAge >= 62', () => {
    // contractStartYear=2010, age=40, retirementAge=67, RULES_YEAR=2026
    // retirementYear = 2026 + (67 - 40) = 2053
    // runtimeYears = 2053 - 2010 = 43 → >= 12 (halbeinkuenfte min)
    // retirementAge 67 >= 62 (halbeinkuenfte min age)
    // contractStartYear 2010 > 2004 → NOT pre2005 → routes to 'halbeinkuenfte'
    const draft: PavDraft = {
      productId: 'versicherung',
      status: 'active',
      contractStartYear: 2010,
      monthlyContribution: 150,
      effektivkostenPct: 0.8,
      rentenfaktor: 28,
      payoutMode: 'kapitalverzehr',
    }
    const atoms = pavDraftVintageAtoms(draft, 40, 67)
    expect(atoms).toHaveLength(1)
    expect(atoms[0].id).toBe('halbeinkuenfte_pav_eligible')
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip--privilege')).not.toBeNull()
    const { headline } = renderAtom(atoms[0])
    expect(container.querySelector('.vintage-chip-label')?.textContent).toBe(headline)
  })

  it('renders an info chip for a bAV draft with direktzusage', () => {
    const draft: BavDraft = {
      productId: 'bav',
      status: 'active',
      contractStartYear: 2015,
      monthlyContribution: 300,
      durchfuehrungsweg: 'direktzusage',
      effektivkostenPct: 0,
      rentenfaktor: 30,
      payoutMode: 'leibrente',
    }
    const atoms = bavDraftVintageAtoms(draft, 40, 67)
    expect(atoms).toHaveLength(1)
    expect(atoms[0].id).toBe('bav_durchfuehrungsweg_direktzusage')
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip--info')).not.toBeNull()
    const { headline } = renderAtom(atoms[0])
    expect(container.querySelector('.vintage-chip-label')?.textContent).toBe(headline)
  })

  it('renders a caveat chip for a bAV draft with direktversicherung_40b_alt when conditions are unmet (post-2004)', () => {
    // contractStartYear=2006 > 2004 → pre2005EligibleTaxFree=false
    // deriveBavLumpSumTaxMode('direktversicherung_40b_alt', false) → 'voll_versorgungsbezug'
    // lumpSumTaxMode !== 'pre2005_steuerfrei' → bav_40b_alt_conditions_unmet
    const draft: BavDraft = {
      productId: 'bav',
      status: 'active',
      contractStartYear: 2006,
      monthlyContribution: 150,
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      effektivkostenPct: 1.0,
      rentenfaktor: 28,
      payoutMode: 'leibrente',
    }
    const atoms = bavDraftVintageAtoms(draft, 40, 67)
    expect(atoms).toHaveLength(1)
    expect(atoms[0].id).toBe('bav_40b_alt_conditions_unmet')
    const { container } = render(<VintageChips atoms={atoms} />)
    expect(container.querySelector('.vintage-chip--caveat')).not.toBeNull()
    const { headline } = renderAtom(atoms[0])
    expect(container.querySelector('.vintage-chip-label')?.textContent).toBe(headline)
  })
})
