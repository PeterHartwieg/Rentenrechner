import { useCallback, useEffect, useState } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { calculateBavFunding } from '../engine/salary'
import { STORAGE_KEY_V2, buildStateJson, loadSavedState } from '../storage'
import { readUrlState } from '../utils/urlShare'
import { syncMonthlyContributions } from './syncContributions'

function loadInitialState() {
  return readUrlState() ?? loadSavedState()
}

/**
 * Re-harmonize the four monthly contribution fields on load. Anchor on the
 * current bAV's true monthly netto so already-meaningful saved state stays
 * close to where the user left it; the other three back-solve to match.
 */
function harmonizeOnLoad(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): ScenarioAssumptions {
  const bavNet = calculateBavFunding(profile, de2026Rules, assumptions.bav).monthlyNetCost
  return syncMonthlyContributions(bavNet, assumptions, profile, de2026Rules)
}

export function useCalculatorState() {
  const [profile, setProfile] = useState<PersonalProfile>(
    () => loadInitialState()?.profile ?? defaultProfile,
  )
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(() => {
    const initial = loadInitialState()
    const baseProfile = initial?.profile ?? defaultProfile
    const baseAssumptions = initial?.assumptions ?? defaultAssumptions
    return harmonizeOnLoad(baseProfile, baseAssumptions)
  })

  useEffect(() => {
    // Write v1-shaped payload to v2 key during M1 transition.
    // TODO(issue 03): replace with saveWorkspace(workspace) once PortfolioAdapter lands.
    localStorage.setItem(STORAGE_KEY_V2, buildStateJson(profile, assumptions))
  }, [profile, assumptions])

  function resetToDefaults() {
    setProfile(defaultProfile)
    setAssumptions(harmonizeOnLoad(defaultProfile, defaultAssumptions))
  }

  // Single entry point for every "monthly investment" field. The value is the
  // target monthly netto; the sync helper back-solves all four products so
  // they share that same out-of-pocket cash.
  const setSyncedMonthlyContribution = useCallback(
    (targetNet: number) => {
      setAssumptions((current) =>
        syncMonthlyContributions(targetNet, current, profile, de2026Rules),
      )
    },
    [profile],
  )

  return {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
  }
}
