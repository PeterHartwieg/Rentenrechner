// @vitest-environment node
/**
 * Purity enforcement — ensures src/api/ files stay free of browser and React deps.
 *
 * The API facade must be usable in Node (CLI, future HTTP layer) without
 * pulling in React, DOM, or browser-only globals.
 *
 * Source files are imported as raw strings via Vite's `?raw` suffix so
 * this test stays compatible with the app tsconfig (no Node types needed).
 */
import { describe, it, expect } from 'vitest'

import apiTypesSrc from './apiTypes.ts?raw'
import contractsSrc from './contracts.ts?raw'
import rulesSrc from './rules.ts?raw'
import manifestSrc from './manifest.ts?raw'
import validationSrc from './validation.ts?raw'
import comparisonSrc from './comparison.ts?raw'
import resultSummariesSrc from './resultSummaries.ts?raw'
import taxSrc from './tax.ts?raw'
import fundingSrc from './funding.ts?raw'
import retirementSrc from './retirement.ts?raw'
import indexSrc from './index.ts?raw'

const SOURCE_FILES: Record<string, string> = {
  'apiTypes.ts': apiTypesSrc,
  'contracts.ts': contractsSrc,
  'rules.ts': rulesSrc,
  'manifest.ts': manifestSrc,
  'validation.ts': validationSrc,
  'comparison.ts': comparisonSrc,
  'resultSummaries.ts': resultSummariesSrc,
  'tax.ts': taxSrc,
  'funding.ts': fundingSrc,
  'retirement.ts': retirementSrc,
  'index.ts': indexSrc,
}

const FORBIDDEN_PATTERNS = [
  { label: "import from 'react'", pattern: /from\s+['"]react['"]/ },
  { label: "import from 'react-dom'", pattern: /from\s+['"]react-dom['"]/ },
  { label: 'localStorage', pattern: /localStorage/ },
  { label: 'sessionStorage', pattern: /sessionStorage/ },
  { label: 'window.', pattern: /window\./ },
  { label: 'document.', pattern: /document\./ },
  { label: 'navigator.clipboard', pattern: /navigator\.clipboard/ },
  { label: 'fetch(', pattern: /fetch\(/ },
]

describe('API purity', () => {
  it('scans at least one source file', () => {
    expect(Object.keys(SOURCE_FILES).length).toBeGreaterThan(0)
  })

  for (const [fileName, content] of Object.entries(SOURCE_FILES)) {
    describe(fileName, () => {
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        it(`does not contain ${label}`, () => {
          expect(content).not.toMatch(pattern)
        })
      }
    })
  }
})
