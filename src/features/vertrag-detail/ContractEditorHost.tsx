import { useState } from 'react'
import { ROUTES } from '../../app/useRoute'
import type { WorkspaceUndo } from '../../app/portfolioState'
import type { ContractEditorHostProps } from './VertragBearbeitenPage'
import { ContractEditor } from './ContractEditor'

/** Keeps the undo handle alive when removing makes the container's instance null. */
export function ContractEditorHost(props: ContractEditorHostProps) {
  const [removed, setRemoved] = useState<{ handle: WorkspaceUndo; label: string } | null>(null)
  if (removed) {
    return (
      <section className="contract-editor" data-testid="vertrag-bearbeiten-removed">
        <h1>Vorsorge entfernt</h1>
        <p role="status">„{removed.label}“ entfernt.{' '}
          <button type="button" className="contract-editor__link" onClick={() => {
            props.undo(removed.handle)
            setRemoved(null)
          }}>Rückgängig</button>
        </p>
        <button type="button" className="contract-editor__secondary" onClick={props.cancel}>Zurück zum Plan</button>
      </section>
    )
  }
  if (!props.instance) {
    return (
      <section className="contract-editor" data-testid="vertrag-bearbeiten-empty">
        <h1>Vertrag nicht gefunden</h1>
        <p>Zu <code>{props.instanceId}</code> gibt es keinen Eintrag in deinem Plan. Möglicherweise wurde er entfernt.</p>
        <button type="button" className="contract-editor__link" onClick={props.onCancel}>Zurück zu Mein Plan</button>
      </section>
    )
  }
  return (
    <div data-testid="vertrag-bearbeiten">
      <ContractEditor {...props} mode="edit" productLabel={props.productLabel ?? ''}
        retirementEndAge={props.workspace.baseline.assumptions.retirementEndAge}
        back={props.cancel}
        onOpenDetail={props.onOpenDetail}
        onEditSharedHorizon={() => props.navigate(ROUTES.eingaben)}
        onOpenFurtherInputs={() => props.navigate(ROUTES.eingabenProdukte)}
        remove={() => {
          const label = props.instance?.label || props.productLabel || 'Vorsorge'
          const handle = props.remove()
          if (handle) setRemoved({ handle, label })
        }} />
    </div>
  )
}
