import { useCallback, useEffect, useRef, useState } from 'react'

export const WORKSPACE_KEY = 'rentenrechner-workspace-v1'

export const WORKSPACE_VIEWS = ['angebot', 'vergleich', 'details'] as const
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]

function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

function readStoredView(): WorkspaceView | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return null
    if (raw === 'warum') return 'vergleich'
    return isWorkspaceView(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStoredView(view: WorkspaceView) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WORKSPACE_KEY, view)
  } catch {
    // ignore storage failures
  }
}

export type WorkspaceState = {
  activeView: WorkspaceView
  setActiveView: (view: WorkspaceView) => void
  /**
   * Set the active view without persisting it to localStorage. Used by the
   * `?view=<WorkspaceView>` URL override so a one-shot deep-link does not
   * overwrite the user's saved tab. A subsequent regular `setActiveView`
   * (i.e. an explicit user tab click) persists normally.
   */
  setActiveViewTransient: (view: WorkspaceView) => void
}

export function useWorkspace(): WorkspaceState {
  const [activeView, setActiveViewState] = useState<WorkspaceView>(() => {
    const stored = readStoredView()
    if (stored) return stored
    return 'angebot'
  })
  const skipNextPersistRef = useRef(false)

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }
    writeStoredView(activeView)
  }, [activeView])

  const setActiveView = useCallback((view: WorkspaceView) => {
    setActiveViewState(view)
  }, [])

  const setActiveViewTransient = useCallback((view: WorkspaceView) => {
    skipNextPersistRef.current = true
    setActiveViewState(view)
  }, [])

  return {
    activeView,
    setActiveView,
    setActiveViewTransient,
  }
}
