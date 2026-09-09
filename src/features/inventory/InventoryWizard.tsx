import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Scenario } from '../../domain/workspace'
import { ModalSlot } from '../../ui/chrome/ModalSlot'
import { useFeedbackTarget } from '../qa-feedback'
import { useOnboardingDraft } from './useOnboardingDraft'
import { OnboardingProfileStep } from './OnboardingProfileStep'
import { OnboardingPensionStep } from './OnboardingPensionStep'
import './InventoryWizard.css'

export interface InventoryWizardProps {
  scenario: Scenario
  initialStep?: 'profile' | 'pension'
  mode: 'onboarding' | 'edit'
  onComplete: (scenario: Scenario) => void
  onDismiss: () => void
}

/** Two short drafts; only a successful commit hands a scenario to the host. */
export function InventoryWizard({ scenario, initialStep = 'profile', mode, onComplete, onDismiss }: InventoryWizardProps) {
  const draft = useOnboardingDraft({ scenario, initialStep })
  const { step, setStep, errors, commit, patchPension } = draft
  const [attempt, setAttempt] = useState(0)
  const summaryRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // ModalSlot's FocusTrap must not re-mount its effect when a caller rerenders.
  const dismissRef = useRef(onDismiss)
  useEffect(() => { dismissRef.current = onDismiss }, [onDismiss])
  const dismiss = useCallback(() => dismissRef.current(), [])
  const profileStep = step === 'profile'
  const nextStep = mode === 'onboarding' && profileStep
  const primaryLabel = nextStep ? 'Weiter' : mode === 'edit' ? 'Angaben übernehmen' : 'Meinen Plan ansehen'
  const shownErrors = attempt > 0
    ? (nextStep ? Object.values(errors.profile) : [...Object.values(errors.profile), ...Object.values(errors.pension)])
    : []
  const { targetProps: dialogTargetProps } = useFeedbackTarget({ id: 'inventory.wizard.dialog', label: 'Deine Angaben', precision: 'section' })
  const { targetProps: stepTargetProps } = useFeedbackTarget({ id: `inventory.wizard.step${profileStep ? 0 : 1}`, label: profileStep ? 'Über dich' : 'Deine Rente', precision: 'section' })
  const { targetProps: primaryTargetProps } = useFeedbackTarget({ id: `inventory.wizard.step${profileStep ? 0 : 1}.primaryCta`, label: primaryLabel })

  const initializedScenario = useRef<string | null>(null)
  useEffect(() => {
    if (initializedScenario.current === scenario.id) return
    initializedScenario.current = scenario.id
    const pension = scenario.assumptions.statutoryPension
    if (mode === 'onboarding' && !pension.pensionEntryMethod &&
        (pension.pensionBaselineType ?? 'grv') === 'grv' && pension.manualMonthlyGross == null) {
      patchPension('method', 'career')
    }
  }, [mode, scenario.id, scenario.assumptions.statutoryPension, patchPension])

  useEffect(() => {
    // Focus the new step, while ModalSlot keeps the original opener for restore.
    contentRef.current?.focus()
  }, [step])
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus()
  }, [attempt])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (nextStep) {
      if (Object.keys(errors.profile).length > 0) { setAttempt((value) => value + 1); return }
      setAttempt(0)
      setStep('pension')
      return
    }
    const result = commit()
    if (result === null) { setAttempt((value) => value + 1); return }
    // A contract-free plan still needs the explicit edit stamp used by hasStartedPlan.
    onComplete({ ...result, lastEditedAt: Date.now() })
  }

  return (
    <ModalSlot open onClose={dismiss} panelClassName="inventory-modal onboarding-modal"
      title={profileStep ? 'Ein paar Angaben reichen.' : 'Was weißt du schon?'}
      eyebrow={mode === 'edit' ? profileStep ? 'Deine Angaben' : 'Deine Rentenangabe'
        : profileStep ? '1 von 2 · Über dich' : '2 von 2 · Deine Rente'}
      closeLabel="Angaben schließen">
      <div className="inventory-step-content" {...dialogTargetProps}>
        <form noValidate onSubmit={submit}>
          <div className="inventory-body" ref={contentRef} tabIndex={-1} {...stepTargetProps}>
            {shownErrors.length > 0 && <div ref={summaryRef} tabIndex={-1} role="alert" className="inventory-validation-errors">
              <p>Bitte prüfe deine Angaben.</p>
              <ul>{shownErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>
              {!profileStep && Object.keys(errors.profile).length > 0 && <button type="button" className="onboarding-text-button" onClick={() => setStep('profile')}>Persönliche Angaben prüfen</button>}
              {profileStep && !nextStep && Object.keys(errors.pension).length > 0 && <button type="button" className="onboarding-text-button" onClick={() => setStep('pension')}>Rentenangaben prüfen</button>}
            </div>}
            {profileStep ? <OnboardingProfileStep draft={draft} errors={errors.profile} />
              : <OnboardingPensionStep draft={draft} errors={errors.pension} />}
          </div>
          <footer className="inventory-footer">
            <div className="inventory-footer-actions">
              <button type="button" className="inventory-btn-ghost" onClick={() => {
                if (mode === 'edit' || profileStep) dismiss()
                else { setAttempt(0); setStep('profile') }
              }}>{mode === 'edit' ? 'Zurück zum Plan' : profileStep ? 'Zurück' : 'Zurück zu deinen Angaben'}</button>
              <button type="submit" className="inventory-btn-primary" {...primaryTargetProps}>{primaryLabel}</button>
            </div>
            <p className="inventory-footer-note">Keine Steuer-, Rechts- oder Anlageberatung.</p>
          </footer>
        </form>
      </div>
    </ModalSlot>
  )
}
