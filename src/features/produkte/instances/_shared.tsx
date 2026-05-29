/**
 * Shared primitives for per-instance combine-mode editors mounted from
 * `PRODUCT_UI_REGISTRY.renderInstanceInputs` inside the Sober D
 * `ProdukteEingabenPanel` § 2 disclosure.
 *
 * Architectural posture (CX-PR4-2 R1):
 *   - PR 4 deleted `CombineDashboardSidebar` (and with it the per-product
 *     `*InstanceCard` components). PR 4 R0 then replaced the deleted inline
 *     editors with a route-to-detail-page handler, but the detail page is
 *     read-only — combine-mode users could no longer change any contract
 *     value. Codex CX-PR4-2 flagged this as a P1 architectural regression.
 *   - R1 restores inline editing by hosting the per-product editors here,
 *     keyed off the existing `PRODUCT_UI_REGISTRY` (one method per registry
 *     entry, single-source pattern). The Sober D row's "Bearbeiten" primary
 *     CTA now toggles an inline disclosure that mounts these editors.
 *
 * Reuse posture:
 *   - Field semantics (label set, commit-on-blur, statutory caps) carry over
 *     verbatim from the deleted sidebar cards. We did NOT copy
 *     `CombineDashboardSidebar.css`; styling reuses the existing Sober D
 *     disclosure tokens (`produkte-eingaben-panel__disclosure`) plus inline
 *     primitive wrappers below.
 *   - The shared `CombineField` + `DraftNumberInput` keep their original
 *     names so a reader bouncing between the deleted file's git history and
 *     this file sees the same primitives. The CSS class set is also kept so
 *     no new design tokens are introduced.
 */

import type React from 'react'
import { useId } from 'react'
import type { InstanceCommon } from '../../../domain/instances'
// The legacy `CombineDashboardSidebar` was deleted in PR 4, but its
// editor-card primitives (`combine-field`, `combine-instance-fields`,
// `inv-layer3-*`, `inventory-input-shell`, `inventory-select-shell`)
// still live in `InventoryWizard.css` because the wizard uses them too.
// Importing the wizard sheet here gives the restored instance editors
// the same look-and-feel without copying CSS verbatim — see CX-PR4-2 R1
// brief: "Use the Sober D tokens already established… inline-disclosure
// inputs should follow the disclosure pattern PR 3 introduced".
import '../../inventory/InventoryWizard.css'
import {
  InvFieldContext,
  useInvFieldContext,
} from '../../inventory/invFieldContext'
import { useDraftNumber } from '../../inventory/fieldHelpers'

// ---------------------------------------------------------------------------
// CombineField — labelled wrapper that pipes a generated id into its child
// control via `InvFieldContext`. Mirrors the deleted sidebar's primitive 1:1
// so screen-reader association continues to work the same way.
// ---------------------------------------------------------------------------

export function CombineField({
  label,
  labelSuffix,
  children,
}: {
  label: string
  labelSuffix?: React.ReactNode
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <InvFieldContext.Provider value={{ id }}>
      <div className="combine-field">
        <label htmlFor={id}>
          {label}
          {labelSuffix}
        </label>
        {children}
      </div>
    </InvFieldContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// DraftNumberInput — commit-on-blur numeric input. Same draft-before-commit
// semantics the deleted sidebar used. Pulls the id from `InvFieldContext`
// when present so the label association is automatic.
// ---------------------------------------------------------------------------

export function DraftNumberInput({
  value,
  onCommit,
  id: idProp,
  ...rest
}: {
  value: number
  onCommit: (next: number) => void
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'type'
>) {
  const fieldCtx = useInvFieldContext()
  const { inputProps } = useDraftNumber({ value, onCommit })
  return (
    <input
      type="number"
      id={idProp ?? fieldCtx?.id}
      aria-describedby={fieldCtx?.describedById}
      {...rest}
      {...inputProps}
    />
  )
}

// ---------------------------------------------------------------------------
// Context-aware <input>/<select> wrappers — pick up the field id automatically
// when rendered inside a CombineField.
// ---------------------------------------------------------------------------

export function CombineNativeInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const fieldCtx = useInvFieldContext()
  return (
    <input
      id={props.id ?? fieldCtx?.id}
      aria-describedby={fieldCtx?.describedById}
      {...props}
    />
  )
}

export function CombineNativeSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  const fieldCtx = useInvFieldContext()
  return (
    <select
      id={props.id ?? fieldCtx?.id}
      aria-describedby={fieldCtx?.describedById}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// CommonContractFields — Bezeichnung / Anbieter / Status / Vertragsbeginn /
// Aktueller Vertragswert. Shared by every per-product editor.
// ---------------------------------------------------------------------------

export function CommonContractFields<T extends InstanceCommon>({
  instance,
  onChange,
  currentValueLabel = 'Aktueller Vertragswert',
}: {
  instance: T
  onChange: (next: T) => void
  currentValueLabel?: string
}) {
  return (
    <>
      <CombineField label="Bezeichnung">
        <CombineNativeInput
          type="text"
          value={instance.label}
          onChange={(e) => onChange({ ...instance, label: e.target.value })}
        />
      </CombineField>
      <CombineField label="Anbieter">
        <CombineNativeInput
          type="text"
          value={instance.anbieter ?? ''}
          onChange={(e) =>
            onChange({
              ...instance,
              anbieter:
                e.target.value.trim() === '' ? undefined : e.target.value,
            })
          }
        />
      </CombineField>
      <CombineField label="Status">
        <CombineNativeSelect
          value={instance.status}
          onChange={(e) =>
            onChange({
              ...instance,
              status: e.target.value as InstanceCommon['status'],
            })
          }
        >
          <option value="active">aktiv</option>
          <option value="paid_up">beitragsfrei</option>
          <option value="surrendered">gekündigt</option>
          <option value="offered">Angebot</option>
        </CombineNativeSelect>
      </CombineField>
      <CombineField label="Vertragsbeginn">
        <DraftNumberInput
          value={instance.contractStartYear}
          min={1970}
          max={new Date().getFullYear()}
          step={1}
          onCommit={(v) => onChange({ ...instance, contractStartYear: v })}
        />
      </CombineField>
      <CombineField label={currentValueLabel}>
        <DraftNumberInput
          value={instance.currentValueEUR ?? 0}
          min={0}
          step={100}
          onCommit={(v) => onChange({ ...instance, currentValueEUR: v })}
        />
      </CombineField>
    </>
  )
}
