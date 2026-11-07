import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import rawTable from '../features/publicPages/altersvorsorgedepot-anbieter.table.json'
import { parseAnbieterTable } from '../features/avdAnbieter/anbieterTable'
import { generateRobots, GO_REDIRECT_PREFIX } from './robots'

const table = parseAnbieterTable(rawTable)

function goBlock(): string[] {
  const text = readFileSync('public/_redirects', 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('# BEGIN go-redirects\n')
  const end = text.indexOf('# END go-redirects')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return text.slice(start, end).split('\n').slice(1).filter(Boolean)
}

describe('/go/<slug> provider redirects (public/_redirects)', () => {
  it('has exactly one 302 per table row with a public URL, to that URL', () => {
    const expected = table.rows
      .filter((row) => row.url !== null)
      .map((row) => `/go/${row.slug} ${row.url} 302`)
    expect(goBlock()).toEqual(expected)
    expect(expected).toHaveLength(83)
  })

  it('has no rule for rows without a provider URL and no wildcard (unknown slug → 404)', () => {
    const lines = goBlock()
    for (const row of table.rows.filter((r) => r.url === null)) {
      expect(lines.some((l) => l.startsWith(`/go/${row.slug} `))).toBe(false)
    }
    expect(lines.every((l) => !l.includes('*') && !l.includes(':splat'))).toBe(true)
  })

  it('targets only the public provider URL, never a partner or tracking link', () => {
    const text = goBlock().join('\n').toLowerCase()
    for (const needle of ['financeads', 'awin', 'impact.com', 'financequality', '?ref=', 'utm_']) {
      expect(text).not.toContain(needle)
    }
  })

  it('is disallowed in robots.txt for every crawler that may index the site', () => {
    const robots = generateRobots()
    expect(robots.match(new RegExp(`Disallow: ${GO_REDIRECT_PREFIX}`, 'g'))?.length).toBeGreaterThanOrEqual(7)
  })

  it('carries X-Robots-Tag: noindex via public/_headers', () => {
    const headers = readFileSync('public/_headers', 'utf8').replace(/\r\n/g, '\n')
    expect(headers).toContain('/go/*\n  X-Robots-Tag: noindex')
  })
})
