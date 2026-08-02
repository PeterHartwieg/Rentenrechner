// @vitest-environment jsdom
/**
 * Combine-mode AVD instance editor.
 *
 * Combine mode does **not** use the compare-mode anchor: each instance's
 * `monthlyOwnContribution` is a real per-contract input. What it shares with
 * compare mode is the *bounds and levels*, which must come from the same
 * helpers so the two surfaces cannot drift.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AltersvorsorgedepotInstanceInputs } from './AltersvorsorgedepotInstanceInputs'
import { defaultAssumptions } from '../../../data/defaultScenario'
import type { AltersvorsorgedepotInstance } from '../../../domain/instances'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function makeInstance(over: Partial<AltersvorsorgedepotInstance> = {}): AltersvorsorgedepotInstance {
  return {
    ...defaultAssumptions.altersvorsorgedepot,
    instanceId: 'altersvorsorgedepot-test',
    label: 'AVD Vertrag 1',
    status: 'active',
    contractStartYear: 2027,
    evidenceMap: {},
    monthlyOwnContribution: 150,
    ...over,
  } as AltersvorsorgedepotInstance
}

function setup(over: Partial<AltersvorsorgedepotInstance> = {}) {
  const patchInstance = vi.fn()
  render(
    <AltersvorsorgedepotInstanceInputs instance={makeInstance(over)} patchInstance={patchInstance} />,
  )
  return { patchInstance }
}

describe('AltersvorsorgedepotInstanceInputs — statutory bounds', () => {
  it('bounds the contribution by the Vertragsrahmen, not by a generic 5000', () => {
    setup()
    expect(screen.getByRole('slider')).toHaveAttribute('max', '525')
  })

  it('offers the same statutory levels as compare mode', () => {
    setup()
    expect(screen.getByText('Mindestbeitrag')).toBeTruthy()
    expect(screen.getByText('Volle Grundzulage')).toBeTruthy()
    expect(screen.getByText('Vertragsrahmen')).toBeTruthy()
  })

  it('writes the chosen contribution straight to the instance', () => {
    const { patchInstance } = setup()
    fireEvent.click(screen.getByText('Mindestbeitrag'))
    expect(patchInstance).toHaveBeenCalledWith({ monthlyOwnContribution: 10 })
  })
})

describe('AltersvorsorgedepotInstanceInputs — legacy and paid-up contracts', () => {
  it('does not clamp a stored contribution that already exceeds the Vertragsrahmen', () => {
    // The field this replaces allowed up to 5 000 EUR. Rewriting a user's
    // contract data on open would be worse than showing an over-cap number,
    // which the funding result already flags separately.
    setup({ monthlyOwnContribution: 900 })
    const slider = screen.getByRole('slider')
    expect(slider).toHaveValue('900')
    expect(slider).toHaveAttribute('max', '900')
  })

  it('disables the whole control for a beitragsfrei contract', () => {
    setup({ status: 'paid_up' })
    expect(screen.getByRole('slider')).toBeDisabled()
    for (const card of screen.getAllByRole('radio')) expect(card).toBeDisabled()
  })
})
