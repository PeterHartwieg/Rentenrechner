/**
 * UI sibling of `src/content/triggers.ts`. Maps each GuidedPath to its wizard
 * component. This is the only file that needs editing when a new trigger
 * (added to triggers.ts) requires a step-2 input form.
 *
 * `expert` is included for type completeness; GuidedSetup short-circuits it
 * before ever reaching step 2, so ExpertWizard is never rendered.
 */

import type { ComponentType } from 'react'
import type { GuidedPath } from '../../../content/triggers'
import type { WizardProps } from './shared'
import { BavOfferWizard } from './BavOfferWizard'
import { EtfVsInsuranceWizard } from './EtfVsInsuranceWizard'
import { ExpertWizard } from './ExpertWizard'
import { RentengapWizard } from './RentengapWizard'

export const WIZARD_REGISTRY: Record<GuidedPath, ComponentType<WizardProps>> = {
  bav_offer: BavOfferWizard,
  etf_vs_insurance: EtfVsInsuranceWizard,
  rentengap: RentengapWizard,
  expert: ExpertWizard as ComponentType<WizardProps>,
}
