import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PUBLIC_ROUTE_IDS } from './publicRouteRegistry'

interface VercelRewrite {
  readonly source?: string
  readonly destination?: string
}

interface VercelConfig {
  readonly rewrites?: readonly VercelRewrite[]
}

function sourceMatchesPath(source: string, route: string): boolean {
  try {
    return new RegExp(`^${source}$`).test(route)
  } catch {
    return source === route
  }
}

describe('vercel.json routing for prerendered public routes', () => {
  it('does not rewrite prerendered clean URLs to the SPA shell', () => {
    const configPath = join(process.cwd(), 'vercel.json')
    if (!existsSync(configPath)) return

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig
    const rewrites = config.rewrites ?? []
    const prerenderedRoutes = PUBLIC_ROUTE_IDS.filter((route) => route !== '/' && route !== '/404')

    for (const route of prerenderedRoutes) {
      const shellRewrite = rewrites.find((rewrite) => (
        rewrite.destination === '/index.html'
        && typeof rewrite.source === 'string'
        && sourceMatchesPath(rewrite.source, route)
      ))

      expect(
        shellRewrite,
        `${route} is emitted as dist/${route.slice(1)}/index.html and must not be shadowed by an SPA rewrite`,
      ).toBeUndefined()
    }
  })
})
