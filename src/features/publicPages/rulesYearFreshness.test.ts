import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { RULES_YEAR } from '../../rules'
import { publicRouteRegistry, type PublicRoute } from '../../seo/publicRouteRegistry'

const root = process.cwd()

describe('public freshness stamps', () => {
  it('derive the displayed statutory-values year from the active rules year', () => {
    const rulesIndex = readFileSync(join(root, 'src/rules/index.ts'), 'utf8')

    expect(rulesIndex).toMatch(/\bRULES_YEAR\b/)
  })

  it('do not hardcode the statutory-values year in public page sources', () => {
    const publicPagesDir = join(root, 'src/features/publicPages')
    const publicPageSources = readdirSync(publicPagesDir)
      .filter((fileName) => fileName.endsWith('Page.tsx') || fileName.endsWith('.body.mdx'))
      .map((fileName) => join(publicPagesDir, fileName))

    const filesToScan = [
      join(root, 'src/features/landing/LandingPage.tsx'),
      join(root, 'src/features/methode/MethodePage.tsx'),
      ...publicPageSources,
    ]

    const hardcodedFreshnessYear = /Werte(?:\s+f[üu]r\s+Deutschland|\s+Stand)?\s+2026/
    const offenders = filesToScan
      .filter((filePath) => hardcodedFreshnessYear.test(readFileSync(filePath, 'utf8')))
      .map((filePath) => filePath.replace(`${root}\\`, '').replaceAll('\\', '/'))

    expect(offenders).toEqual([])
  })

  it.each([...new Set([RULES_YEAR, 2027])])('does not hardcode rules year %i in registry copy', (rulesYear) => {
    const registrySource = readFileSync(join(root, 'src/seo/publicRouteRegistry.ts'), 'utf8')
    const copyLines = registrySource.split('\n').filter((line) =>
      !/^\s*(?:\/\/|\*|dateModified:|datePublished:)/.test(line),
    )
    const hardcodedRulesYear = new RegExp(`\\b${rulesYear}\\b`)
    // The AVD launch year is a fixed fact, even when it coincides with RULES_YEAR.
    expect(copyLines.filter((line) => hardcodedRulesYear.test(
      line.replace('neues Schicht-2-Depot ab 2027', 'neues Schicht-2-Depot'),
    ))).toEqual([])
    expect(publicRouteRegistry['/'].title).toBe(`Altersvorsorge-Rechner ${RULES_YEAR} | RentenWiki.de`)
  })

  it.each([2027, 2028])('updates rule-year copy to %i while preserving fixed-year facts', async (year) => {
    const loadRegistry = async (rulesYear: number) => {
      vi.resetModules()
      vi.doMock('../../rules', async (importOriginal) => ({
        ...await importOriginal<typeof import('../../rules')>(),
        RULES_YEAR: rulesYear,
      }))
      return (await import('../../seo/publicRouteRegistry')).publicRouteRegistry
    }
    try {
      // A sentinel distinguishes rule-year substitutions from fixed dates such as "ab 2027".
      const sentinelYear = 9999
      const templateRegistry = await loadRegistry(sentinelYear)
      const nextRegistry = await loadRegistry(year)
      for (const path of Object.keys(publicRouteRegistry) as (keyof typeof publicRouteRegistry)[]) {
        const original: PublicRoute = templateRegistry[path]
        const next: PublicRoute = nextRegistry[path]
        for (const field of ['title', 'metaDescription', 'h1', 'summary'] as const) {
          expect(next[field], `${path}: ${field}`).toBe(
            original[field].replaceAll(String(sentinelYear), String(year)),
          )
        }
        // Editorial dates are historical facts, independent of the rule year.
        expect(next.dateModified).toBe(original.dateModified)
        expect(next.datePublished).toBe(original.datePublished)
      }
    } finally {
      vi.doUnmock('../../rules')
      vi.resetModules()
    }
  })
})
