import { useEffect, useState } from 'react'
import { STORAGE_KEY } from '../storage'
import { readUrlState } from '../utils/urlShare'

const SETUP_FLAG_KEY = 'rentenrechner-guided-setup-v1'

type SetupFlag = {
  /** true once the user has either completed the guided setup or chosen "Expertenmodus". */
  completed?: boolean
  /** true if the user explicitly opts out — never show again. */
  skipPermanently?: boolean
}

function readFlag(): SetupFlag {
  try {
    const raw = localStorage.getItem(SETUP_FLAG_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SetupFlag
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeFlag(flag: SetupFlag) {
  try {
    localStorage.setItem(SETUP_FLAG_KEY, JSON.stringify(flag))
  } catch {
    // ignore storage failures
  }
}

function detectFirstRun(): boolean {
  try {
    if (readUrlState()) return false
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return false
    const flag = readFlag()
    if (flag.completed || flag.skipPermanently) return false
    return true
  } catch {
    return false
  }
}

/**
 * Lifecycle of the post-modal journey stepper.
 * - inactive: never started, or user is in expert mode.
 * - active:  guided setup just completed (non-expert path); stepper visible.
 * - dismissed: user clicked "Dashboard anzeigen" — stepper hidden, but reopen() can re-arm.
 */
export type JourneyState = 'inactive' | 'active' | 'dismissed'

export type CompleteSetupOptions = {
  /** True when the user picked Expertenmodus — suppresses the journey stepper. */
  isExpert?: boolean
}

export type GuidedSetupState = {
  /** Whether the full-screen guided setup overlay is currently visible. */
  showOverlay: boolean
  /** Whether the persistent post-setup journey stepper should be shown. */
  journeyState: JourneyState
  /** Mark setup as completed and dismiss the overlay. Activates the journey unless expert. */
  completeSetup: (options?: CompleteSetupOptions) => void
  /** Skip the overlay this session (without permanent skip). */
  dismissOverlay: () => void
  /** Skip the overlay forever. */
  skipPermanently: () => void
  /** Hide the journey stepper without ending the session. */
  dismissJourney: () => void
  /** Re-open the guided setup on demand. */
  reopen: () => void
}

export function useGuidedSetup(): GuidedSetupState {
  const [showOverlay, setShowOverlay] = useState<boolean>(() => detectFirstRun())
  const [journeyState, setJourneyState] = useState<JourneyState>('inactive')

  useEffect(() => {
    document.body.style.overflow = showOverlay ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showOverlay])

  function completeSetup(options?: CompleteSetupOptions) {
    writeFlag({ ...readFlag(), completed: true })
    setShowOverlay(false)
    setJourneyState(options?.isExpert ? 'inactive' : 'active')
  }

  function dismissOverlay() {
    writeFlag({ ...readFlag(), completed: true })
    setShowOverlay(false)
  }

  function skipPermanently() {
    writeFlag({ ...readFlag(), completed: true, skipPermanently: true })
    setShowOverlay(false)
  }

  function dismissJourney() {
    setJourneyState('dismissed')
  }

  function reopen() {
    setShowOverlay(true)
  }

  return {
    showOverlay,
    journeyState,
    completeSetup,
    dismissOverlay,
    skipPermanently,
    dismissJourney,
    reopen,
  }
}
