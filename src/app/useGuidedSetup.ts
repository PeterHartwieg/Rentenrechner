import { useState } from 'react'
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

export type GuidedSetupState = {
  /** Whether the full-screen guided setup overlay is currently visible. */
  showOverlay: boolean
  /** Whether the post-setup explanation panel ("Warum mehr als ein Taschenrechner?") should be rendered. */
  showPostSetupHint: boolean
  /** Mark setup as completed and dismiss the overlay. Triggers the post-setup hint. */
  completeSetup: () => void
  /** Skip the overlay this session (without permanent skip). */
  dismissOverlay: () => void
  /** Skip the overlay forever. */
  skipPermanently: () => void
  /** Dismiss the post-setup explanation panel. */
  dismissPostSetupHint: () => void
  /** Re-open the guided setup on demand. */
  reopen: () => void
}

export function useGuidedSetup(): GuidedSetupState {
  const [showOverlay, setShowOverlay] = useState<boolean>(() => detectFirstRun())
  const [showPostSetupHint, setShowPostSetupHint] = useState<boolean>(false)

  function completeSetup() {
    writeFlag({ ...readFlag(), completed: true })
    setShowOverlay(false)
    setShowPostSetupHint(true)
  }

  function dismissOverlay() {
    writeFlag({ ...readFlag(), completed: true })
    setShowOverlay(false)
  }

  function skipPermanently() {
    writeFlag({ ...readFlag(), completed: true, skipPermanently: true })
    setShowOverlay(false)
  }

  function dismissPostSetupHint() {
    setShowPostSetupHint(false)
  }

  function reopen() {
    setShowOverlay(true)
  }

  return {
    showOverlay,
    showPostSetupHint,
    completeSetup,
    dismissOverlay,
    skipPermanently,
    dismissPostSetupHint,
    reopen,
  }
}
