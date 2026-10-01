// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { RiesterInstanceInputs } from './RiesterInstanceInputs'
import { defaultAssumptions, defaultProfile } from '../../../data/defaultScenario'
import type { RiesterInstance } from '../../../domain/instances'
import type { PersonalProfile } from '../../../domain'
import { de2026Rules } from '../../../rules/de2026'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function makeInstance(over: Partial<RiesterInstance> = {}): RiesterInstance {
  return {
    ...defaultAssumptions.riester,
    instanceId: 'riester-test',
    label: 'Riester Vertrag 1',
    status: 'active',
    contractStartYear: 2020,
    evidenceMap: {},
    ...over,
  }
}

function setup(
  over: Partial<RiesterInstance> = {},
  profile: PersonalProfile = defaultProfile,
) {
  const patchInstance = vi.fn()
  render(
    <RiesterInstanceInputs
      instance={makeInstance(over)}
      patchInstance={patchInstance}
      profile={profile}
    />,
  )
  return { patchInstance }
}

describe('RiesterInstanceInputs — Kinderzulage', () => {
  const profile = { ...defaultProfile, childBirthYears: [de2026Rules.year] }
  const name = /Kinderzulage in diesem Vertrag berücksichtigen/

  it('checks the claim by default for a profile with children', () => {
    setup({}, profile)
    expect(screen.getByRole('checkbox', { name })).toBeChecked()
  })

  it('patches only the contract eligibility when unchecked', () => {
    const { patchInstance } = setup({}, profile)
    fireEvent.click(screen.getByRole('checkbox', { name }))
    expect(patchInstance).toHaveBeenCalledExactlyOnceWith({
      eligibility: {
        ...defaultAssumptions.riester.eligibility,
        claimsChildAllowance: false,
      },
    })
    expect(profile.childBirthYears).toEqual([de2026Rules.year])
  })

  it('honours a saved opt-out and writes true when checked again', () => {
    const { patchInstance } = setup({
      eligibility: { ...defaultAssumptions.riester.eligibility, claimsChildAllowance: false },
    }, profile)
    const checkbox = screen.getByRole('checkbox', { name })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(patchInstance).toHaveBeenCalledExactlyOnceWith({
      eligibility: { ...defaultAssumptions.riester.eligibility, claimsChildAllowance: true },
    })
  })

  it('hides the claim when the profile has no children', () => {
    setup({}, { ...defaultProfile, childBirthYears: [] })
    expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument()
  })
})
