import { useState, useCallback } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import {
  loadLibrary,
  addToLibrary,
  deleteFromLibrary,
  duplicateInLibrary,
  renameInLibrary,
  type SavedScenario,
} from '../data/scenarioLibrary'

export function useScenarioLibrary(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  setProfile: (p: PersonalProfile) => void,
  setAssumptions: (a: ScenarioAssumptions) => void,
) {
  const [library, setLibrary] = useState<SavedScenario[]>(() => loadLibrary())

  const refresh = useCallback(() => setLibrary(loadLibrary()), [])

  const save = useCallback(
    (name: string) => {
      addToLibrary(name, profile, assumptions)
      refresh()
    },
    [profile, assumptions, refresh],
  )

  const load = useCallback(
    (id: string) => {
      const scenario = library.find(s => s.id === id)
      if (!scenario) return
      setProfile(scenario.profile)
      setAssumptions(scenario.assumptions)
    },
    [library, setProfile, setAssumptions],
  )

  const remove = useCallback(
    (id: string) => {
      deleteFromLibrary(id)
      refresh()
    },
    [refresh],
  )

  const duplicate = useCallback(
    (id: string) => {
      duplicateInLibrary(id)
      refresh()
    },
    [refresh],
  )

  const rename = useCallback(
    (id: string, name: string) => {
      renameInLibrary(id, name)
      refresh()
    },
    [refresh],
  )

  return { library, save, load, remove, duplicate, rename }
}
