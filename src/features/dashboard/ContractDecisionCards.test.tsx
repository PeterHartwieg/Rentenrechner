// @vitest-environment jsdom
/**
 * Fixture tests for ContractDecisionCards (B5).
 *
 * Asserts:
 *   - Renders 4 decision cards with correct kind classes.
 *   - No delta chip area when deltaByDecisionId is undefined.
 *   - Delta chips rendered (numeric / pending) when deltaByDecisionId is provided.
 *   - Weiterfuehren card has no checkbox.
 *   - onToggle is called when a checkbox is clicked.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { ContractDecisionCards } from './ContractDecisionCards'
import type { ContractDecisionCardsProps } from './ContractDecisionCards'
import type { ContractDecision } from '../../app/contractDecisions'
import { DECISION_KIND_DESCRIPTIONS } from '../../content/optimiereCopy'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

// ---------------------------------------------------------------------------
// 4-decision fixture
// ---------------------------------------------------------------------------

const weiterfuehrenId = 'weiterfuehren-inst-1'
const beitragsfreibId = 'beitragsfrei-inst-1'
const kuendigenId = 'kuendigen-inst-1'
const uebertragenId = 'uebertragen-inst-1-to-inst-2'

const FIXTURE_DECISIONS: ContractDecision[] = [
  {
    id: weiterfuehrenId,
    kind: 'weiterfuehren',
    label: 'Weiterführen',
    sourceInstanceId: 'inst-1',
    description: 'Vertrag wie bisher weiterführen.',
    workspaceDelta: { kind: 'identity' },
    deltaNettoRente: 0,
    atoms: [
      {
        id: 'pre_2005_pav_taxfree_capital',
        priority: 'high',
        context: {},
      },
    ],
  },
  {
    id: beitragsfreibId,
    kind: 'beitragsfrei',
    label: 'Beitragsfrei stellen',
    sourceInstanceId: 'inst-1',
    description: 'Keine weiteren Beiträge zahlen.',
    workspaceDelta: { kind: 'paid_up', instanceId: 'inst-1', paidUpAtAge: 50 },
    deltaNettoRente: -10,
    atoms: [
      {
        id: 'paid_up_high_fee_warning',
        priority: 'medium',
        context: {},
      },
    ],
  },
  {
    id: kuendigenId,
    kind: 'kuendigen',
    label: 'Kündigen',
    sourceInstanceId: 'inst-1',
    description: 'Vertrag kündigen und Rückkaufswert auszahlen lassen.',
    workspaceDelta: { kind: 'surrender', instanceId: 'inst-1', haircutPct: 0.1 },
    deltaNettoRente: -50,
    atoms: [
      {
        id: 'lose_pre_2005_privilege',
        priority: 'high',
        context: {},
      },
    ],
  },
  {
    id: uebertragenId,
    kind: 'uebertragen',
    label: 'Übertragen',
    sourceInstanceId: 'inst-1',
    targetInstanceId: 'inst-2',
    description: 'Guthaben auf anderen Vertrag übertragen.',
    workspaceDelta: {
      kind: 'transfer',
      sourceInstanceId: 'inst-1',
      targetInstanceId: 'inst-2',
      amountEUR: 'all',
      type: 'surrender_reinvest',
    },
    deltaNettoRente: 5,
    atoms: [
      {
        id: 'reason_low_fees',
        priority: 'low',
        context: {},
      },
    ],
  },
]

function renderCards(overrides: Partial<ContractDecisionCardsProps> = {}) {
  const props: ContractDecisionCardsProps = {
    decisions: FIXTURE_DECISIONS,
    checkedIds: new Set(),
    onToggle: vi.fn(),
    ...overrides,
  }
  return render(<ContractDecisionCards {...props} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContractDecisionCards', () => {
  it('renders a card with class contract-decision-card--kuendigen', () => {
    const { container } = renderCards()
    expect(container.querySelector('.contract-decision-card--kuendigen')).toBeTruthy()
  })

  it('renders all 4 decision cards', () => {
    const { container } = renderCards()
    const cards = container.querySelectorAll('.contract-decision-card')
    expect(cards).toHaveLength(4)
  })

  it('renders cards with correct kind-specific classes', () => {
    const { container } = renderCards()
    expect(container.querySelector('.contract-decision-card--weiterfuehren')).toBeTruthy()
    expect(container.querySelector('.contract-decision-card--beitragsfrei')).toBeTruthy()
    expect(container.querySelector('.contract-decision-card--kuendigen')).toBeTruthy()
    expect(container.querySelector('.contract-decision-card--uebertragen')).toBeTruthy()
  })

  it('weiterfuehren card has no checkbox', () => {
    const { container } = renderCards()
    const weiterfuehrenCard = container.querySelector('.contract-decision-card--weiterfuehren')
    expect(weiterfuehrenCard).toBeTruthy()
    const checkbox = weiterfuehrenCard!.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeNull()
  })

  it('non-weiterfuehren cards have checkboxes', () => {
    const { container } = renderCards()
    const checkboxes = container.querySelectorAll('.contract-decision-checkbox input[type="checkbox"]')
    // 3 non-weiterfuehren cards
    expect(checkboxes).toHaveLength(3)
  })

  it('onToggle is called with the decision id when a checkbox is clicked', () => {
    const onToggle = vi.fn()
    const { container } = renderCards({ onToggle })
    const checkboxes = container.querySelectorAll('.contract-decision-checkbox input[type="checkbox"]')
    fireEvent.click(checkboxes[0])
    expect(onToggle).toHaveBeenCalledOnce()
    // The first non-weiterfuehren decision is beitragsfrei
    expect(onToggle).toHaveBeenCalledWith(beitragsfreibId)
  })

  it('checked state is reflected on the checkbox', () => {
    const { container } = renderCards({ checkedIds: new Set([beitragsfreibId]) })
    const beitragsfreibCard = container.querySelector('.contract-decision-card--beitragsfrei')
    const checkbox = beitragsfreibCard!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  // ── Delta chip: undefined (regression-safety for per-instance menu) ──

  it('renders no delta chip area when deltaByDecisionId is undefined', () => {
    const { container } = renderCards({ deltaByDecisionId: undefined })
    const chips = container.querySelectorAll('.contract-decision-delta-chip')
    expect(chips).toHaveLength(0)
  })

  it('renders no delta chip area when deltaByDecisionId is {} (empty map)', () => {
    const { container } = renderCards({ deltaByDecisionId: {} })
    const chips = container.querySelectorAll('.contract-decision-delta-chip')
    expect(chips).toHaveLength(0)
  })

  // ── Delta chip: numeric and pending ──

  it('beitragsfrei card shows numeric delta chip when deltaByDecisionId contains its id', () => {
    const { container } = renderCards({
      deltaByDecisionId: {
        [beitragsfreibId]: -23,
        [kuendigenId]: 'pending',
      },
    })
    const beitragsfreibCard = container.querySelector('.contract-decision-card--beitragsfrei')
    const chip = beitragsfreibCard!.querySelector('.contract-decision-delta-chip')
    expect(chip).toBeTruthy()
    // Should show a formatted negative value
    expect(chip!.textContent).toMatch(/−23|−\s*23|-23/)
    expect(chip!.className).toContain('contract-decision-delta-chip--negative')
  })

  it('kuendigen card shows loading indicator when value is pending', () => {
    const { container } = renderCards({
      deltaByDecisionId: {
        [beitragsfreibId]: -23,
        [kuendigenId]: 'pending',
      },
    })
    const kuendigenCard = container.querySelector('.contract-decision-card--kuendigen')
    const chip = kuendigenCard!.querySelector('.contract-decision-delta-chip')
    expect(chip).toBeTruthy()
    expect(chip!.className).toContain('contract-decision-delta-chip--pending')
  })

  it('positive delta chip carries --positive class', () => {
    const { container } = renderCards({
      deltaByDecisionId: { [uebertragenId]: 42 },
    })
    const uebertragenCard = container.querySelector('.contract-decision-card--uebertragen')
    const chip = uebertragenCard!.querySelector('.contract-decision-delta-chip')
    expect(chip).toBeTruthy()
    expect(chip!.className).toContain('contract-decision-delta-chip--positive')
  })

  it('error value shows error indicator chip', () => {
    const { container } = renderCards({
      deltaByDecisionId: { [kuendigenId]: 'error' },
    })
    const kuendigenCard = container.querySelector('.contract-decision-card--kuendigen')
    const chip = kuendigenCard!.querySelector('.contract-decision-delta-chip')
    expect(chip).toBeTruthy()
    expect(chip!.className).toContain('contract-decision-delta-chip--error')
  })

  it('weiterfuehren card has no delta chip when its id is not in deltaByDecisionId', () => {
    const { container } = renderCards({
      deltaByDecisionId: { [beitragsfreibId]: -5 },
    })
    const weiterfuehrenCard = container.querySelector('.contract-decision-card--weiterfuehren')
    const chip = weiterfuehrenCard!.querySelector('.contract-decision-delta-chip')
    expect(chip).toBeNull()
  })

  // ── Atom chips ──

  it('renders atom chips for cards that have atoms', () => {
    const { container } = renderCards()
    const atoms = container.querySelectorAll('.contract-decision-atom')
    expect(atoms.length).toBeGreaterThan(0)
  })

  // ── DECISION_KIND_DESCRIPTIONS fallback ──

  it('falls back to DECISION_KIND_DESCRIPTIONS when decision.description is empty', () => {
    const decisionsWithEmptyDescription: ContractDecision[] = [
      {
        ...FIXTURE_DECISIONS[2], // kuendigen
        description: '',
      },
    ]
    const { container } = render(
      <ContractDecisionCards
        decisions={decisionsWithEmptyDescription}
        checkedIds={new Set()}
        onToggle={vi.fn()}
      />,
    )
    const descEl = container.querySelector('.contract-decision-description')
    expect(descEl).toBeTruthy()
    expect(descEl!.textContent).toBe(DECISION_KIND_DESCRIPTIONS['kuendigen'])
  })

  it('uses decision.description when present (not the kind-level fallback)', () => {
    const { container } = renderCards()
    const kuendigenCard = container.querySelector('.contract-decision-card--kuendigen')
    const descEl = kuendigenCard!.querySelector('.contract-decision-description')
    expect(descEl).toBeTruthy()
    expect(descEl!.textContent).toBe('Vertrag kündigen und Rückkaufswert auszahlen lassen.')
  })

  it('PR 11 viewport sweep — all 4 decision cards render at phone / tablet / desktop', () => {
    eachViewport(() => {
      const { container, unmount } = render(
        <ContractDecisionCards
          decisions={FIXTURE_DECISIONS}
          checkedIds={new Set()}
          onToggle={vi.fn()}
        />,
      )
      const cards = container.querySelectorAll('.contract-decision-card')
      expect(cards).toHaveLength(4)
      unmount()
    })
  })
})
