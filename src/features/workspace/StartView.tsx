import { BarChart3, FileSpreadsheet, HelpCircle, Pencil } from 'lucide-react'
import type { ProductResult } from '../../domain'
import type { WorkspaceView } from '../../app/useWorkspace'
import { formatCurrency } from '../../utils/format'

type StartViewProps = {
  bestCapital?: ProductResult
  bestPension?: ProductResult
  onNavigate: (view: WorkspaceView) => void
  onReopenGuidedSetup: () => void
}

type Tile = {
  id: WorkspaceView
  title: string
  description: string
  icon: typeof BarChart3
}

const TILES: readonly Tile[] = [
  {
    id: 'vergleich',
    title: 'Vergleichen',
    description: 'Welche Vorsorgeart liefert in deinem Szenario das beste Ergebnis?',
    icon: BarChart3,
  },
  {
    id: 'angebot',
    title: 'Angebot eingeben',
    description: 'Trage Werte aus deinem bAV- oder pAV-Angebot ein.',
    icon: Pencil,
  },
  {
    id: 'warum',
    title: 'Warum?',
    description: 'Wo geht das Geld hin? Welche Annahmen tragen das Ergebnis?',
    icon: HelpCircle,
  },
  {
    id: 'details',
    title: 'Details & Export',
    description: 'Tabellen, Cashflows, CSV/PDF-Export.',
    icon: FileSpreadsheet,
  },
]

export function StartView({
  bestCapital,
  bestPension,
  onNavigate,
  onReopenGuidedSetup,
}: StartViewProps) {
  return (
    <section className="start-view" aria-label="Start">
      <header className="start-hero">
        <h2>Willkommen — was möchtest du tun?</h2>
        <p>
          Dieser Rechner vergleicht ETF, betriebliche Altersvorsorge, private
          Rentenversicherung, Basisrente, Altersvorsorgedepot und Riester unter
          den gleichen steuerlichen und sozialversicherungsrechtlichen Annahmen.
        </p>
      </header>

      {(bestCapital || bestPension) && (
        <div className="start-snapshot" aria-label="Aktuelles Ergebnis">
          <span className="start-snapshot-label">Aktueller Stand</span>
          <div className="start-snapshot-grid">
            <div>
              <span className="start-snapshot-key">Bestes Kapital</span>
              <span className="start-snapshot-value">
                {bestCapital
                  ? `${bestCapital.label} · ${formatCurrency(bestCapital.afterTaxLumpSum ?? 0, 0)}`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="start-snapshot-key">Beste Monatsrente</span>
              <span className="start-snapshot-value">
                {bestPension
                  ? `${bestPension.label} · ${formatCurrency(bestPension.netMonthlyPayout, 0)} / Mon.`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="start-tiles">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <button
              key={tile.id}
              type="button"
              className="start-tile"
              onClick={() => onNavigate(tile.id)}
            >
              <span className="start-tile-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="start-tile-title">{tile.title}</span>
              <span className="start-tile-desc">{tile.description}</span>
            </button>
          )
        })}
      </div>

      <div className="start-secondary">
        <button type="button" className="start-link-btn" onClick={onReopenGuidedSetup}>
          Geführten Einstieg erneut starten
        </button>
      </div>
    </section>
  )
}
