import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import './AnbieterTabelle.css'
import { activeRules } from '../../rules'
import { formatCurrency, formatPercent } from '../../utils/format'
import {
  EMPTY_FILTERS,
  defaultOrder,
  filterRows,
  isFiltered,
  parseAnbieterTable,
  parseFilterKeys,
  parseSortKeys,
  providerLinkRel,
  sortRows,
  type AnbieterRow,
  type AnbieterStatus,
  type AnbieterTable,
  type FilterKey,
  type FilterState,
  type SortDirection,
  type SortKey,
} from './anbieterTable'

interface Props {
  /** The handoff table object (`altersvorsorgedepot-anbieter.table.json`). */
  readonly table: unknown
  /** Comma list of keys for the fixed default order, e.g. `status,anbieter`. */
  readonly defaultSort: string
  /** Comma list of user-sortable columns. */
  readonly sortable: string
  /** Comma list of filter columns (`typ_gruppe,status`). */
  readonly filters: string
  /** Null values sort last in both directions (spec §4). */
  readonly nullsLast?: boolean
  /** `cards` = card list below 768 px instead of the scrolling table. */
  readonly mobile?: 'cards'
}

const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  anbieter: 'Anbieter',
  typ_gruppe: 'Typ',
  status: 'Status',
  kosten_pct_jahr: 'Laufende Kosten',
  depotgebuehr_eur_jahr: 'Depotgebühr',
  mindestbeitrag_eur_jahr: 'Mindestbeitrag',
  stand: 'Stand',
}

/** First click direction per column: dates newest first, everything else ascending. */
const FIRST_DIRECTION: Readonly<Partial<Record<SortKey, SortDirection>>> = { stand: 'desc' }

const FILTER_LEGENDS: Readonly<Record<FilterKey, string>> = { typ_gruppe: 'Typ', status: 'Status' }

const LEGAL_MINIMUM = formatCurrency(activeRules.altersvorsorgedepot.minimumOwnContributionAnnual)

// Progressive enhancement: the server render (and a no-JS reader) gets the
// full table in the default order without controls; the client switches the
// controls on after hydration. `useSyncExternalStore` keeps the first client
// render identical to the prerendered HTML.
const subscribeNoop = () => () => {}
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false)
}

function KeineAngabe() {
  return <abbr title="keine Angabe">k. A.</abbr>
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function CostCell({ row }: { row: AnbieterRow }) {
  if (row.kosten_pct_jahr === null) return <KeineAngabe />
  return (
    <>
      <span className="anbieter-num">{formatPercent(row.kosten_pct_jahr / 100, 2)}</span>
      {row.kosten_pct_art !== null && <span className="anbieter-cost-art">{row.kosten_pct_art}</span>}
      {row.kosten_pct_hinweis !== null && <span className="anbieter-small">{row.kosten_pct_hinweis}</span>}
    </>
  )
}

function DepotfeeCell({ row }: { row: AnbieterRow }) {
  if (row.depotgebuehr_eur_jahr === null) return <KeineAngabe />
  return <span className="anbieter-num">{formatCurrency(row.depotgebuehr_eur_jahr)} im Jahr</span>
}

function MindestbeitragCell({ row }: { row: AnbieterRow }) {
  let value: ReactNode
  if (row.mindestbeitrag_eur_monat !== null) {
    value = (
      <span className="anbieter-num">
        {formatCurrency(row.mindestbeitrag_eur_monat)} im Monat
        {row.mindestbeitrag_eur_jahr !== null && <> (× 12 = {formatCurrency(row.mindestbeitrag_eur_jahr)} im Jahr)</>}
      </span>
    )
  } else if (row.mindestbeitrag_eur_jahr !== null) {
    value = <span className="anbieter-num">{formatCurrency(row.mindestbeitrag_eur_jahr)} im Jahr</span>
  } else {
    value = <KeineAngabe />
  }
  return (
    <>
      {value}
      <span className="anbieter-small">Für Zulagen gesetzlich: {LEGAL_MINIMUM} im Jahr</span>
    </>
  )
}

function ListOrNa({ items }: { items: readonly string[] }) {
  return items.length > 0 ? <>{items.join(', ')}</> : <KeineAngabe />
}

function TextOrNa({ text }: { text: string | null }) {
  return text !== null ? <>{text}</> : <KeineAngabe />
}

function ProviderLink({ row, table }: { row: AnbieterRow; table: AnbieterTable }) {
  if (row.link_href === null) return <KeineAngabe />
  return (
    <>
      <a
        href={row.link_href}
        rel={providerLinkRel(row, table.linkPolicy)}
        aria-label={`${row.link_label ?? 'Zur Anbieterseite'} von ${row.anbieter} (externe Seite)`}
      >
        {row.link_label ?? 'Zur Anbieterseite'}
      </a>
      {row.affiliate && <span className="anbieter-werbelink"> {table.linkPolicy.werbelinkLabel}</span>}
    </>
  )
}

function SourceLink({ row }: { row: AnbieterRow }) {
  return (
    <a href={row.source_url} rel="nofollow noopener" aria-label={`Quelle zu ${row.anbieter} (externe Seite)`}>
      Quelle
    </a>
  )
}

interface Column {
  readonly id: string
  readonly header: string
  readonly sortKey?: SortKey
  readonly note?: string
  readonly render: (row: AnbieterRow) => ReactNode
}

/**
 * Sortable AV-Depot provider table (spec `vergleichstabelle-spec.md`).
 * Renders a real `<table>` from 768 px and an identical card list below,
 * both in the same order. No request, no storage, no tracking.
 */
export function AnbieterTabelle({
  table: rawTable,
  defaultSort,
  sortable,
  filters: filterList,
  nullsLast = true,
  mobile,
}: Props) {
  const table = useMemo(() => parseAnbieterTable(rawTable), [rawTable])
  const defaultKeys = useMemo(() => parseSortKeys(defaultSort), [defaultSort])
  const sortableKeys = useMemo(
    () => parseSortKeys(sortable).filter((k) => table.sortableColumns.includes(k)),
    [sortable, table],
  )
  const filterKeys = useMemo(() => parseFilterKeys(filterList), [filterList])
  const baseRows = useMemo(() => defaultOrder(table, defaultKeys), [table, defaultKeys])

  const enhanced = useIsClient()
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  const rows = useMemo(() => {
    const sorted = sort ? sortRows(table, baseRows, sort.key, sort.direction, nullsLast) : baseRows
    return filterRows(sorted, filters)
  }, [table, baseRows, sort, filters, nullsLast])

  const statusLabel = (status: AnbieterStatus) => table.statusLabels[status]
  const hasWerbelink = table.rows.some((r) => r.affiliate)
  const total = table.rows.length

  const columns: readonly Column[] = [
    { id: 'anbieter', header: 'Anbieter', sortKey: 'anbieter', render: (r) => r.anbieter },
    { id: 'typ', header: 'Typ', sortKey: 'typ_gruppe', render: (r) => r.typ },
    { id: 'status', header: 'Status / Anmeldung', sortKey: 'status', render: (r) => statusLabel(r.status) },
    { id: 'produktarten', header: 'Produktarten', render: (r) => <ListOrNa items={r.produktarten} /> },
    { id: 'anlageauswahl', header: 'Anlageauswahl', render: (r) => <TextOrNa text={r.anlageauswahl} /> },
    { id: 'kosten', header: 'Kosten laut Anbieter', render: (r) => r.kosten_laut_anbieter },
    {
      id: 'kosten_pct',
      header: 'Laufende Kosten p. a.',
      sortKey: 'kosten_pct_jahr',
      note: table.kostenSortHinweis,
      render: (r) => <CostCell row={r} />,
    },
    { id: 'depot', header: 'Depotgebühr', sortKey: 'depotgebuehr_eur_jahr', render: (r) => <DepotfeeCell row={r} /> },
    { id: 'mindest', header: 'Mindestbeitrag', sortKey: 'mindestbeitrag_eur_jahr', render: (r) => <MindestbeitragCell row={r} /> },
    { id: 'stand', header: 'Stand', sortKey: 'stand', render: (r) => formatDate(r.stand) },
    { id: 'quelle', header: 'Quelle', render: (r) => <SourceLink row={r} /> },
    { id: 'link', header: 'Link', render: (r) => <ProviderLink row={r} table={table} /> },
  ]

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      return { key, direction: FIRST_DIRECTION[key] ?? 'asc' }
    })
  }

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((current) => {
      const next = new Set(current[key])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...current, [key]: next }
    })
  }

  const filterOptions: Readonly<Record<FilterKey, readonly { value: string; label: string }[]>> = {
    typ_gruppe: table.typGruppen.map((g) => ({ value: g, label: g })),
    status: table.statusOrder.map((s) => ({ value: s, label: statusLabel(s) })),
  }
  const countFor = (key: FilterKey, value: string) =>
    table.rows.filter((r) => (key === 'status' ? r.status : r.typ_gruppe) === value).length

  const sortText = sort
    ? `Sortiert nach ${SORT_LABELS[sort.key]}, ${sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'}.${nullsLast ? ' Einträge ohne Angabe stehen am Ende.' : ''}`
    : 'Standardreihenfolge: nach Status gruppiert, innerhalb jeder Gruppe alphabetisch.'
  const countText = `${rows.length} von ${total} Anbietern`
  const caption = `Anbieter von Altersvorsorgedepots, Stand ${formatDate(table.stand)}`

  return (
    <section className="anbieter-tabelle" aria-label="Anbietertabelle">
      {enhanced && (
        <div className="anbieter-controls">
          <div className="anbieter-sort">
            <label>
              Sortieren nach{' '}
              <select
                value={sort?.key ?? ''}
                onChange={(event) => {
                  const key = event.target.value as SortKey | ''
                  setSort(key === '' ? null : { key, direction: FIRST_DIRECTION[key] ?? 'asc' })
                }}
              >
                <option value="">Standardreihenfolge</option>
                {sortableKeys.map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
              </select>
            </label>
            {sort && (
              <button
                type="button"
                aria-pressed={sort.direction === 'desc'}
                onClick={() => setSort({ key: sort.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
              >
                {sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'}
              </button>
            )}
            {sort && <button type="button" onClick={() => setSort(null)}>Standardreihenfolge</button>}
          </div>
          {filterKeys.map((key) => (
            <fieldset key={key} className="anbieter-filter">
              <legend>{FILTER_LEGENDS[key]}</legend>
              {filterOptions[key].map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={filters[key].has(option.value)}
                    onChange={() => toggleFilter(key, option.value)}
                  />{' '}
                  {option.label} ({countFor(key, option.value)})
                </label>
              ))}
            </fieldset>
          ))}
          {isFiltered(filters) && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Alle anzeigen</button>
          )}
          <p className="anbieter-status-line" aria-live="polite">{sortText} {countText}.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="anbieter-empty">
          Keine Einträge für diese Auswahl.{' '}
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Alle anzeigen</button>
        </p>
      ) : (
        <>
          <div
            className={mobile === 'cards' ? 'anbieter-table-wrap anbieter-table-wrap--cards' : 'anbieter-table-wrap'}
            role="region"
            aria-label="Anbietertabelle, horizontal scrollbar"
            tabIndex={0}
          >
            <table className="anbieter-table">
              <caption>{caption}</caption>
              <thead>
                <tr>
                  {columns.map((col) => {
                    const sortableHere = enhanced && col.sortKey !== undefined && sortableKeys.includes(col.sortKey)
                    const active = sort?.key === col.sortKey
                    const ariaSort = !sortableHere ? undefined
                      : active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    return (
                      <th key={col.id} scope="col" aria-sort={ariaSort}>
                        {sortableHere && col.sortKey ? (
                          <button type="button" className="anbieter-sort-btn" onClick={() => toggleSort(col.sortKey as SortKey)}>
                            {col.header}
                            <span aria-hidden="true">{active ? (sort?.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                          </button>
                        ) : col.header}
                        {col.note && <span className="anbieter-small">{col.note}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.slug} id={row.slug}>
                    {columns.map((col) =>
                      col.id === 'anbieter'
                        ? <th key={col.id} scope="row">{col.render(row)}</th>
                        : <td key={col.id}>{col.render(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mobile === 'cards' && (
            <div className="anbieter-cards" aria-label={caption}>
              {rows.map((row) => (
                <article key={row.slug} className="anbieter-card">
                  <h3>{row.anbieter}</h3>
                  <dl>
                    {columns.filter((c) => c.id !== 'anbieter' && c.id !== 'link').map((col) => (
                      <div key={col.id} className="anbieter-card-row">
                        <dt>{col.header}</dt>
                        <dd>{col.render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="anbieter-card-link"><ProviderLink row={row} table={table} /></p>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {hasWerbelink && (
        <p className="anbieter-legend">
          * Werbelink: Eröffnest du über diesen Link ein Depot, erhält rentenwiki.de möglicherweise
          eine Provision. Für dich ändert sich der Preis nicht. Auf die Reihenfolge und Darstellung
          in der Tabelle hat das keinen Einfluss.
        </p>
      )}
      <p className="anbieter-small anbieter-hinweis">{table.hinweis}</p>
    </section>
  )
}
