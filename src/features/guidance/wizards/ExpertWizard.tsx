/**
 * Expert path short-circuits in GuidedSetup.pickPath before a wizard is ever
 * rendered — this component exists only to satisfy the complete
 * Record<GuidedPath, ComponentType<WizardProps>> registry type.
 */
export function ExpertWizard() {
  return null
}
