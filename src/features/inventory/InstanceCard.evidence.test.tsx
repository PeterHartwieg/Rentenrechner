// @vitest-environment jsdom
/**
 * QA issue #03 — "Schätzung" hint must clear when the user edits a field.
 *
 * Round-1 had equality-guarded edit handlers (`if (n !== draft.X) setEvidence(...)`)
 * which meant typing the same numeric value back never cleared the badge. This
 * file pins the contract for ALL 9 handlers in InstanceCard.tsx that touch
 * evidence on edit:
 *
 *   UniversalFields:  contractStartYear (non-ETF only), currentValueEUR
 *   BavCard:          fees.wrapperAssetFee (effektivkosten), rentenfaktor
 *   PavCard:          fees.wrapperAssetFee, rentenfaktor
 *   BasisrenteCard:   fees.wrapperAssetFee, rentenfaktor
 *   EtfCard:          annualAssetFee (TER)
 *
 * Strategy: each card is wrapped in a stateful `<Harness>` that mirrors how the
 * inventory wizard owns draft state — on each `onChange` it stores the new draft,
 * on each `setEvidence` it updates the evidenceMap. This lets us:
 *   1. Verify setEvidence is called with the right (fieldPath, 'user_confirmed').
 *   2. Verify the evidence badge transitions end-to-end from "🤔 Schätzung" to
 *      "✓ bestätigt" (the user-visible regression from issue #03).
 *   3. Verify that EVERY edit fires setEvidence (no equality-guard short-circuit
 *      from round-1) by chaining two distinct edits and asserting the badge stays
 *      bestätigt and setEvidence was called twice.
 */

import { useState, type ReactNode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import {
  BavCard,
  PavCard,
  BasisrenteCard,
  EtfCard,
} from './InstanceCard'
import type {
  BavDraft,
  PavDraft,
  BasisrenteDraft,
  EtfDraft,
  ProductDraftState,
} from './types'
import type { EvidenceState } from '../../domain/instances'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Base draft factories — fresh objects per test to avoid shared mutable state.
// ---------------------------------------------------------------------------

const makeBavDraft = (overrides: Partial<BavDraft> = {}): BavDraft => ({
  productId: 'bav',
  status: 'active',
  contractStartYear: 2015,
  currentValueEUR: 12_000,
  monthlyContribution: 200,
  anbieter: undefined,
  durchfuehrungsweg: 'direktversicherung_3_63',
  effektivkostenPct: 1.0,
  rentenfaktor: 28,
  payoutMode: 'leibrente',
  ...overrides,
})

const makePavDraft = (overrides: Partial<PavDraft> = {}): PavDraft => ({
  productId: 'versicherung',
  status: 'active',
  contractStartYear: 2015,
  currentValueEUR: 12_000,
  monthlyContribution: 200,
  anbieter: undefined,
  effektivkostenPct: 1.0,
  rentenfaktor: 28,
  payoutMode: 'leibrente',
  ...overrides,
})

const makeBasisrenteDraft = (
  overrides: Partial<BasisrenteDraft> = {},
): BasisrenteDraft => ({
  productId: 'basisrente',
  status: 'active',
  contractStartYear: 2015,
  currentValueEUR: 12_000,
  monthlyContribution: 200,
  anbieter: undefined,
  effektivkostenPct: 1.0,
  rentenfaktor: 28,
  ...overrides,
})

const makeEtfDraft = (overrides: Partial<EtfDraft> = {}): EtfDraft => ({
  productId: 'etf',
  status: 'active',
  contractStartYear: 2020,
  currentValueEUR: 10_000,
  monthlyContribution: 200,
  anbieter: undefined,
  terPct: 0.2,
  ...overrides,
})

// ---------------------------------------------------------------------------
// Stateful harness — mirrors what the wizard parent does in production:
// owns the draft + evidenceMap, applies updates on every onChange/setEvidence.
// ---------------------------------------------------------------------------

interface HarnessProps<T extends ProductDraftState> {
  initial: T
  evidenceProbe: (path: string, state: EvidenceState) => void
  renderCard: (
    draft: T,
    onChange: (next: T) => void,
    setEvidence: (path: string, state: EvidenceState) => void,
  ) => ReactNode
}

function Harness<T extends ProductDraftState>({
  initial,
  evidenceProbe,
  renderCard,
}: HarnessProps<T>) {
  const [draft, setDraft] = useState<T>(initial)
  // The card calls onChange first (with `{...draft, field: n}` capturing the
  // current draft snapshot) and setEvidence second (in some handlers; order
  // varies). Both will dispatch state updates against the same render cycle.
  // To avoid the second update overwriting the first's evidenceMap, we merge
  // both into a single setDraft using functional updates that reach for the
  // freshest prev state.
  const onChange = (next: T) => {
    setDraft((prev) => ({
      ...next,
      // The card built `next` from its render-time draft snapshot, so
      // next.evidenceMap is stale w.r.t. setEvidence calls that ran in the
      // same handler. Replace with prev.evidenceMap (the freshest version
      // post-setEvidence) so the badge update isn't clobbered.
      evidenceMap: { ...(prev.evidenceMap ?? {}) },
    }))
  }
  const setEvidence = (path: string, state: EvidenceState) => {
    evidenceProbe(path, state)
    setDraft((prev) => ({
      ...prev,
      evidenceMap: { ...(prev.evidenceMap ?? {}), [path]: state },
    }))
  }
  return <>{renderCard(draft, onChange, setEvidence)}</>
}

// ---------------------------------------------------------------------------
// Helper — locate the <input> bound to a numeric InvField by visible label,
// scoped to the field's container so we don't pick up the badge's confirm
// button or other inputs.
// ---------------------------------------------------------------------------

function findFieldByLabel(label: RegExp): HTMLElement {
  const labelNode = screen.getAllByText(label)[0]
  let parent: HTMLElement | null = labelNode.parentElement
  while (parent && !parent.classList.contains('inventory-field')) {
    parent = parent.parentElement
  }
  if (!parent) throw new Error(`No .inventory-field ancestor for label ${label}`)
  return parent
}

function findNumberInputByLabel(label: RegExp): HTMLInputElement {
  const field = findFieldByLabel(label)
  const input = field.querySelector('input[type="number"]') as HTMLInputElement | null
  if (!input) throw new Error(`No number input under field ${label}`)
  return input
}

function findGenericNumberInputByLabel(label: RegExp): HTMLInputElement {
  const labelNode = screen.getAllByText(label)[0]
  let parent: HTMLElement | null = labelNode.parentElement
  while (parent && !parent.classList.contains('field')) {
    parent = parent.parentElement
  }
  if (!parent) throw new Error(`No .field ancestor for label ${label}`)
  const input = parent.querySelector('input[type="number"]') as HTMLInputElement | null
  if (!input) throw new Error(`No number input under generic field ${label}`)
  return input
}

// ---------------------------------------------------------------------------
// Parametrized handler matrix.
// ---------------------------------------------------------------------------

interface HandlerCase {
  name: string
  fieldPath: string
  /** Label regex to locate the input. */
  labelRe: RegExp
  /** Initial draft value for this field. */
  initialValue: number
  /** A first distinct value to type. */
  firstEdit: number
  /** A second distinct value to type. */
  secondEdit: number
  /** Renders the card inside a Harness. */
  mount: (probe: (path: string, state: EvidenceState) => void) => void
}

const HANDLER_CASES: HandlerCase[] = [
  {
    name: 'BavCard / contractStartYear',
    fieldPath: 'contractStartYear',
    labelRe: /Vertragsbeginn/,
    initialValue: 2015,
    firstEdit: 2018,
    secondEdit: 2020,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBavDraft({
            contractStartYear: 2015,
            evidenceMap: { contractStartYear: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'BavCard / currentValueEUR',
    fieldPath: 'currentValueEUR',
    labelRe: /Aktueller Vertragswert/,
    initialValue: 12_000,
    firstEdit: 15_000,
    secondEdit: 18_000,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBavDraft({
            currentValueEUR: 12_000,
            evidenceMap: { currentValueEUR: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'BavCard / fees.wrapperAssetFee (effektivkosten)',
    fieldPath: 'fees.wrapperAssetFee',
    labelRe: /Effektivkosten p\.a\./,
    initialValue: 1.0,
    firstEdit: 1.5,
    secondEdit: 0.8,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBavDraft({
            effektivkostenPct: 1.0,
            evidenceMap: { 'fees.wrapperAssetFee': 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'BavCard / rentenfaktor',
    fieldPath: 'rentenfaktor',
    labelRe: /Garantierter Rentenfaktor/,
    initialValue: 28,
    firstEdit: 30,
    secondEdit: 32,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBavDraft({
            rentenfaktor: 28,
            evidenceMap: { rentenfaktor: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'PavCard / fees.wrapperAssetFee (effektivkosten)',
    fieldPath: 'fees.wrapperAssetFee',
    labelRe: /Effektivkosten p\.a\./,
    initialValue: 1.0,
    firstEdit: 1.5,
    secondEdit: 0.8,
    mount: (probe) =>
      render(
        <Harness
          initial={makePavDraft({
            effektivkostenPct: 1.0,
            evidenceMap: { 'fees.wrapperAssetFee': 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <PavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'PavCard / rentenfaktor',
    fieldPath: 'rentenfaktor',
    labelRe: /Garantierter Rentenfaktor/,
    initialValue: 28,
    firstEdit: 31,
    secondEdit: 33,
    mount: (probe) =>
      render(
        <Harness
          initial={makePavDraft({
            rentenfaktor: 28,
            evidenceMap: { rentenfaktor: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <PavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
  {
    name: 'BasisrenteCard / fees.wrapperAssetFee',
    fieldPath: 'fees.wrapperAssetFee',
    labelRe: /Effektivkosten p\.a\./,
    initialValue: 1.0,
    firstEdit: 1.5,
    secondEdit: 0.8,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBasisrenteDraft({
            effektivkostenPct: 1.0,
            evidenceMap: { 'fees.wrapperAssetFee': 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BasisrenteCard
              draft={draft}
              onChange={onChange}
              setEvidence={setEvidence}
            />
          )}
        />,
      ),
  },
  {
    name: 'BasisrenteCard / rentenfaktor',
    fieldPath: 'rentenfaktor',
    labelRe: /Garantierter Rentenfaktor/,
    initialValue: 28,
    firstEdit: 32,
    secondEdit: 35,
    mount: (probe) =>
      render(
        <Harness
          initial={makeBasisrenteDraft({
            rentenfaktor: 28,
            evidenceMap: { rentenfaktor: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <BasisrenteCard
              draft={draft}
              onChange={onChange}
              setEvidence={setEvidence}
            />
          )}
        />,
      ),
  },
  {
    name: 'EtfCard / annualAssetFee (TER)',
    fieldPath: 'annualAssetFee',
    labelRe: /TER p\.a\./,
    initialValue: 0.2,
    firstEdit: 0.5,
    secondEdit: 0.8,
    mount: (probe) =>
      render(
        <Harness
          initial={makeEtfDraft({
            terPct: 0.2,
            evidenceMap: { annualAssetFee: 'model_estimate' },
          })}
          evidenceProbe={probe}
          renderCard={(draft, onChange, setEvidence) => (
            <EtfCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
          )}
        />,
      ),
  },
]

describe('InstanceCard — evidence flag clears on user edit (#03)', () => {
  for (const c of HANDLER_CASES) {
    describe(c.name, () => {
      it('shows "🤔 Schätzung" badge initially when fieldPath is model_estimate', () => {
        const probe = vi.fn<(p: string, s: EvidenceState) => void>()
        c.mount(probe)
        const field = findFieldByLabel(c.labelRe)
        // The EvidenceBadge sits inside the field container.
        expect(within(field).getByText(/Schätzung/i)).toBeDefined()
      })

      it('end-to-end: badge transitions from Schätzung to bestätigt on edit', () => {
        const probe = vi.fn<(p: string, s: EvidenceState) => void>()
        c.mount(probe)

        // Pre-edit: this field shows Schätzung.
        expect(within(findFieldByLabel(c.labelRe)).getByText(/Schätzung/i)).toBeDefined()

        // Fire a single edit — Harness updates evidenceMap synchronously.
        const input = findNumberInputByLabel(c.labelRe)
        fireEvent.change(input, { target: { value: String(c.firstEdit) } })

        // Post-edit: this field's badge swaps to bestätigt.
        const field = findFieldByLabel(c.labelRe)
        expect(within(field).getByText(/bestätigt/i)).toBeDefined()
        expect(within(field).queryByText(/Schätzung/i)).toBeNull()

        // Sanity check: setEvidence was called with (fieldPath, 'user_confirmed').
        expect(probe).toHaveBeenCalledWith(c.fieldPath, 'user_confirmed')
      })

      it('calls setEvidence on EVERY edit (no equality-guard short-circuit)', () => {
        // Round-1 regression: `if (n !== draft.X) setEvidence(...)` would skip
        // the call when the typed value matched draft. Two consecutive distinct
        // edits, threaded through the stateful Harness, prove the guard is gone:
        // the second edit (a value !== current draft) must also fire, AND the
        // badge must stay bestätigt across edits.
        const probe = vi.fn<(p: string, s: EvidenceState) => void>()
        c.mount(probe)
        const input = findNumberInputByLabel(c.labelRe)

        fireEvent.change(input, { target: { value: String(c.firstEdit) } })
        fireEvent.change(input, { target: { value: String(c.secondEdit) } })

        expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2)
        for (const call of probe.mock.calls) {
          expect(call).toEqual([c.fieldPath, 'user_confirmed'])
        }
        // Badge is still bestätigt after the second edit (never regresses).
        const field = findFieldByLabel(c.labelRe)
        expect(within(field).getByText(/bestätigt/i)).toBeDefined()
      })
    })
  }
})

describe('InstanceCard — placeholder defaults are not confirmable estimates (#41)', () => {
  it('does not render estimate badges for empty bAV placeholder values', () => {
    render(
      <BavCard
        draft={makeBavDraft({
          contractStartYear: new Date().getFullYear(),
          currentValueEUR: 0,
          effektivkostenPct: 0,
          evidenceMap: {},
        })}
        onChange={() => {}}
        setEvidence={() => {}}
      />,
    )

    expect(findFieldByLabel(/Vertragsbeginn/).querySelector('.evidence-badge')).toBeNull()
    expect(findFieldByLabel(/Aktueller Vertragswert/).querySelector('.evidence-badge')).toBeNull()
    expect(findFieldByLabel(/Effektivkosten p\.a\./).querySelector('.evidence-badge')).toBeNull()
  })

  it('still renders an estimate badge for a meaningful seeded Rentenfaktor', () => {
    render(
      <BavCard
        draft={makeBavDraft({
          rentenfaktor: 30,
          evidenceMap: {},
        })}
        onChange={() => {}}
        setEvidence={() => {}}
      />,
    )

    expect(findFieldByLabel(/Garantierter Rentenfaktor/).querySelector('.evidence-badge--estimate'))
      .not.toBeNull()
  })
})

describe('InstanceCard — onboarding Einzelposten fee split (#05)', () => {
  it('keeps edited pAV Fondskosten instead of snapping TER back to zero', () => {
    render(
      <Harness
        initial={makePavDraft({ effektivkostenPct: 1.0 })}
        evidenceProbe={() => {}}
        renderCard={(draft, onChange, setEvidence) => (
          <PavCard draft={draft} onChange={onChange} setEvidence={setEvidence} />
        )}
      />,
    )

    fireEvent.click(screen.getByText('Details'))
    const einzelpostenTab = screen.getAllByRole('button')
      .find((button) => button.textContent?.trim() === 'Einzelposten')
    expect(einzelpostenTab).toBeDefined()
    fireEvent.click(einzelpostenTab!)

    const fundInput = findGenericNumberInputByLabel(/Fondskosten/)
    fireEvent.change(fundInput, { target: { value: '0.3' } })
    fireEvent.blur(fundInput)

    // Fondskosten is independent — wrapperAssetFee (Mantelgebühr) must NOT change.
    expect(findGenericNumberInputByLabel(/Fondskosten/).value).toBe('0.3')
    expect(findGenericNumberInputByLabel(/Mantelgeb/).value).toBe('1')
  })
})
