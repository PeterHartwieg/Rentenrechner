import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
})
