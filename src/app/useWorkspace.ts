import { useEffect, useState } from 'react'

const WORKSPACE_KEY = 'rentenrechner-workspace-v1'

export const WORKSPACE_VIEWS = ['start', 'vergleich', 'angebot', 'warum', 'details'] as const
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]

function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

function readStoredView(): WorkspaceView | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return null
    return isWorkspaceView(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStoredView(view: WorkspaceView) {
  try {
    localStorage.setItem(WORKSPACE_KEY, view)
  } catch {
    // ignore storage failures
  }
}

export type UseWorkspaceOptions = {
  /** True when the user is in a first-run state (no saved state yet). Used to pick the default view. */
  firstRun: boolean
}

export type WorkspaceState = {
  activeView: WorkspaceView
  setActiveView: (view: WorkspaceView) => void
}

export function useWorkspace({ firstRun }: UseWorkspaceOptions): WorkspaceState {
  const [activeView, setActiveViewState] = useState<WorkspaceView>(() => {
    const stored = readStoredView()
    if (stored) return stored
    return firstRun ? 'start' : 'vergleich'
  })

  useEffect(() => {
    writeStoredView(activeView)
  }, [activeView])

  return {
    activeView,
    setActiveView: setActiveViewState,
  }
}
