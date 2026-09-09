/**
 * `useContractDraft` — component-local draft state for the contract editor.
 *
 * Sibling of `useOnboardingDraft.ts`. Holds the draft until the user saves;
 * cancelling simply unmounts. Nothing here persists: the caller passes
 * `toPatch()` to `usePortfolioState().updateInstance` / `addPopulatedInstance`
 * (lead decision "Contract editor draft state is component-local").
 *
 * The draft re-seeds when the edited contract changes (`instanceId`) or when
 * the product changes — not on every render of the same contract, so typing is
 * never clobbered by a workspace re-render.
 */

import { useCallback, useMemo, useState } from 'react'
import type { Workspace } from '../../domain/workspace'
import type { MultiInstanceProductId } from './inventoryProductRegistry'
import type { FieldStatus } from './onboardingDraft'
import {
  contractDraftDirty,
  draftFromInstance,
  draftToInstancePatch,
  fieldSpecs,
  isDraftValid,
  newDraftFromWorkspace,
  patchDraftField,
  setDraftFieldUnknown,
  validateDraft,
  visibleFieldSpecs,
  type ContractDraft,
  type ContractDraftErrors,
  type ContractDraftPatch,
  type ContractFieldSpec,
  type ContractFieldValue,
} from './contractDraft'

export interface UseContractDraftOptions {
  productId: MultiInstanceProductId
  /** The contract being edited, or `null` to start a new one. */
  instance: Record<string, unknown> | null
  /** Live workspace — supplies the saver's age when seeding a new contract. */
  workspace: Workspace
  /** Overridable for deterministic tests. */
  currentYear?: number
}

export interface UseContractDraftApi {
  draft: ContractDraft
  /** Every spec for the product, including conditionally-hidden ones. */
  specs: readonly ContractFieldSpec[]
  /** Specs whose `visibleWhen` currently holds — what the editor renders. */
  visibleSpecs: readonly ContractFieldSpec[]
  patchField: (id: string, value: ContractFieldValue, status?: FieldStatus) => void
  setFieldUnknown: (id: string) => void
  errors: ContractDraftErrors
  /** `true` when every visible field passes validation. */
  valid: boolean
  dirty: boolean
  /** The instance patch plus its status/evidence maps. Does not validate. */
  toPatch: () => ContractDraftPatch
  /** Discard every edit and re-seed from the instance (or the registry default). */
  reset: () => void
}

function seedDraft(options: UseContractDraftOptions): ContractDraft {
  return options.instance
    ? draftFromInstance(options.productId, options.instance)
    : newDraftFromWorkspace(options.productId, options.workspace, options.currentYear)
}

export function useContractDraft(options: UseContractDraftOptions): UseContractDraftApi {
  const { productId, instance, workspace, currentYear } = options
  const instanceId = typeof instance?.instanceId === 'string' ? instance.instanceId : null

  // Re-seed only when the identity of the edited contract changes. `workspace`
  // is deliberately not a dependency: a background re-render of the plan must
  // not throw away what the user is typing.
  const initial = useMemo(
    () => seedDraft({ productId, instance, workspace, currentYear }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productId, instanceId],
  )

  // Derived state: the draft resets when `initial` changes identity, i.e. when
  // the edited contract changes. Storing the seed alongside the draft (rather
  // than in a ref) keeps the comparison a plain render-time state adjustment.
  const [state, setState] = useState<{ seed: ContractDraft; draft: ContractDraft }>({
    seed: initial,
    draft: initial,
  })
  if (state.seed !== initial) setState({ seed: initial, draft: initial })
  const draft = state.seed === initial ? state.draft : initial

  const setDraft = useCallback(
    (update: (current: ContractDraft) => ContractDraft) => {
      setState((current) => ({ ...current, draft: update(current.draft) }))
    },
    [],
  )

  const patchField = useCallback(
    (id: string, value: ContractFieldValue, status: FieldStatus = 'entered') => {
      setDraft((current) => patchDraftField(current, id, value, status))
    },
    [setDraft],
  )

  const setFieldUnknown = useCallback((id: string) => {
    setDraft((current) => setDraftFieldUnknown(current, id))
  }, [setDraft])

  const reset = useCallback(() => {
    setState((current) => ({ ...current, draft: current.seed }))
  }, [])

  const errors = useMemo(() => validateDraft(draft), [draft])
  const toPatch = useCallback(() => draftToInstancePatch(draft), [draft])

  return {
    draft,
    specs: fieldSpecs(productId),
    visibleSpecs: visibleFieldSpecs(draft),
    patchField,
    setFieldUnknown,
    errors,
    valid: isDraftValid(errors),
    dirty: contractDraftDirty(draft, initial),
    toPatch,
    reset,
  }
}
