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
import { formatCurrency } from '../../utils/format'

interface CombineIncomePanelProps {
  combinedResult: CombinedResult
  perInstanceResults: Record<string, ProductResult[]>
  scenarioId: string
  scenarioLabel: string
}

export function CombineIncomePanel({
  combinedResult,
  perInstanceResults,
  scenarioId,
  scenarioLabel,
}: CombineIncomePanelProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

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

  // Instances with model_estimate confidence.
  const estimatedResults = allResults.filter((r) => r.inputConfidence === 'model_estimate')
  const hasEstimates = estimatedResults.length > 0

  return (
    <div className="combine-income-panel">
      <p className="combine-income-label">Monatliches Nettoeinkommen im Ruhestand</p>
      <div className="combine-income-row">
        <span className="combine-income-value">
          {formatCurrency(combinedResult.monthlyNetIncome, 0)}/Monat
        </span>
        <span className="combine-income-scenario">{scenarioLabel}</span>
        {hasEstimates && (
          <span style={{ position: 'relative' }} ref={wrapRef}>
            <button
              type="button"
              className="combine-estimate-summary-badge"
              onClick={() => setPopoverOpen((v) => !v)}
              aria-expanded={popoverOpen}
              aria-haspopup="true"
            >
              {'🤔'} Teilweise geschätzt
            </button>
            {popoverOpen && (
              <div className="combine-estimate-popover" role="tooltip">
                <strong>Geschätzte Eingaben:</strong>
                <ul>
                  {estimatedResults.map((r) => (
                    <li key={`${r.instanceId ?? r.productId}-${r.scenarioId}`}>
                      {r.label} — Eingaben geschätzt
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
