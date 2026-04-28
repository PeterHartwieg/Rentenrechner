import { useEffect, useState } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { STORAGE_KEY, buildStateJson, loadSavedState } from '../storage'
import { readUrlState } from '../utils/urlShare'

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

  return { profile, setProfile, assumptions, setAssumptions, resetToDefaults }
}
