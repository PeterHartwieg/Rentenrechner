// @vitest-environment jsdom

/**
 * Regression tests for the § 4 Annahmen inflation toggle (issue #408).
 *
 * The toggle's onChange used to write the prefill literal `0.02` inline,
 * while docs/validation.md attributes the prefill to
 * `DEFAULT_EXPERT_INFLATION_RATE` (`src/data/defaultScenario.ts`). The
 * handler now uses the constant; these tests pin the constant (not the
 * literal) as the value written on both toggle directions, so a future
 * change to the default rate cannot silently desync the toggle from the
 * documented constant.
 *
 * The section runs inside a real controlled harness (useState + effect
 * echo) rather than against a bare spy: the updater closes over
 * `e.target.checked`, and React restores a controlled checkbox's DOM
 * state after dispatch, so applying a captured updater after the fact
 * reads the pre-click value. The harness applies the updater through the
 * normal controlled flow and reports the resulting state.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import { AngabenAnnahmenSection } from './AngabenAnnahmenSection'
import {
  DEFAULT_EXPERT_INFLATION_RATE,
  defaultAssumptions,
} from '../../../data/defaultScenario'
import type { ScenarioAssumptions } from '../../../domain'

afterEach(cleanup)

/**
 * Controlled wrapper: owns the assumptions state exactly like AngabenPage
 * does and echoes every committed state to `onState` via an effect, so the
 * test reads the state React actually committed (not a post-hoc updater
 * replay).
 */
function ToggleHarness({
  base,
  onState,
}: {
  base: ScenarioAssumptions
  onState: (assumptions: ScenarioAssumptions) => void
}) {
  const [assumptions, setAssumptions] = useState(base)
  useEffect(() => {
    onState(assumptions)
  }, [assumptions, onState])
  return (
    <AngabenAnnahmenSection
      assumptions={assumptions}
      setAssumptions={setAssumptions as Dispatch<SetStateAction<ScenarioAssumptions>>}
      resolvedRenditen={{ konservativ: 0.03, basis: 0.05, optimistisch: 0.07 }}
      num="§ 4"
      id="annahmen"
      title="Annahmen"
      mode="combine"
    />
  )
}

function renderSection(base: ScenarioAssumptions) {
  const onState = vi.fn()
  const utils = render(<ToggleHarness base={base} onState={onState} />)
  return { ...utils, onState }
}

/** Find the "Inflation" checkbox via its field label, the same pattern the
 *  AngabenPage tests use for NumberFields. */
function findInflationToggle(container: HTMLElement): HTMLInputElement {
  const labels = Array.from(container.querySelectorAll('label.angaben-field'))
  for (const label of labels) {
    const span = label.querySelector('.angaben-field-label')
    if (span && (span.textContent ?? '').startsWith('Inflation')) {
      const checkbox = label.querySelector('input[type="checkbox"]')
      if (checkbox) return checkbox as HTMLInputElement
    }
  }
  throw new Error('Inflation toggle not found in rendered AngabenAnnahmenSection')
}

/** Last state the harness committed (mount echo included). */
function lastCommitted(onState: ReturnType<typeof vi.fn>): ScenarioAssumptions {
  return onState.mock.calls.at(-1)![0] as ScenarioAssumptions
}

describe('AngabenAnnahmenSection — inflation toggle prefill (#408)', () => {
  it('writes DEFAULT_EXPERT_INFLATION_RATE when the toggle is enabled', () => {
    const base = { ...defaultAssumptions, inflationRate: 0 }
    const { container, onState } = renderSection(base)
    expect(findInflationToggle(container).checked).toBe(false)
    // Toggle off → the rate field is not rendered.
    expect(onState.mock.calls.length).toBe(1)

    fireEvent.click(findInflationToggle(container))

    // Controlled flow re-rendered: the checkbox reflects the new state and
    // the committed assumptions carry the documented constant — not a
    // duplicated literal.
    expect(findInflationToggle(container).checked).toBe(true)
    expect(lastCommitted(onState).inflationRate).toBe(
      DEFAULT_EXPERT_INFLATION_RATE,
    )
  })

  it('writes 0 when the toggle is disabled again', () => {
    const base = {
      ...defaultAssumptions,
      inflationRate: DEFAULT_EXPERT_INFLATION_RATE,
    }
    const { container, onState } = renderSection(base)
    expect(findInflationToggle(container).checked).toBe(true)

    fireEvent.click(findInflationToggle(container))

    expect(findInflationToggle(container).checked).toBe(false)
    expect(lastCommitted(onState).inflationRate).toBe(0)
  })
})
