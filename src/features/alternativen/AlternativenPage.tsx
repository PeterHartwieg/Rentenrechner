// ---------------------------------------------------------------------------
// AlternativenPage — container for `/alternativen` (simplification Phase 3).
//
// The saved "Was wäre wenn"-Alternativen of the plan. Two shapes:
//
//   /alternativen              → the list of saved alternatives
//   /alternativen?id=<whatIfId> → one alternative opened against the baseline
//
// The what-if id travels in the query string rather than the `Route` tagged
// union, matching the `?produkt=` convention on `/vorsorge/neu` and
// `?scenario=` on `/vergleich/details`: the URL stays the source of truth,
// the union stays narrow.
//
// This file is plumbing only. `AlternativenHostProps` is the contract the
// Phase 3 UI agent implements against; the body below the PLACEHOLDER marker
// is a throwaway list that proves the wiring. Everything stateful lives in
// `useAlternativenFlow`, so the surface can be written as a pure function of
// these props — it never reaches for `usePortfolioState`, the simulation or
// the what-if helpers itself.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { AlternativenSurface } from './AlternativenSurface'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import type { WhatIfScenario, Workspace } from '../../domain/workspace'
import { usePortfolioState } from '../../app/portfolioState'
import { useCombineSimulation, type CombineSimulationState } from '../../app/useCombineSimulation'
import { pickBasisScenarioId, resolveWhatIfParam } from './alternativenParams'
import { useAlternativenFlow, type AlternativenFlow } from './useAlternativenFlow'

/**
 * Props for the not-yet-written presentational alternatives surface. Supplied
 * entirely by this container.
 *
 * Everything the before/after flow needs — contracts, draft, preview, saved
 * alternatives, apply/rebase/remove/undo and the notification — arrives via
 * `AlternativenFlow`. The fields below it are the surrounding context.
 */
export interface AlternativenHostProps extends AlternativenFlow {
  /** The live workspace. `workspace.baseline` is the plan every alternative is measured against. */
  workspace: Workspace
  /**
   * The baseline simulation — the reference the opened alternative is compared
   * with. Carries its own `error` field; the host renders the error state
   * rather than throwing.
   */
  baselineSimulation: CombineSimulationState
  /** Every saved alternative scenario, in workspace order. */
  whatIfs: readonly WhatIfScenario[]
  /** The return scenario both sides of every comparison are read on. */
  scenarioId: string
  /** SPA navigator for any deeper link the surface needs. */
  navigate: (target: Route, search?: string) => void
  /** Leave the alternatives surface and go back to the plan. */
  onReturnToPlan: () => void
}

interface Props {
  navigate: (target: Route, search?: string) => void
}

export function AlternativenPage({ navigate }: Props) {
  const portfolioState = usePortfolioState()
  const workspace = portfolioState.workspace
  const baselineSimulation = useCombineSimulation(workspace)

  const [requestedId, setRequestedId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : resolveWhatIfParam(window.location.search),
  )

  // Keep the selection in step with browser back/forward and with any in-app
  // navigation that rewrites the query string.
  useEffect(() => {
    function resync() {
      setRequestedId(resolveWhatIfParam(window.location.search))
    }
    window.addEventListener('rentenwiki:navigated', resync)
    return () => window.removeEventListener('rentenwiki:navigated', resync)
  }, [])

  useEffect(() => {
    document.title = 'Alternativen | RentenWiki.de'
  }, [])

  const whatIfs = workspace.whatIfs
  const scenarioId = pickBasisScenarioId(workspace)

  // Opening a saved alternative rewrites the query string, so the URL stays the
  // source of truth for the selection; the flow keeps its own copy in step.
  const onOpenSaved = useCallback(
    (id: string | null) => {
      navigate(ROUTES.alternativen, id === null ? '' : `?id=${encodeURIComponent(id)}`)
    },
    [navigate],
  )

  const flow = useAlternativenFlow({
    workspace,
    portfolioState,
    baselineSimulation,
    scenarioId,
    // An id that no longer resolves falls back to the list, not to an error.
    requestedWhatIfId: requestedId,
    onOpenSaved,
  })

  const props: AlternativenHostProps = {
    ...flow,
    workspace,
    baselineSimulation,
    whatIfs,
    scenarioId,
    navigate,
    onReturnToPlan: () => navigate(ROUTES.home),
  }

  const open = whatIfs.find((w) => w.id === props.openWhatIfId)

  return <AlternativenSurface key={open?.id ?? 'draft'} {...props} />
}
