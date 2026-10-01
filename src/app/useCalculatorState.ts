import { useCallback, useEffect, useState } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { STORAGE_KEY_V1, buildStateJson, loadSavedState } from '../storage'
import { readUrlState } from '../utils/urlShare'
import { safeSetItem } from '../utils/safeStorage'
import {
  normalizeMonthlyNettoBelastung,
  resolveNettoBelastungTarget,
  syncMonthlyContributions,
} from './syncContributions'

type LoadResult = {
  state: { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null
  invalidLink: boolean
}

function loadInitialState(): LoadResult {
  const urlResult = readUrlState()
  if (urlResult.kind === 'valid') {
    return { state: urlResult.state, invalidLink: false }
  }
  if (urlResult.kind === 'invalid') {
    return { state: loadSavedState(), invalidLink: true }
  }
  // absent
  return { state: loadSavedState(), invalidLink: false }
}

/**
 * Re-harmonize monthly contribution fields on load. New/default state anchors
 * on the stored public Netto-Belastung value; very old states without that
 * field fall back to the current bAV's true monthly netto. The anchor
 * resolution itself is canonical in `src/utils/syncContributions.ts` so the
 * `/eingaben` § 2 derived bAV gross display resolves the identical target.
 */
function harmonizeOnLoad(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): ScenarioAssumptions {
  return syncMonthlyContributions(
    resolveNettoBelastungTarget(profile, assumptions, de2026Rules),
    assumptions,
    profile,
    de2026Rules,
  )
}

type InitialHookState = {
  invalidLink: boolean
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
}

function computeInitialHookState(): InitialHookState {
  // URL-decode + localStorage read runs exactly once, inside a single lazy
  // initializer, so mount cost is 1x instead of 3x.
  const initial = loadInitialState()
  const baseProfile = initial.state?.profile ?? defaultProfile
  const baseAssumptions = initial.state?.assumptions ?? defaultAssumptions
  return {
    invalidLink: initial.invalidLink,
    profile: baseProfile,
    assumptions: harmonizeOnLoad(baseProfile, baseAssumptions),
  }
}

export function useCalculatorState() {
  const [{ invalidLink: invalidLinkInit, profile: profileInit, assumptions: assumptionsInit }] =
    useState<InitialHookState>(computeInitialHookState)

  const [invalidLink, setInvalidLink] = useState<boolean>(invalidLinkInit)
  const [profile, setProfile] = useState<PersonalProfile>(profileInit)
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(assumptionsInit)

  useEffect(() => {
    // Compare mode intentionally writes STORAGE_KEY_V1. Combine/workspace mode
    // writes STORAGE_KEY_V2 via saveWorkspace() in portfolioState. Both keys
    // coexist by design; see storage.ts for the dual-key architecture.
    safeSetItem(STORAGE_KEY_V1, buildStateJson(profile, assumptions))
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
        // Typing a net amount anywhere — the global control or any product's
        // own field — is an implicit "steer by net again", so any pinned AVD
        // Eigenbeitrag is released here. Doing it in the same setState keeps
        // the transition atomic: no intermediate render where the mode and the
        // amount disagree, and no second simulation + Monte Carlo pass.
        syncMonthlyContributions(
          target,
          { ...current, contributionInput: { kind: 'net' } },
          profile,
          de2026Rules,
        ),
      )
    },
    [profile],
  )

  const setAvdOwnContribution = useCallback(
    (monthlyOwn: number) => {
      setAssumptions((current) =>
        syncMonthlyContributions(
          0, // ignored: the anchor is derived from the pinned Eigenbeitrag
          {
            ...current,
            contributionInput: {
              kind: 'avd-own',
              monthlyOwn: normalizeMonthlyNettoBelastung(monthlyOwn),
            },
          },
          profile,
          de2026Rules,
        ),
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
    setAvdOwnContribution,
    invalidLink,
    dismissInvalidLink: () => setInvalidLink(false),
  }
}
