// ---------------------------------------------------------------------------
// VertragBearbeitenPage — container for `/vertrag/:instanceId/bearbeiten`
// (simplification 2B).
//
// Sibling of the read-only `/vertrag/:instanceId` detail page: same instance,
// editable. Resolution walks the workspace product arrays through
// `listWorkspaceInstances`, which is registry-driven — so the `versicherung`
// (ProductId) ↔ `insurance` (workspace array key) mismatch is handled by the
// registry's `assumptionsKey`, not by a parallel lookup table here.
//
// An unknown id renders the same empty state the detail page uses rather than
// redirecting: a stale bookmark or a deleted contract must land somewhere that
// explains itself.
//
// Plumbing only. `ContractEditorHostProps` is the contract the 2B UI agent
// implements against; draft state is component-local in *that* component, and
// saving goes through `updateInstance` (Phase 3 owns that mutator).
// ---------------------------------------------------------------------------

import { useEffect } from 'react'
import { ContractEditorHost } from './ContractEditorHost'
import type { ProductId } from '../../domain'
import type { Workspace } from '../../domain/workspace'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { usePortfolioState, type WorkspaceUndo } from '../../app/portfolioState'
import {
  listWorkspaceInstances,
  type AnyWorkspaceInstance,
} from '../../app/resultReadiness'
import { getProductMeta } from '../../app/productPresentation'
import { useContractDraft } from '../inventory/useContractDraft'
import type {
  ContractDraft,
  ContractDraftErrors,
  ContractFieldSpec,
  ContractFieldValue,
} from '../inventory/contractDraft'
import type { MultiInstanceProductId } from '../inventory/inventoryProductRegistry'
import type { FieldStatus } from '../inventory/onboardingDraft'
import type { AnyInstance } from '../../app/portfolioState'

/**
 * Props for the not-yet-written presentational contract editor. Supplied
 * entirely by this container.
 */
export interface ContractEditorHostProps {
  /** The instance being edited, or `null` when the id resolves to nothing. */
  instance: AnyWorkspaceInstance | null
  /** Product the instance belongs to, or `null` alongside a null instance. */
  productId: ProductId | null
  /** Display label for the product (registry `metadata.label`), when resolved. */
  productLabel: string | null
  /** The id from the URL — echo it in the empty state so the user can see what failed. */
  instanceId: string
  /** Live workspace, for cross-instance context (transfer targets, caps). */
  workspace: Workspace
  /** Save and return to the plan. Wired by 2B against `updateInstance`. */
  onSaved: () => void
  /** Discard the draft and return to the plan. */
  onCancel: () => void
  /** Open the read-only detail view of the same instance. */
  onOpenDetail: () => void
  navigate: (target: Route, search?: string) => void

  // --- draft editing (2B mechanical) ---------------------------------------
  /** Component-local draft. Nothing is written to the workspace until `save`. */
  draft: ContractDraft
  /** Field declarations whose `visibleWhen` currently holds — render exactly these. */
  fieldSpecs: readonly ContractFieldSpec[]
  patchField: (id: string, value: ContractFieldValue, status?: FieldStatus) => void
  /** Tick "Weiß ich nicht". Never writes 0, never touches a neighbouring field. */
  setFieldUnknown: (id: string) => void
  errors: ContractDraftErrors
  dirty: boolean
  /**
   * Persist the draft. Returns `false` (and writes nothing) when validation
   * fails, so the editor can keep the user in place with its error messages.
   */
  save: () => boolean
  /** Discard the draft and return to the plan. */
  cancel: () => void
  /**
   * Remove this contract, cleaning up transfer references, pins and visibility.
   * Returns the undo handle, or `null` when there is nothing to remove.
   */
  remove: () => WorkspaceUndo | null
  undo: (handle: WorkspaceUndo) => void
}

interface Props {
  instanceId: string
  navigate: (target: Route, search?: string) => void
}

/**
 * Find an instance by id anywhere in the workspace. Returns the owning
 * product id alongside it so the caller does not have to re-derive the slot
 * from the id prefix.
 */
function findWorkspaceInstance(
  workspace: Workspace,
  instanceId: string,
): { productId: ProductId; instance: AnyWorkspaceInstance } | null {
  for (const entry of listWorkspaceInstances(workspace.baseline.assumptions)) {
    if (entry.instance.instanceId === instanceId) return entry
  }
  return null
}

export function VertragBearbeitenPage({ instanceId, navigate }: Props) {
  const portfolioState = usePortfolioState()
  const workspace = portfolioState.workspace
  const found = findWorkspaceInstance(workspace, instanceId)
  const productLabel = found ? getProductMeta(found.productId)?.label ?? found.productId : null

  // The draft hook must run on every render, including the not-found path, so
  // it is seeded with a harmless placeholder product when nothing resolved.
  // That branch renders the empty state and never reads the draft.
  const productId = (found?.productId ?? 'etf') as MultiInstanceProductId
  const contractDraft = useContractDraft({
    productId,
    instance: (found?.instance ?? null) as Record<string, unknown> | null,
    workspace,
  })

  useEffect(() => {
    document.title = found
      ? `${found.instance.label || productLabel} bearbeiten | RentenWiki.de`
      : 'Vertrag bearbeiten | RentenWiki.de'
  }, [found, productLabel])

  const props: ContractEditorHostProps = {
    instance: found?.instance ?? null,
    productId: found?.productId ?? null,
    productLabel,
    instanceId,
    workspace,
    onSaved: () => navigate(ROUTES.home),
    onCancel: () => navigate(ROUTES.home),
    onOpenDetail: () => navigate(ROUTES.vertrag(instanceId)),
    navigate,
    draft: contractDraft.draft,
    fieldSpecs: contractDraft.visibleSpecs,
    patchField: contractDraft.patchField,
    setFieldUnknown: contractDraft.setFieldUnknown,
    errors: contractDraft.errors,
    dirty: contractDraft.dirty,
    save: () => {
      if (!found || !contractDraft.valid) return false
      const { patch, inputStatus, evidenceMap } = contractDraft.toPatch()
      portfolioState.updateInstance(
        productId,
        instanceId,
        { ...patch, evidenceMap } as Partial<AnyInstance>,
        inputStatus,
      )
      navigate(ROUTES.home)
      return true
    },
    cancel: () => navigate(ROUTES.home),
    remove: () => (found ? portfolioState.removeInstance(productId, instanceId) : null),
    undo: portfolioState.undo,
  }

  return <ContractEditorHost key={instanceId} {...props} />
}
