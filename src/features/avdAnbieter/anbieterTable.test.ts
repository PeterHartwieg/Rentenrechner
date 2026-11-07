import { describe, expect, it } from 'vitest'
import rawTable from '../publicPages/altersvorsorgedepot-anbieter.table.json'
import {
  EMPTY_FILTERS,
  SORT_KEYS,
  alphaKey,
  defaultOrder,
  filterRows,
  parseAnbieterTable,
  sortRows,
  type AnbieterRow,
} from './anbieterTable'

const table = parseAnbieterTable(rawTable)
const base = defaultOrder(table, ['status', 'anbieter'])

function clone(): Record<string, unknown> & { rows: Record<string, unknown>[] } {
  return JSON.parse(JSON.stringify(rawTable))
}

describe('anbieter table data (handoff 2026-11-07)', () => {
  it('is an object with 84 rows and the handoff metadata', () => {
    expect(Array.isArray(rawTable)).toBe(false)
    expect(table.rows).toHaveLength(84)
    expect(table.stand).toBe('2026-11-07')
    expect(table.typGruppen).toHaveLength(6)
    expect(table.statusOrder).toEqual(['live', 'waitlist', 'announced', 'rumoured'])
    expect([...table.sortableColumns].sort()).toEqual([...SORT_KEYS].sort())
  })

  it('keeps every link plain: affiliate false, /go/<slug> only, no logging', () => {
    expect(table.linkPolicy.affiliateAktiv).toBe(false)
    expect(table.linkPolicy.goClickLogging).toBe(false)
    for (const row of table.rows) {
      expect(row.affiliate).toBe(false)
      if (row.link_href !== null) expect(row.link_href).toBe(`/go/${row.slug}`)
    }
  })

  it('contains no partner-network hosts or tracking parameters in any row', () => {
    // linkPolicy.netzwerke names candidate networks as a decision record;
    // the rows (the only thing rendered or redirected to) must not.
    const text = JSON.stringify(table.rows).toLowerCase()
    for (const needle of ['financeads', 'awin', 'impact.com', 'financequality', 'partners.', '?ref=', 'utm_']) {
      expect(text).not.toContain(needle)
    }
  })

  it('rejects unknown or missing row keys and wrong field types', () => {
    const extra = clone()
    extra.rows[0].bewertung = 1
    expect(() => parseAnbieterTable(extra)).toThrow(/keys differ/)
    const missing = clone()
    delete missing.rows[0].stand
    expect(() => parseAnbieterTable(missing)).toThrow(/keys differ/)
    const stringNumber = clone()
    stringNumber.rows[0].kosten_pct_jahr = '0,1'
    expect(() => parseAnbieterTable(stringNumber)).toThrow(/kosten_pct_jahr/)
    expect(() => parseAnbieterTable(clone().rows)).toThrow(/object with \.rows/)
  })

  it('fails on any Werbelink while affiliates are off, and always for insurers', () => {
    const active = clone()
    const nonInsurer = active.rows.findIndex((r) => r.typ !== 'Versicherer')
    active.rows[nonInsurer].affiliate = true
    active.rows[nonInsurer].versicherungsprodukt = false
    expect(() => parseAnbieterTable(active)).toThrow(/affiliateAktiv/)

    const insurer = clone()
    ;(insurer.linkPolicy as Record<string, unknown>).affiliateAktiv = true
    const idx = insurer.rows.findIndex((r) => r.typ === 'Versicherer')
    insurer.rows[idx].affiliate = true
    insurer.rows[idx].versicherungsprodukt = false
    expect(() => parseAnbieterTable(insurer)).toThrow(/insurers/)
  })

  it('rejects link targets other than the own /go/ redirect', () => {
    const bad = clone()
    const idx = bad.rows.findIndex((r) => r.link_href !== null)
    bad.rows[idx].link_href = 'https://partner.example/?id=1'
    expect(() => parseAnbieterTable(bad)).toThrow(/link_href/)
  })
})

describe('default order', () => {
  it('groups by status, then A–Z with umlauts expanded — same as the handoff order', () => {
    expect(base.map((r) => r.slug)).toEqual(table.rows.map((r) => r.slug))
    const statusIndex = base.map((r) => table.statusOrder.indexOf(r.status))
    expect(statusIndex).toEqual([...statusIndex].sort((a, b) => a - b))
  })

  it('sorts Ö as Oe', () => {
    expect(alphaKey('Öffentliche Braunschweig')).toBe('oeffentliche braunschweig')
  })
})

describe('sortRows', () => {
  const numericKeys = ['kosten_pct_jahr', 'depotgebuehr_eur_jahr', 'mindestbeitrag_eur_jahr'] as const

  it.each(numericKeys)('%s puts nulls last in both directions', (key) => {
    for (const dir of ['asc', 'desc'] as const) {
      const sorted = sortRows(table, base, key, dir)
      const values = sorted.map((r) => r[key])
      const firstNull = values.indexOf(null)
      expect(firstNull).toBeGreaterThan(0)
      expect(values.slice(firstNull).every((v) => v === null)).toBe(true)
      const numbers = values.slice(0, firstNull) as number[]
      const expected = [...numbers].sort((a, b) => (dir === 'asc' ? a - b : b - a))
      expect(numbers).toEqual(expected)
    }
  })

  it('breaks ties by the default order', () => {
    const sorted = sortRows(table, base, 'depotgebuehr_eur_jahr', 'asc')
    const zeroFee = sorted.filter((r) => r.depotgebuehr_eur_jahr === 0).map((r) => r.slug)
    expect(zeroFee).toEqual(base.filter((r) => r.depotgebuehr_eur_jahr === 0).map((r) => r.slug))
  })

  it('does not depend on affiliate flags or link fields', () => {
    const flipped = {
      ...table,
      rows: table.rows.map((r): AnbieterRow => ({ ...r, affiliate: !r.affiliate, link_href: null, url: null })),
    }
    const flippedBase = defaultOrder(flipped, ['status', 'anbieter'])
    expect(flippedBase.map((r) => r.slug)).toEqual(base.map((r) => r.slug))
    for (const key of SORT_KEYS) {
      for (const dir of ['asc', 'desc'] as const) {
        expect(sortRows(flipped, flippedBase, key, dir).map((r) => r.slug))
          .toEqual(sortRows(table, base, key, dir).map((r) => r.slug))
      }
    }
  })
})

describe('filterRows', () => {
  it('shows all rows without a selection', () => {
    expect(filterRows(base, EMPTY_FILTERS)).toHaveLength(84)
  })

  it('combines Typ and Status filters and keeps the current order', () => {
    const filtered = filterRows(base, {
      typ_gruppe: new Set(['Online-Broker']),
      status: new Set(['waitlist']),
    })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((r) => r.typ_gruppe === 'Online-Broker' && r.status === 'waitlist')).toBe(true)
    const order = base.map((r) => r.slug)
    const idx = filtered.map((r) => order.indexOf(r.slug))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })
})
