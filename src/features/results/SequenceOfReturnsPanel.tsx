import { useMemo } from 'react'
import { TrendingDown } from 'lucide-react'
import type { ProductResult } from '../../domain'
import type { ReturnScenario } from '../../domain/profile'
import { getProductMeta } from '../../engine/productRegistry'
import { buildSequenceOfReturnsPaths } from '../../engine/marketReturns'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  selectedResults: ProductResult[]
  accumulationYears: number
  selectedScenario: ReturnScenario
  productColors: Record<string, string>
}

function projectCapital(monthlyContribution: number, returns: readonly number[]): number {
  let capital = 0
  for (const r of returns) {
    capital = (capital + monthlyContribution * 12) * (1 + r)
  }
  return capital
}

const PATH_LABELS: Record<string, string> = {
  'good-early': 'Günstige Reihenfolge',
  'bad-early': 'Ungünstige Reihenfolge',
  'shuffled-baseline': 'Gleichmäßige Rendite',
}

const PATH_DESCRIPTIONS: Record<string, string> = {
  'good-early': 'Hohe Renditen in den frühen Jahren, niedrige gegen Ende.',
  'bad-early': 'Niedrige Renditen in den frühen Jahren, hohe gegen Ende.',
  'shuffled-baseline': 'Jedes Jahr dieselbe Durchschnittsrendite.',
}

export function SequenceOfReturnsPanel({
  selectedResults,
  accumulationYears,
  selectedScenario,
  productColors,
}: Props) {
  const paths = useMemo(
    () =>
      buildSequenceOfReturnsPaths({
        annualReturn: selectedScenario.annualReturn,
        years: accumulationYears,
      }),
    [selectedScenario.annualReturn, accumulationYears],
  )

  const rows = useMemo(
    () =>
      selectedResults.map((result) => {
        const meta = getProductMeta(result.productId)
        const projections = paths.map((path) => ({
          pathId: path.id,
          capital: projectCapital(result.monthlyProductContribution, path.returns),
        }))
        const baseline = projections.find((p) => p.pathId === 'shuffled-baseline')?.capital ?? 0
        return { result, meta, projections, baseline }
      }),
    [selectedResults, paths],
  )

  if (selectedResults.length === 0) {
    return (
      <div className="assumption-panel">
        <h2>Sequence-of-Returns-Risiko</h2>
        <p>Keine Produkte ausgewählt.</p>
      </div>
    )
  }

  return (
    <div className="assumption-panel">
      <h2>
        <TrendingDown size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Sequence-of-Returns-Risiko
      </h2>
      <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
        Drei Renditesequenzen mit identischem arithmetischen Mittel ({formatPercent(selectedScenario.annualReturn, 1)}
        p.a.) zeigen, wie die Reihenfolge der Jahresrenditen das Endkapital beeinflusst.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid var(--color-border, #e5e7eb)' }}>
              Produkt
            </th>
            {paths.map((path) => (
              <th
                key={path.id}
                style={{
                  textAlign: 'right',
                  padding: '0.5rem',
                  borderBottom: '2px solid var(--color-border, #e5e7eb)',
                  whiteSpace: 'nowrap',
                }}
                title={PATH_DESCRIPTIONS[path.id]}
              >
                {PATH_LABELS[path.id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ result, meta, projections, baseline }) => (
            <tr key={`${result.productId}-${result.instanceId ?? ''}`}>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: productColors[result.productId] ?? '#888',
                    marginRight: 6,
                  }}
                />
                {meta?.label ?? result.productId}
              </td>
              {projections.map((p) => {
                const diff = p.capital - baseline
                const isBaseline = p.pathId === 'shuffled-baseline'
                return (
                  <td
                    key={p.pathId}
                    style={{
                      textAlign: 'right',
                      padding: '0.5rem',
                      borderBottom: '1px solid var(--color-border, #e5e7eb)',
                    }}
                  >
                    {formatCurrency(p.capital, 0)}
                    {!isBaseline && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          color: diff >= 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)',
                        }}
                      >
                        {diff >= 0 ? '+' : ''}
                        {formatCurrency(diff, 0)}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: '1rem', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.75rem' }}>
        Vereinfachte Projektion (gleiche monatliche Beiträge, ohne Gebühren und Steuern) zur Illustration des
        Reihenfolgeeffekts. Differenz zur gleichmäßigen Rendite in Klammern.
      </p>
    </div>
  )
}
