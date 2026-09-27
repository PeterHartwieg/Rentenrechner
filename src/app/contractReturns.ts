/**
 * Contracts that carry their own `expectedReturn`.
 *
 * Such a contract ignores the shared return scenario. Every surface that
 * names the scenario rate (Mein Plan overview, legacy receipt, sensitivity
 * note) counts them with this one rule so the disclosures cannot drift.
 * Pure and React-free.
 */

import type { WorkspaceAssumptionsV2 } from '../domain/workspace'
import { isCountedInstance, listWorkspaceInstances } from './resultReadiness'

/**
 * Active and paid-up contracts with an explicit `expectedReturn` (0 included).
 * Offers and surrendered contracts do not enter the household result, so
 * they are not counted.
 */
export function countContractsWithOwnReturn(assumptions: WorkspaceAssumptionsV2): number {
  return listWorkspaceInstances(assumptions).filter(({ instance }) =>
    isCountedInstance(instance) && instance.expectedReturn !== undefined).length
}

/** Suffix for a scenario-rate line: " · 2 Verträge mit eigener Rendite", or "" for none. */
export function ownReturnAnnotation(count: number): string {
  if (count <= 0) return ''
  return ` · ${count} ${count === 1 ? 'Vertrag' : 'Verträge'} mit eigener Rendite`
}
