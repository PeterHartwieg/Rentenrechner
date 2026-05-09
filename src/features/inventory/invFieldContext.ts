/**
 * Shared React context that carries the generated input id from a field
 * wrapper (InvField / CombineField) to its child control (InvNumber,
 * InvSelect, InvText, DraftNumberInput, etc.) so that
 * `<label htmlFor>` → `<input id>` is wired automatically.
 *
 * Lives in its own file to satisfy the react-refresh/only-export-components
 * ESLint rule — fields.tsx exports only React components.
 */

import { createContext, useContext } from 'react'

export const InvFieldContext = createContext<string | undefined>(undefined)

/** Returns the input id provided by the nearest InvField/CombineField ancestor. */
export function useInvFieldId(): string | undefined {
  return useContext(InvFieldContext)
}
