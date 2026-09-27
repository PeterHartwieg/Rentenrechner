import type { InputStatus, InputStatusMap, StatutoryPensionAssumptions } from '../../domain'

type PensionState = {
  statutoryPension: StatutoryPensionAssumptions
  inputStatus?: InputStatusMap
}

/** Select direct points coherently; an unknown answer retains the last numeric value. */
export function applyPensionPoints<T extends PensionState>(
  current: T,
  entgeltpunkte: number | null,
  status: InputStatus = 'entered',
): T & { inputStatus: InputStatusMap } {
  const points = entgeltpunkte ?? current.statutoryPension.currentEntgeltpunkte
  const inputStatus: InputStatusMap = {
    ...current.inputStatus,
    'statutoryPension.currentEntgeltpunkte': entgeltpunkte === null ? 'unknown' : status,
  }
  delete inputStatus['statutoryPension.manualMonthlyGross']
  return {
    ...current,
    statutoryPension: {
      ...current.statutoryPension,
      currentEntgeltpunkte: points,
      manualMonthlyGross: null,
      pensionEntryMethod: { kind: 'points', entgeltpunkte: points },
    },
    inputStatus,
  }
}
