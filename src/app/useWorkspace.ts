import { useEffect, useState } from 'react'

const WORKSPACE_KEY = 'rentenrechner-workspace-v1'

export const WORKSPACE_VIEWS = ['angebot', 'vergleich', 'details'] as const
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]

function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

function readStoredView(): WorkspaceView | null {
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
  try {
    localStorage.setItem(WORKSPACE_KEY, view)
  } catch {
    // ignore storage failures
  }
}

export type WorkspaceState = {
  activeView: WorkspaceView
  setActiveView: (view: WorkspaceView) => void
}

export function useWorkspace(): WorkspaceState {
  const [activeView, setActiveViewState] = useState<WorkspaceView>(() => {
    const stored = readStoredView()
    if (stored) return stored
    return 'angebot'
  })

  useEffect(() => {
    writeStoredView(activeView)
  }, [activeView])

  return {
    activeView,
    setActiveView: setActiveViewState,
  }
}
