// @vitest-environment node
/**
 * Import-direction guard for src/engine/.
 *
 * Engine modules must not import from src/app — that is an upward dependency
 * that invites app-layer concerns (React, storage, UI state) into pure math
 * code over time.  Violators: portfolioAdapter.ts:43 and
 * portfolioAllowance.ts:42 (import `confidenceForResult` from `../app/evidence`).
 *
 * Fix tracked in issue #75.
 */
import { describe, it, expect } from 'vitest'

import portfolioAdapterSrc from './portfolioAdapter.ts?raw'
import portfolioAllowanceSrc from './portfolioAllowance.ts?raw'
import portfolioCombineSrc from './portfolioCombine.ts?raw'
import portfolioFundingSrc from './portfolioFunding.ts?raw'
import portfolioProjectionSrc from './portfolioProjection.ts?raw'
import portfolioTransferSrc from './portfolioTransfer.ts?raw'
import simulateSrc from './simulate.ts?raw'
import simulationContextSrc from './simulationContext.ts?raw'
import buildResultSrc from './buildResult.ts?raw'

const ENGINE_SOURCES: Record<string, string> = {
  'portfolioAdapter.ts': portfolioAdapterSrc,
  'portfolioAllowance.ts': portfolioAllowanceSrc,
  'portfolioCombine.ts': portfolioCombineSrc,
  'portfolioFunding.ts': portfolioFundingSrc,
  'portfolioProjection.ts': portfolioProjectionSrc,
  'portfolioTransfer.ts': portfolioTransferSrc,
  'simulate.ts': simulateSrc,
  'simulationContext.ts': simulationContextSrc,
  'buildResult.ts': buildResultSrc,
}

const UPWARD_APP_IMPORT = /from\s+['"][^'"]*\/app\/[^'"]*['"]/

describe('Engine import direction', () => {
  it('scans at least one source file', () => {
    expect(Object.keys(ENGINE_SOURCES).length).toBeGreaterThan(0)
  })

  for (const [fileName, content] of Object.entries(ENGINE_SOURCES)) {
    it(`${fileName} does not import from src/app`, () => {
      expect(content).not.toMatch(UPWARD_APP_IMPORT)
    })
  }
})
