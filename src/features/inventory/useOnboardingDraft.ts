/**
 * `useOnboardingDraft` — React binding for the two onboarding steps.
 *
 * Package 2A-mechanical. Thin by design: it holds the two drafts, the current
 * step, and derived validation/estimate output. **It persists nothing.** The
 * caller (the wizard host in `Calculator` / `InventoryWizard`) takes the
 * `Scenario` returned by `commit()` and passes it to `replaceWorkspace` /
 * `setBaseline`.
 *
 * All the logic lives in the pure `onboardingDraft.ts`; this file only wires it
 * to `useState` / `useMemo` so the module stays testable without React.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GermanRules } from '../../domain'
import type { Scenario } from '../../domain/workspace'
import {
  applyOnboardingToScenario,
  estimateFromPensionDraft,
  isValid,
  markFieldUnknown,
  pensionDraftFromScenario,
  profileDraftFromScenario,
  setDraftFieldValue,
  validatePensionDraft,
  validateProfileDraft,
  type FieldStatus,
  type PensionDraft,
  type PensionDraftErrors,
  type PensionDraftEstimate,
  type PensionFieldKey,
  type ProfileDraft,
  type ProfileDraftErrors,
  type ProfileFieldKey,
} from './onboardingDraft'

/** The two onboarding steps. Also the two entry points when editing from the plan. */
export type OnboardingStep = 'profile' | 'pension'

export interface UseOnboardingDraftOptions {
  /**
   * The scenario being edited — the saved baseline, or one
   * `createFreshOnboardingScenario()` call.
   *
   * **Must be stable across renders.** The hook re-seeds both drafts whenever
   * `scenario.id` changes (so saved state arriving after mount is picked up).
   * Constructing a fresh scenario inline in the render body mints a new id on
   * every render and re-seeds forever — hold it in `useState`/`useMemo`, or
   * give the host component a `key`.
   */
  scenario: Scenario
  /** Which step to open on. Defaults to `'profile'`. */
  initialStep?: OnboardingStep
  /** Rule set override; defaults to the active `de2026Rules` inside the pure helpers. */
  rules?: GermanRules
}

export interface OnboardingDraftErrors {
  profile: ProfileDraftErrors
  pension: PensionDraftErrors
}

export interface UseOnboardingDraftApi {
  step: OnboardingStep
  setStep: (step: OnboardingStep) => void
  profile: ProfileDraft
  pension: PensionDraft
  /** Replace one draft key wholesale (including `system` / `method` and the pass-throughs). */
  patchProfile: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void
  patchPension: <K extends keyof PensionDraft>(key: K, value: PensionDraft[K]) => void
  /** Set one `Field` to a real value. Typing `0` clears an explicit unknown. */
  setProfileValue: (key: ProfileFieldKey, value: unknown, status?: FieldStatus) => void
  setPensionValue: (key: PensionFieldKey, value: unknown, status?: FieldStatus) => void
  /** Mark one `Field` explicitly unknown. Neighbouring fields are untouched. */
  setFieldUnknown: {
    (section: 'profile', key: ProfileFieldKey): void
    (section: 'pension', key: PensionFieldKey): void
  }
  errors: OnboardingDraftErrors
  /** Whether both steps currently validate. */
  isComplete: boolean
  /** The estimate for the pension draft's active method. */
  estimate: PensionDraftEstimate
  /** The committed scenario, or `null` when either step is invalid. Nothing is saved here. */
  commit: () => Scenario | null
  /** Discard every edit and re-read both drafts from the source scenario. */
  reset: () => void
}

export function useOnboardingDraft({
  scenario,
  initialStep = 'profile',
  rules,
}: UseOnboardingDraftOptions): UseOnboardingDraftApi {
  const [step, setStep] = useState<OnboardingStep>(initialStep)
  const [profile, setProfile] = useState<ProfileDraft>(() => profileDraftFromScenario(scenario))
  const [pension, setPension] = useState<PensionDraft>(() => pensionDraftFromScenario(scenario))

  // Keep the latest scenario for `commit()` without re-deriving the drafts on
  // every render (that would throw away in-flight edits).
  const scenarioRef = useRef(scenario)
  useEffect(() => {
    scenarioRef.current = scenario
  }, [scenario])

  const reset = useCallback(() => {
    setProfile(profileDraftFromScenario(scenarioRef.current))
    setPension(pensionDraftFromScenario(scenarioRef.current))
  }, [])

  // Re-seed only when the host swaps to a different scenario (e.g. saved state
  // arrives after mount). An in-place edit of the same scenario id does not
  // clobber the user's typing.
  const seededId = useRef(scenario.id)
  useEffect(() => {
    if (seededId.current === scenario.id) return
    seededId.current = scenario.id
    setProfile(profileDraftFromScenario(scenario))
    setPension(pensionDraftFromScenario(scenario))
  }, [scenario])

  const patchProfile = useCallback(
    <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
      setProfile((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const patchPension = useCallback(
    <K extends keyof PensionDraft>(key: K, value: PensionDraft[K]) => {
      setPension((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const setProfileValue = useCallback(
    (key: ProfileFieldKey, value: unknown, status: FieldStatus = 'entered') => {
      setProfile((prev) => setDraftFieldValue(prev, key, value, status))
    },
    [],
  )

  const setPensionValue = useCallback(
    (key: PensionFieldKey, value: unknown, status: FieldStatus = 'entered') => {
      setPension((prev) => setDraftFieldValue(prev, key, value, status))
    },
    [],
  )

  const setFieldUnknown = useCallback(
    (section: 'profile' | 'pension', key: ProfileFieldKey | PensionFieldKey) => {
      if (section === 'profile') {
        setProfile((prev) => markFieldUnknown(prev, key as ProfileFieldKey))
      } else {
        setPension((prev) => markFieldUnknown(prev, key as PensionFieldKey))
      }
    },
    [],
  ) as UseOnboardingDraftApi['setFieldUnknown']

  const errors = useMemo<OnboardingDraftErrors>(
    () => ({
      profile: validateProfileDraft(profile),
      pension: validatePensionDraft(pension, profile),
    }),
    [profile, pension],
  )

  const isComplete = isValid(errors.profile) && isValid(errors.pension)

  const estimate = useMemo(
    () => estimateFromPensionDraft(pension, profile, rules),
    [pension, profile, rules],
  )

  const commit = useCallback((): Scenario | null => {
    if (!isValid(validateProfileDraft(profile))) return null
    if (!isValid(validatePensionDraft(pension, profile))) return null
    return applyOnboardingToScenario(scenarioRef.current, profile, pension, rules)
  }, [profile, pension, rules])

  return {
    step,
    setStep,
    profile,
    pension,
    patchProfile,
    patchPension,
    setProfileValue,
    setPensionValue,
    setFieldUnknown,
    errors,
    isComplete,
    estimate,
    commit,
    reset,
  }
}
