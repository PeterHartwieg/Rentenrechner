import type { PersonalProfile, ScenarioAssumptions } from '../domain'

export interface SavedScenario {
  id: string
  name: string
  savedAt: string
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
}

const LIBRARY_KEY = 'rentenrechner-library-v1'

export function loadLibrary(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedScenario[]) : []
  } catch {
    return []
  }
}

function persistLibrary(scenarios: SavedScenario[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(scenarios))
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function addToLibrary(
  name: string,
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): SavedScenario {
  const scenario: SavedScenario = {
    id: makeId(),
    name: name.trim() || 'Gespeichertes Szenario',
    savedAt: new Date().toISOString(),
    profile,
    assumptions,
  }
  persistLibrary([...loadLibrary(), scenario])
  return scenario
}

export function deleteFromLibrary(id: string): void {
  persistLibrary(loadLibrary().filter(s => s.id !== id))
}

export function duplicateInLibrary(id: string): void {
  const existing = loadLibrary()
  const original = existing.find(s => s.id === id)
  if (!original) return
  const copy: SavedScenario = {
    ...original,
    id: makeId(),
    name: `${original.name} (Kopie)`,
    savedAt: new Date().toISOString(),
  }
  persistLibrary([...existing, copy])
}

export function renameInLibrary(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  persistLibrary(loadLibrary().map(s => (s.id === id ? { ...s, name: trimmed } : s)))
}
