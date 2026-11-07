// ---------------------------------------------------------------------------
// anbieterTable.ts — data contract, default order, sorting and filtering for
// the AV-Depot provider table (`/altersvorsorgedepot-anbieter`).
//
// The handoff ships `altersvorsorgedepot-anbieter.table.json` as an OBJECT
// (`stand`, `hinweis`, `statusLabels`, `statusOrder`, `columns`,
// `columns_neu`, `filters`, `typGruppen`, `sortableColumns`, `defaultSort`,
// `linkPolicy`, `rows`, ...), not a bare array. `parseAnbieterTable` is the
// only way into the renderer: it rejects unknown or missing row keys and
// wrong types, and it refuses any active Werbelink while the link policy
// keeps affiliates off.
//
// Neutrality rules (spec §4): the comparators and filters never read
// `affiliate`, `link_typ`, `link_href` or `url`. Ties always fall back to the
// published default order, so no hidden criterion can move a row.
// ---------------------------------------------------------------------------

export type AnbieterStatus = 'live' | 'waitlist' | 'announced' | 'rumoured'

export interface AnbieterRow {
  readonly slug: string
  readonly anbieter: string
  readonly typ: string
  readonly status: AnbieterStatus
  readonly produktarten: readonly string[]
  readonly kosten_laut_anbieter: string
  readonly mindestbeitrag: string | null
  readonly stand: string
  readonly source_url: string
  readonly typ_gruppe: string
  readonly anlageauswahl: string | null
  readonly depotgebuehr_eur_jahr: number | null
  /** Percent units as stated by the provider (0.15 = 0,15 % p. a.). */
  readonly kosten_pct_jahr: number | null
  readonly kosten_pct_art: string | null
  readonly kosten_pct_hinweis: string | null
  readonly mindestbeitrag_eur_jahr: number | null
  readonly mindestbeitrag_eur_monat: number | null
  readonly url: string | null
  readonly link_href: string | null
  readonly affiliate: boolean
  readonly link_typ: string
  readonly link_label: string | null
  readonly versicherungsprodukt: boolean | null
  readonly affiliate_sperre: string
}

export interface AnbieterLinkPolicy {
  readonly affiliateAktiv: boolean
  readonly relDirekt: string
  readonly relWerbelink: string
  readonly werbelinkLabel: string
  readonly goRedirect: boolean
  readonly goClickLogging: boolean
}

export interface AnbieterTable {
  readonly stand: string
  readonly hinweis: string
  readonly statusLabels: Readonly<Record<AnbieterStatus, string>>
  readonly statusOrder: readonly AnbieterStatus[]
  readonly typGruppen: readonly string[]
  readonly sortableColumns: readonly SortKey[]
  readonly kostenSortHinweis: string
  readonly linkPolicy: AnbieterLinkPolicy
  readonly rows: readonly AnbieterRow[]
}

export const SORT_KEYS = [
  'anbieter',
  'typ_gruppe',
  'status',
  'kosten_pct_jahr',
  'depotgebuehr_eur_jahr',
  'mindestbeitrag_eur_jahr',
  'stand',
] as const
export type SortKey = typeof SORT_KEYS[number]
export type SortDirection = 'asc' | 'desc'

export const FILTER_KEYS = ['typ_gruppe', 'status'] as const
export type FilterKey = typeof FILTER_KEYS[number]

const STATUSES: readonly AnbieterStatus[] = ['live', 'waitlist', 'announced', 'rumoured']

type FieldKind = 'string' | 'string?' | 'number?' | 'boolean' | 'boolean?' | 'string[]' | 'status'

const ROW_SCHEMA: Readonly<Record<keyof AnbieterRow, FieldKind>> = {
  slug: 'string',
  anbieter: 'string',
  typ: 'string',
  status: 'status',
  produktarten: 'string[]',
  kosten_laut_anbieter: 'string',
  mindestbeitrag: 'string?',
  stand: 'string',
  source_url: 'string',
  typ_gruppe: 'string',
  anlageauswahl: 'string?',
  depotgebuehr_eur_jahr: 'number?',
  kosten_pct_jahr: 'number?',
  kosten_pct_art: 'string?',
  kosten_pct_hinweis: 'string?',
  mindestbeitrag_eur_jahr: 'number?',
  mindestbeitrag_eur_monat: 'number?',
  url: 'string?',
  link_href: 'string?',
  affiliate: 'boolean',
  link_typ: 'string',
  link_label: 'string?',
  versicherungsprodukt: 'boolean?',
  affiliate_sperre: 'string',
}

function fieldMatches(kind: FieldKind, value: unknown): boolean {
  switch (kind) {
    case 'string': return typeof value === 'string' && value.trim() !== ''
    case 'string?': return value === null || (typeof value === 'string' && value.trim() !== '')
    case 'number?': return value === null || (typeof value === 'number' && Number.isFinite(value))
    case 'boolean': return typeof value === 'boolean'
    case 'boolean?': return value === null || typeof value === 'boolean'
    case 'string[]': return Array.isArray(value) && value.every((v) => typeof v === 'string')
    case 'status': return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validate the handoff table object and return it typed. Throws with the
 * offending row index/key so a bad data refresh fails the build (prerender
 * imports the page) instead of rendering a wrong cell.
 */
export function parseAnbieterTable(data: unknown, filename = 'anbieter-table.json'): AnbieterTable {
  if (!isRecord(data)) throw new Error(`${filename}: expected an object with .rows`)
  const { rows, statusLabels, statusOrder, typGruppen, sortableColumns, linkPolicy } = data
  if (!Array.isArray(rows)) throw new Error(`${filename}: expected .rows to be an array`)
  if (typeof data.stand !== 'string' || !ISO_DATE.test(data.stand)) throw new Error(`${filename}: bad .stand`)
  if (typeof data.hinweis !== 'string') throw new Error(`${filename}: bad .hinweis`)
  if (typeof data.kostenSortHinweis !== 'string') throw new Error(`${filename}: bad .kostenSortHinweis`)
  if (!isRecord(statusLabels) || !STATUSES.every((s) => typeof statusLabels[s] === 'string')) {
    throw new Error(`${filename}: .statusLabels must label every status`)
  }
  if (!Array.isArray(statusOrder) || statusOrder.length !== STATUSES.length
    || !STATUSES.every((s) => statusOrder.includes(s))) {
    throw new Error(`${filename}: .statusOrder must list every status once`)
  }
  if (!Array.isArray(typGruppen) || !typGruppen.every((g) => typeof g === 'string')) {
    throw new Error(`${filename}: bad .typGruppen`)
  }
  if (!Array.isArray(sortableColumns)
    || !sortableColumns.every((c) => (SORT_KEYS as readonly unknown[]).includes(c))) {
    throw new Error(`${filename}: .sortableColumns contains an unsupported column`)
  }
  if (!isRecord(linkPolicy)
    || typeof linkPolicy.affiliateAktiv !== 'boolean'
    || typeof linkPolicy.relDirekt !== 'string'
    || typeof linkPolicy.relWerbelink !== 'string'
    || typeof linkPolicy.werbelinkLabel !== 'string'
    || typeof linkPolicy.goRedirect !== 'boolean'
    || typeof linkPolicy.goClickLogging !== 'boolean') {
    throw new Error(`${filename}: bad .linkPolicy`)
  }

  const expectedKeys = Object.keys(ROW_SCHEMA).sort()
  const seenSlugs = new Set<string>()
  rows.forEach((row: unknown, index) => {
    const where = `${filename} rows[${index}]`
    if (!isRecord(row)) throw new Error(`${where}: expected an object`)
    const keys = Object.keys(row).sort()
    if (keys.join() !== expectedKeys.join()) {
      throw new Error(`${where}: keys differ from the row schema`)
    }
    for (const [key, kind] of Object.entries(ROW_SCHEMA)) {
      if (!fieldMatches(kind, row[key])) throw new Error(`${where}.${key}: expected ${kind}`)
    }
    const r = row as unknown as AnbieterRow
    if (!SLUG.test(r.slug) || seenSlugs.has(r.slug)) throw new Error(`${where}.slug: invalid or duplicate`)
    seenSlugs.add(r.slug)
    if (!ISO_DATE.test(r.stand)) throw new Error(`${where}.stand: expected YYYY-MM-DD`)
    if (!typGruppen.includes(r.typ_gruppe)) throw new Error(`${where}.typ_gruppe: not in .typGruppen`)
    if (!r.source_url.startsWith('https://')) throw new Error(`${where}.source_url: expected https`)
    if (r.url !== null && !r.url.startsWith('https://')) throw new Error(`${where}.url: expected https`)
    // Links only ever point at our own redirect, keyed by slug — never at a
    // partner target. A row without a provider URL renders no link.
    if ((r.url === null) !== (r.link_href === null)) throw new Error(`${where}: url and link_href must both be set or null`)
    if (r.link_href !== null && r.link_href !== goHref(r.slug)) {
      throw new Error(`${where}.link_href: must be ${goHref(r.slug)}`)
    }
    if (r.affiliate) {
      if (r.typ === 'Versicherer' || r.versicherungsprodukt !== false) {
        throw new Error(`${where}: insurers and unchecked rows never get a Werbelink`)
      }
      if (!linkPolicy.affiliateAktiv) {
        throw new Error(`${where}: affiliate is true but linkPolicy.affiliateAktiv is false`)
      }
    }
  })

  return data as unknown as AnbieterTable
}

/** Outbound path for a provider row. Only the slug is stored in the repo. */
export function goHref(slug: string): string {
  return `/go/${slug}`
}

/** `rel` for a provider link, from the table's own link policy. */
export function providerLinkRel(row: AnbieterRow, policy: AnbieterLinkPolicy): string {
  return row.affiliate ? policy.relWerbelink : policy.relDirekt
}

/**
 * Alphabetical key with umlauts expanded (Ö = Oe, ß = ss), case-insensitive,
 * matching the handoff's default order (OPEN-QUESTIONS 23).
 */
export function alphaKey(name: string): string {
  return name
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .toLowerCase()
}

type Comparable = string | number | null

function sortValue(table: AnbieterTable, row: AnbieterRow, key: SortKey): Comparable {
  switch (key) {
    case 'anbieter': return alphaKey(row.anbieter)
    case 'typ_gruppe': return table.typGruppen.indexOf(row.typ_gruppe)
    case 'status': return table.statusOrder.indexOf(row.status)
    case 'kosten_pct_jahr': return row.kosten_pct_jahr
    case 'depotgebuehr_eur_jahr': return row.depotgebuehr_eur_jahr
    case 'mindestbeitrag_eur_jahr': return row.mindestbeitrag_eur_jahr
    case 'stand': return row.stand
  }
}

function compareValues(a: Comparable, b: Comparable): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/** Parse a comma list prop (`"status,anbieter"`) into known sort keys. */
export function parseSortKeys(list: string): SortKey[] {
  return list.split(',').map((k) => k.trim()).filter(Boolean).map((k) => {
    if (!(SORT_KEYS as readonly string[]).includes(k)) throw new Error(`Unknown sort key "${k}"`)
    return k as SortKey
  })
}

/** Parse a comma list prop (`"typ_gruppe,status"`) into known filter keys. */
export function parseFilterKeys(list: string): FilterKey[] {
  return list.split(',').map((k) => k.trim()).filter(Boolean).map((k) => {
    if (!(FILTER_KEYS as readonly string[]).includes(k)) throw new Error(`Unknown filter key "${k}"`)
    return k as FilterKey
  })
}

/**
 * The fixed, published default order: ascending by each key in turn
 * (`status,anbieter` = status group, then A–Z), source order as last resort.
 */
export function defaultOrder(table: AnbieterTable, keys: readonly SortKey[]): AnbieterRow[] {
  const indexed = table.rows.map((row, index) => ({ row, index }))
  indexed.sort((a, b) => {
    for (const key of keys) {
      const diff = compareValues(sortValue(table, a.row, key), sortValue(table, b.row, key))
      if (diff !== 0) return diff
    }
    return a.index - b.index
  })
  return indexed.map(({ row }) => row)
}

/**
 * Sort by one column. Null values sort last in both directions when
 * `nullsLast` is set; ties keep the default order (stable).
 */
export function sortRows(
  table: AnbieterTable,
  base: readonly AnbieterRow[],
  key: SortKey,
  direction: SortDirection,
  nullsLast = true,
): AnbieterRow[] {
  const position = new Map(base.map((row, index) => [row.slug, index]))
  const sign = direction === 'asc' ? 1 : -1
  return [...base].sort((a, b) => {
    const va = sortValue(table, a, key)
    const vb = sortValue(table, b, key)
    if (va === null || vb === null) {
      if (va === null && vb !== null) return nullsLast ? 1 : -1
      if (vb === null && va !== null) return nullsLast ? -1 : 1
    } else {
      const diff = compareValues(va, vb)
      if (diff !== 0) return sign * diff
    }
    return (position.get(a.slug) ?? 0) - (position.get(b.slug) ?? 0)
  })
}

export interface FilterState {
  readonly typ_gruppe: ReadonlySet<string>
  readonly status: ReadonlySet<string>
}

export const EMPTY_FILTERS: FilterState = { typ_gruppe: new Set(), status: new Set() }

/** Empty selection means "Alle". Filters only read `typ_gruppe` and `status`. */
export function filterRows(rows: readonly AnbieterRow[], filters: FilterState): AnbieterRow[] {
  return rows.filter((row) =>
    (filters.typ_gruppe.size === 0 || filters.typ_gruppe.has(row.typ_gruppe))
    && (filters.status.size === 0 || filters.status.has(row.status)))
}

export function isFiltered(filters: FilterState): boolean {
  return filters.typ_gruppe.size > 0 || filters.status.size > 0
}
