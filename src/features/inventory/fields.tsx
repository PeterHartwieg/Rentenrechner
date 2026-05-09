/**
 * Shared inventory field components.
 *
 * Extracted from InstanceCard.tsx (wizard) so the combine sidebar can share
 * the same rendering and commit semantics. Issue 10 (architecture-readability).
 *
 * Non-component exports (toNumber, option tables) live in fieldHelpers.ts so
 * that the react-refresh/only-export-components ESLint rule is satisfied.
 *
 * CSS classes used (already in InventoryWizard.css):
 *   .inventory-field  .inventory-field-hint
 *   .inventory-input-shell  .inventory-select-shell
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// InvField
// ---------------------------------------------------------------------------

/**
 * Labelled field wrapper for inventory cards.
 *
 * Renders a `<div className="inventory-field">` containing a `<span>` label,
 * the child input control, and an optional hint paragraph.
 */
export function InvField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="inventory-field">
      <span>{label}</span>
      {children}
      {hint && <p className="inventory-field-hint">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvNumber
// ---------------------------------------------------------------------------

/**
 * Numeric input with commit-on-blur / commit-on-Enter semantics.
 *
 * Maintains a local draft string so the user can type freely without every
 * keystroke triggering onChange. The value is committed on blur or Enter.
 * Live updates still fire on every valid keystroke so callers can react
 * immediately without waiting for blur.
 */
export function InvNumber({
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  disabled?: boolean
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const displayValue = draft ?? (Number.isFinite(value) ? String(value) : '0')

  function commit() {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    if (raw.trim() === '') return
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChange(next)
  }

  return (
    <div className="inventory-input-shell" aria-disabled={disabled || undefined}>
      <input
        type="number"
        value={displayValue}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return
          const raw = e.target.value
          setDraft(raw)
          if (raw.trim() === '') return
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
        }}
      />
      {suffix && <em>{suffix}</em>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvSelect
// ---------------------------------------------------------------------------

/**
 * Single-select wrapped in `.inventory-select-shell`.
 */
export function InvSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="inventory-select-shell">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvText
// ---------------------------------------------------------------------------

/**
 * Plain text input wrapped in `.inventory-input-shell`.
 */
export function InvText({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inventory-input-shell">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
