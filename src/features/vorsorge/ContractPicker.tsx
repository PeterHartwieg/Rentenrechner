import { useId } from 'react'
import { ROUTES } from '../../app/useRoute'
import { productAvailabilityCopy } from '../../content/productAvailabilityCopy'
import type { ProductId } from '../../domain'
import { ContractEditor } from '../vertrag-detail/ContractEditor'
import type { ContractPickerProps } from './VorsorgeNeuPage'
import './ContractPicker.css'

const hints: Partial<Record<ProductId, string>> = {
  etf: 'Dein selbst angelegtes Vermögen',
  bav: 'Vorsorge über deinen Arbeitgeber',
  versicherung: 'Dein privater Versicherungsvertrag',
  basisrente: 'Auch als Rürup-Rente bekannt',
  riester: 'Dein bestehender Riester-Vertrag',
}

export function ContractPicker(props: ContractPickerProps & { retirementEndAge: number }) {
  const id = useId()
  const availability = productAvailabilityCopy.altersvorsorgedepot
  const avdHint = typeof availability === 'function' ? undefined : availability.note ?? availability.label
  if (props.selectedProductId && props.selectedProduct) {
    return (
      <ContractEditor key={props.selectedProductId} {...props}
        mode="new" productLabel={props.selectedProduct.label}
        productHint={props.selectedProductId === 'altersvorsorgedepot' ? avdHint : undefined}
        cancel={props.onCancel} back={() => props.navigate(ROUTES.vorsorgeNeu)}
        onEditSharedHorizon={() => props.navigate(ROUTES.eingaben)}
        onOpenFurtherInputs={() => props.navigate(ROUTES.eingabenProdukte)} />
    )
  }
  return (
    <section className="contract-picker" data-testid="contract-picker">
      <button type="button" className="contract-editor__link" onClick={props.onCancel}>← Zurück zum Plan</button>
      <header>
        <p className="contract-editor__kicker">Vorsorge ergänzen</p>
        <h1>Was möchtest du hinzufügen?</h1>
        <p>Wähle eine Sparform. Angaben kannst du später ändern.</p>
      </header>
      <div className="contract-picker__choices">
        {props.availableProducts.map((product) => (
          <button key={product.id} type="button" className="contract-picker__choice"
            aria-labelledby={`${id}-${product.id}`} onClick={() => props.onSelectProduct(product.id)}>
            <strong id={`${id}-${product.id}`}>{product.label}</strong>
            <span>{product.id === 'altersvorsorgedepot' ? avdHint : hints[product.id]}</span>
            <span className="contract-picker__arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  )
}
