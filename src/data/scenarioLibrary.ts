import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { migrateAndValidateState } from '../storage'

export interface SavedScenario {
  id: string
  name: string
  savedAt: string
  /**
   * Schema version of the persisted profile/assumptions shape. Bumped when
   * the profile / assumptions schema changes in a way that requires an
   * explicit migration. New saves always carry the current version; old
   * entries are migrated transparently on read.
   */
  schemaVersion: number
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
}

const LIBRARY_KEY = 'rentenrechner-library-v1'
/**
 * Schema version for the saved-scenario library entries.
 * Version 2: entries carry v2 WorkspaceAssumptionsV2 instance arrays.
 * Version 1: entries carry v1 singleton ScenarioAssumptions; auto-migrated on read.
 * Entries with schemaVersion > SAVED_SCENARIO_VERSION are rejected (forward-compat guard).
 */
export const SAVED_SCENARIO_VERSION = 2

/**
 * Validate a single raw library entry. Runs the same migration + validation
 * pipeline as the main state loader, so library entries cannot bypass schema
 * checks. Returns `null` for malformed or invalid entries; the caller drops
 * those silently rather than throwing the whole library away.
 */
function migrateSavedScenario(raw: unknown): SavedScenario | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>

  if (typeof obj.id !== 'string' || obj.id.length === 0) return null
  if (typeof obj.name !== 'string' || obj.name.length === 0) return null
  if (typeof obj.savedAt !== 'string') return null

  // Reject entries from a future major schema version we don't understand —
  // pre-Group-G code shouldn't try to interpret a v2 instance-array entry.
  // Missing schemaVersion is treated as v1 for backward compatibility with
  // entries written before the field existed.
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1
  if (version > SAVED_SCENARIO_VERSION) return null

  const validated = migrateAndValidateState(obj.profile, obj.assumptions)
  if (!validated) return null

  return {
    id: obj.id,
    name: obj.name,
    savedAt: obj.savedAt,
    schemaVersion: SAVED_SCENARIO_VERSION,
    profile: validated.profile,
    assumptions: validated.assumptions,
  }
}

export function loadLibrary(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: SavedScenario[] = []
    for (const item of parsed) {
      const migrated = migrateSavedScenario(item)
      if (migrated) out.push(migrated)
    }
    return out
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
    schemaVersion: SAVED_SCENARIO_VERSION,
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
    schemaVersion: SAVED_SCENARIO_VERSION,
  }
  persistLibrary([...existing, copy])
}

export function renameInLibrary(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  persistLibrary(loadLibrary().map(s => (s.id === id ? { ...s, name: trimmed } : s)))
}
