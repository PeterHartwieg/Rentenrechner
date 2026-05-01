import { useCallback, useEffect, useState } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { STORAGE_KEY, buildStateJson, loadSavedState } from '../storage'
import { readUrlState } from '../utils/urlShare'
import {
  type ContributionSource,
  syncMonthlyContributions,
} from './syncContributions'

function loadInitialState() {
  return readUrlState() ?? loadSavedState()
}

export function useCalculatorState() {
  const [profile, setProfile] = useState<PersonalProfile>(
    () => loadInitialState()?.profile ?? defaultProfile,
  )
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    () => loadInitialState()?.assumptions ?? defaultAssumptions,
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, buildStateJson(profile, assumptions))
  }, [profile, assumptions])

  function resetToDefaults() {
    setProfile(defaultProfile)
    setAssumptions(defaultAssumptions)
  }

  // Single entry point for the four "monthly investment" fields. Each onChange in
  // the bAV / Basisrente / AVD / Riester input components calls this; the helper
  // back-solves the other three so all four fields share the same monthly net cost.
  const setSyncedMonthlyContribution = useCallback(
    (source: ContributionSource, value: number) => {
      setAssumptions((current) =>
        syncMonthlyContributions(source, value, current, profile, de2026Rules),
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
