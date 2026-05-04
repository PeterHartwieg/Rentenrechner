/**
 * UI sibling of `src/content/triggers.ts`. Maps each GuidedPath to its wizard
 * component. This is the only file that needs editing when a new trigger
 * (added to triggers.ts) requires a step-2 input form.
 *
 * `expert` is null because GuidedSetup short-circuits the expert path before
 * ever reaching step 2, so no wizard component is needed.
 */

import type { ComponentType } from 'react'
import type { GuidedPath } from '../../../content/triggers'
import type { WizardProps } from './shared'
import { BavOfferWizard } from './BavOfferWizard'
import { EtfVsInsuranceWizard } from './EtfVsInsuranceWizard'
import { RentengapWizard } from './RentengapWizard'
import { LowIncomeParentWizard } from './LowIncomeParentWizard'
import { BeamterWizard } from './BeamterWizard'

export const WIZARD_REGISTRY: Record<GuidedPath, ComponentType<WizardProps> | null> = {
  bav_offer: BavOfferWizard,
  etf_vs_insurance: EtfVsInsuranceWizard,
  rentengap: RentengapWizard,
  low_income_parent: LowIncomeParentWizard,
  beamter: BeamterWizard,
  expert: null,
}
