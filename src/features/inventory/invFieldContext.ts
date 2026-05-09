/**
 * Shared React context that carries the generated input id and optional
 * aria-describedby id from a field wrapper (InvField / CombineField) to
 * its child control (InvNumber, InvSelect, InvText, DraftNumberInput, etc.)
 * so that `<label htmlFor>` → `<input id>` association and
 * `aria-describedby` on the form control work for screen readers.
 *
 * Lives in its own file to satisfy the react-refresh/only-export-components
 * ESLint rule — fields.tsx exports only React components.
 */

import { createContext, useContext } from 'react'

export interface InvFieldContextValue {
  id: string
  describedById?: string
}

export const InvFieldContext = createContext<InvFieldContextValue | undefined>(undefined)

/** Returns the context value provided by the nearest InvField/CombineField ancestor. */
export function useInvFieldContext(): InvFieldContextValue | undefined {
  return useContext(InvFieldContext)
}
