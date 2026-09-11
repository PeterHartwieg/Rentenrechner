import type { Workspace } from '../../domain/workspace'
import { getProductMeta } from '../../app/productPresentation'
import { CONTRIBUTION_LABEL_BY_PRODUCT } from '../../app/planSummary'
import { CONTRIBUTION_FIELD_BY_PRODUCT, listWorkspaceInstances } from '../../app/resultReadiness'
import type { PlanOfferRow } from './PlanOverview'

/**
 * Unsigned offers (`status: 'offered'`) in registry order, shaped for the
 * plan's "Angebote" list. Offers never count towards the household total
 * (`isCountedInstance`), which is exactly why they need their own list:
 * otherwise an entered offer vanished from the overview (audit F04).
 */
export function selectPlanOffers(workspace: Workspace): PlanOfferRow[] {
  return listWorkspaceInstances(workspace.baseline.assumptions)
    .filter(({ instance }) => instance.status === 'offered')
    .map(({ productId, instance }) => {
      const raw = (instance as unknown as Record<string, unknown>)[CONTRIBUTION_FIELD_BY_PRODUCT[productId]]
      return {
        instanceId: instance.instanceId,
        label: instance.label?.trim().length ? instance.label : (getProductMeta(productId)?.label ?? productId),
        productLabel: getProductMeta(productId)?.label ?? productId,
        contributionMonthly: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
        contributionLabel: CONTRIBUTION_LABEL_BY_PRODUCT[productId],
      }
    })
}
