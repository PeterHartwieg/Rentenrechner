import { useCallback, useEffect, useState } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { calculateBavFunding } from '../engine/salary'
import { STORAGE_KEY_V1, buildStateJson, loadSavedState } from '../storage'
import { readUrlState } from '../utils/urlShare'
import {
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from './syncContributions'

function loadInitialState() {
  return readUrlState() ?? loadSavedState()
}

/**
 * Resolve the Netto-Belastung anchor from stored state on load.
 *
 * - Normal path: read `equalInputAmountEUR` (the public anchor).
 * - Legacy path: old saves with `compareSubMode: 'equal_cash'` and no
 *   `equalInputAmountEUR` fall back to the current bAV's net cost so the
 *   user's existing bAV contribution is preserved as the anchor.
 */
function resolveNettoBelastungTarget(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): number {
  if (assumptions.compareSubMode === 'equal_cash' && assumptions.equalInputAmountEUR === undefined) {
    return calculateBavFunding(profile, de2026Rules, assumptions.bav).monthlyNetCost
  }
  if (assumptions.equalInputAmountEUR !== undefined) {
    return normalizeMonthlyNettoBelastung(assumptions.equalInputAmountEUR)
  }
  return calculateBavFunding(profile, de2026Rules, assumptions.bav).monthlyNetCost
}

/**
 * Re-harmonize monthly contribution fields on load. New/default state anchors
 * on the stored public Netto-Belastung value; very old states without that
 * field fall back to the current bAV's true monthly netto.
 */
function harmonizeOnLoad(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): ScenarioAssumptions {
  return syncMonthlyContributions(
    resolveNettoBelastungTarget(profile, assumptions),
    assumptions,
    profile,
    de2026Rules,
  )
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
    // Writer stays on v1 key throughout M1. Issue 03 switches to saveWorkspace()
    // writing v2-shaped JSON to STORAGE_KEY_V2.
    // TODO(issue 03): replace with saveWorkspace(workspace) once PortfolioAdapter lands.
    localStorage.setItem(STORAGE_KEY_V1, buildStateJson(profile, assumptions))
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
      const target = normalizeMonthlyNettoBelastung(targetNet)
      setAssumptions((current) =>
        syncMonthlyContributions(target, current, profile, de2026Rules),
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
