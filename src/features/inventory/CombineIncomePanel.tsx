/**
 * CombineIncomePanel — shows the combined monthly retirement income for the
 * combine-mode dashboard (Group G issue 08 + 09).
 *
 * Renders the aggregate `monthlyNetIncome` for the selected scenario and —
 * when any underlying instance has `inputConfidence === 'model_estimate'` —
 * a yellow "🤔 Teilweise geschätzt" badge. Clicking the badge opens a small
 * popover listing which instances/fields are estimated.
 *
 * This panel is intentionally minimal: it receives pre-computed values so
 * no simulation re-runs occur here.
 */

import './InventoryWizard.css'
import { useState, useRef, useEffect } from 'react'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import type { EvidenceState } from '../../domain/instances'
import { formatCurrency } from '../../utils/format'
import { useFeedbackTarget } from '../qa-feedback'
import { PRODUCT_EVIDENCE_FIELDS, EVIDENCE_FIELD_GERMAN_LABELS } from '../../app/evidence'
import { evidenceStateToProvKind } from '../results/provenanceHelpers'

interface CombineIncomePanelProps {
  combinedResult: CombinedResult
  perInstanceResults: Record<string, ProductResult[]>
  scenarioId: string
  scenarioLabel: string
  /** Maps instanceId → evidenceMap for per-field estimate detail in the popover. */
  instanceEvidenceMaps?: Record<string, Record<string, EvidenceState>>
}

export function CombineIncomePanel({
  combinedResult,
  perInstanceResults,
  scenarioId,
  scenarioLabel,
  instanceEvidenceMaps,
}: CombineIncomePanelProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: 'combine.incomePanel.section',
    label: 'Monatliches Nettoeinkommen im Ruhestand',
    precision: 'section',
  })
  const { targetProps: labelProps } = useFeedbackTarget({
    id: 'combine.incomePanel.label',
    label: 'Income-Panel Überschrift',
  })
  const { targetProps: valueProps } = useFeedbackTarget({
    id: 'combine.incomePanel.value',
    label: 'Monatliches Nettoeinkommen Wert',
  })
  const { targetProps: scenarioProps } = useFeedbackTarget({
    id: 'combine.incomePanel.scenario',
    label: 'Aktives Szenario',
  })
  const { targetProps: estimateBadgeProps } = useFeedbackTarget({
    id: 'combine.incomePanel.estimateBadge',
    label: 'Teilweise-geschätzt-Badge',
  })
  const { targetProps: estimatePopoverProps } = useFeedbackTarget({
    id: 'combine.incomePanel.estimatePopover',
    label: 'Liste der geschätzten Eingaben',
  })

  useEffect(() => {
    if (!popoverOpen) return
    function handlePointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [popoverOpen])

  // Collect all instance results for the selected scenario.
  const allResults: ProductResult[] = Object.values(perInstanceResults)
    .map((arr) => arr.find((r) => r.scenarioId === scenarioId))
    .filter((r): r is ProductResult => r !== undefined)

  // Instances with explicit model_estimate evidence.
  // When instanceEvidenceMaps is provided for an instance, only count fields
  // explicitly set to 'model_estimate' — absent fields (zero values, "übernommen")
  // must not trigger the badge. Without a map entry, fall back to inputConfidence.
  const estimatedResults = allResults.filter((r) => {
    const instanceId = r.instanceId ?? r.productId
    if (instanceEvidenceMaps !== undefined && instanceId in instanceEvidenceMaps) {
      return Object.values(instanceEvidenceMaps[instanceId]).some(
        (state) => state === 'model_estimate',
      )
    }
    return r.inputConfidence === 'model_estimate'
  })
  const hasEstimates = estimatedResults.length > 0

  return (
    <div className="combine-income-panel" {...sectionTargetProps}>
      <p className="combine-income-label" {...labelProps}>Monatliches Nettoeinkommen im Ruhestand</p>
      <div className="combine-income-row">
        <span className="combine-income-value" {...valueProps}>
          {formatCurrency(combinedResult.monthlyNetIncome, 0)}/Monat
        </span>
        <span className="combine-income-scenario" {...scenarioProps}>{scenarioLabel}</span>
        {hasEstimates && (
          <span style={{ position: 'relative' }} ref={wrapRef}>
            <button
              type="button"
              className="combine-estimate-summary-badge"
              onClick={() => setPopoverOpen((v) => !v)}
              aria-expanded={popoverOpen}
              aria-haspopup="true"
              {...estimateBadgeProps}
            >
              {'🤔'} Teilweise geschätzt
            </button>
            {popoverOpen && (
              <div className="combine-estimate-popover" role="tooltip" {...estimatePopoverProps}>
                <strong>Geschätzte Eingaben:</strong>
                <ul>
                  {estimatedResults.map((r) => {
                    const instanceId = r.instanceId ?? r.productId
                    const evidenceMap = instanceEvidenceMaps?.[instanceId] ?? {}
                    const fieldKeys = PRODUCT_EVIDENCE_FIELDS[r.productId] ?? []
                    // A field counts as estimated when its evidence state maps to
                    // 'model' (explicit model_estimate) or 'default' (absent from map).
                    const estimatedFields = fieldKeys.filter((key) => {
                      const provKind = evidenceStateToProvKind(evidenceMap[key])
                      return provKind === 'model' || provKind === 'default'
                    })
                    if (estimatedFields.length > 0) {
                      return (
                        <li key={`${instanceId}-${r.scenarioId}`}>
                          <span className="combine-estimate-instance-label">{r.label}</span>
                          <ul className="combine-estimate-field-list">
                            {estimatedFields.map((field) => {
                              const provKind = evidenceStateToProvKind(evidenceMap[field])
                              const kindLabel = provKind === 'model' ? 'Schätzwert' : 'Unbekannt'
                              const germanLabel = EVIDENCE_FIELD_GERMAN_LABELS[field] ?? field
                              return (
                                <li key={field}>
                                  {germanLabel} — {kindLabel}
                                </li>
                              )
                            })}
                          </ul>
                        </li>
                      )
                    }
                    return (
                      <li key={`${instanceId}-${r.scenarioId}`}>
                        {r.label} — Eingaben geschätzt
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
