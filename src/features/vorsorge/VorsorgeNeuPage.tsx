// ---------------------------------------------------------------------------
// VorsorgeNeuPage — container for `/vorsorge/neu` (simplification 2B).
//
// Route entry point for "Vertrag hinzufügen" from the plan. Two shapes:
//
//   /vorsorge/neu                    → contract picker (choose a product)
//   /vorsorge/neu?produkt=<ProductId> → straight into the editor for a new
//                                       instance of that product
//
// The product id travels in the query string rather than the `Route` tagged
// union, matching the `?scenario=` convention on `/vergleich/details`: the URL
// stays the source of truth, the union stays narrow.
//
// This file is plumbing only. `ContractPickerProps` is the contract the 2B UI
// agent implements against; the body below the PLACEHOLDER marker is a
// throwaway list that proves the wiring.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { ContractPicker } from './ContractPicker'
import type { ProductId } from '../../domain'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { PRODUCT_REGISTRY, type ProductManifestEntry } from '../../engine/productRegistry'
import {
  usePortfolioState,
  type AnyInstance,
  type WorkspaceUndo,
} from '../../app/portfolioState'
import { useContractDraft } from '../inventory/useContractDraft'
import { draftToNewInstance } from '../inventory/contractDraft'
import type {
  ContractDraft,
  ContractDraftErrors,
  ContractFieldSpec,
  ContractFieldValue,
} from '../inventory/contractDraft'
import type { MultiInstanceProductId } from '../inventory/inventoryProductRegistry'
import type { FieldStatus } from '../inventory/onboardingDraft'

/** Registry metadata in registry order — the picker's option list. */
const PRODUCT_METADATA: readonly ProductManifestEntry[] = PRODUCT_REGISTRY.map((e) => e.metadata)

/**
 * Props for the not-yet-written presentational contract picker / new-contract
 * editor host. Supplied entirely by this container.
 */
export interface ContractPickerProps {
  /**
   * The product resolved from `?produkt=`, or `null` when the user arrived
   * without one and must pick first. Unknown / malformed values resolve to
   * `null` rather than erroring — an unrecognised query param must never be a
   * dead end.
   */
  selectedProductId: ProductId | null
  /** Registry metadata for `selectedProductId` (label, colour, order), when resolved. */
  selectedProduct: ProductManifestEntry | undefined
  /** Metadata for every product that can hold an instance, in registry order. */
  availableProducts: readonly ProductManifestEntry[]
  /**
   * Choose a product. Pushes `?produkt=<id>` so the choice is shareable and
   * survives reload / back-forward.
   */
  onSelectProduct: (productId: ProductId) => void
  /** Leave without saving — returns to the plan. Drafts are discarded. */
  onCancel: () => void
  /** SPA navigator for any deeper link the editor needs. */
  navigate: (target: Route, search?: string) => void

  // --- draft editing (2B mechanical) ---------------------------------------
  /**
   * Draft for the new contract, seeded from the product registry's defaults.
   * The current value and the monthly contribution start unanswered: a new
   * contract has no defensible default for either, so the user types a number
   * (0 included) or ticks "Weiß ich nicht" before `save` will write anything.
   */
  draft: ContractDraft
  /** Field declarations whose `visibleWhen` currently holds — render exactly these. */
  fieldSpecs: readonly ContractFieldSpec[]
  patchField: (id: string, value: ContractFieldValue, status?: FieldStatus) => void
  /** Tick "Weiß ich nicht". Never writes 0, never touches a neighbouring field. */
  setFieldUnknown: (id: string) => void
  errors: ContractDraftErrors
  dirty: boolean
  /**
   * Add the contract to the plan. Returns `false` (and writes nothing) when a
   * product has not been chosen yet or validation fails.
   */
  save: () => boolean
  undo: (handle: WorkspaceUndo) => void
}

interface Props {
  navigate: (target: Route, search?: string) => void
}

/**
 * Read `?produkt=<ProductId>` from a search string. Returns `null` for an
 * absent, empty or unregistered value.
 */
function resolveProduktParam(search: string): ProductId | null {
  const trimmed = search.startsWith('?') ? search.slice(1) : search
  if (!trimmed) return null
  let value: string | null
  try {
    value = new URLSearchParams(trimmed).get('produkt')
  } catch {
    return null
  }
  if (!value) return null
  const entry = PRODUCT_REGISTRY.find((e) => e.metadata.id === value)
  return entry ? (entry.metadata.id as ProductId) : null
}

export function VorsorgeNeuPage({ navigate }: Props) {
  const portfolioState = usePortfolioState()
  const [selectedProductId, setSelectedProductId] = useState<ProductId | null>(() =>
    typeof window === 'undefined' ? null : resolveProduktParam(window.location.search),
  )

  // Seeded with a placeholder product until the user picks one, so the hook
  // runs unconditionally. `save` refuses while `selectedProductId` is null.
  const draftProductId = (selectedProductId ?? 'etf') as MultiInstanceProductId
  const contractDraft = useContractDraft({
    productId: draftProductId,
    instance: null,
    workspace: portfolioState.workspace,
  })

  // Re-selecting a product must start from a clean draft. The hook re-seeds on
  // a `productId` change, but `'etf'` doubles as the placeholder while nothing
  // is picked, so ETF → picker → ETF (and null → ETF) would otherwise keep the
  // half-finished draft the user just walked away from.
  const seededFor = useRef(selectedProductId)
  useEffect(() => {
    if (seededFor.current === selectedProductId) return
    seededFor.current = selectedProductId
    contractDraft.reset()
  }, [selectedProductId, contractDraft])

  // Keep the resolved product in step with browser back/forward and with any
  // in-app navigation that rewrites the query string.
  useEffect(() => {
    function resync() {
      setSelectedProductId(resolveProduktParam(window.location.search))
    }
    window.addEventListener('rentenwiki:navigated', resync)
    return () => window.removeEventListener('rentenwiki:navigated', resync)
  }, [])

  useEffect(() => {
    document.title = 'Vorsorge hinzufügen | RentenWiki.de'
  }, [])

  const props: ContractPickerProps = {
    selectedProductId,
    selectedProduct: PRODUCT_METADATA.find((m) => m.id === selectedProductId),
    availableProducts: PRODUCT_METADATA,
    onSelectProduct: (productId) => {
      setSelectedProductId(productId)
      navigate(ROUTES.vorsorgeNeu, `?produkt=${encodeURIComponent(productId)}`)
    },
    onCancel: () => navigate(ROUTES.home),
    navigate,
    draft: contractDraft.draft,
    fieldSpecs: contractDraft.visibleSpecs,
    patchField: contractDraft.patchField,
    setFieldUnknown: contractDraft.setFieldUnknown,
    errors: contractDraft.errors,
    dirty: contractDraft.dirty,
    save: () => {
      if (!selectedProductId || !contractDraft.valid) return false
      const { inputStatus } = contractDraft.toPatch()
      const instance = draftToNewInstance(contractDraft.draft) as unknown as AnyInstance
      portfolioState.addPopulatedInstance(draftProductId, instance, inputStatus)
      navigate(ROUTES.home)
      return true
    },
    undo: portfolioState.undo,
  }

  return (
    <div data-testid="vorsorge-neu">
      <ContractPicker {...props} retirementEndAge={portfolioState.workspace.baseline.assumptions.retirementEndAge} />
    </div>
  )
}
