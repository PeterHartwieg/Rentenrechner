import { defineConfig } from 'vitest/config'

/**
 * Narrowed Vitest config for the mutation-testing pilot ONLY (`npm run
 * mutation:pilot`, see `stryker.pilot.json`). Engine-only include list — no
 * React/MDX/Cloudflare plugins and no jsdom are needed, which keeps each
 * mutant's test run fast. Regular test runs use the main `vite.config.ts`.
 */
export default defineConfig({
  define: { __RW_BUILD_DATE__: JSON.stringify('stryker-pilot') },
  test: {
    include: [
      'src/engine/tax.test.ts',
      'src/engine/portfolioAllowance.test.ts',
      'src/engine/portfolioAllowance.property.test.ts',
    ],
    setupFiles: ['./src/vitest.setup.ts'],
  },
})
