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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readBalancedGroup(source: string, startIndex: number): { readonly pattern: string; readonly nextIndex: number } | null {
  let depth = 0

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\\') {
      index += 1
      continue
    }

    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          pattern: source.slice(startIndex + 1, index),
          nextIndex: index + 1,
        }
      }
    }
  }

  return null
}

function vercelPathSourceToRegExp(source: string): RegExp | null {
  if (!source.includes(':')) return null

  let pattern = '^'
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (char !== ':') {
      pattern += escapeRegExp(char)
      index += 1
      continue
    }

    index += 1
    while (/[A-Za-z0-9_]/.test(source[index] ?? '')) {
      index += 1
    }

    let routePattern = '[^/]+'
    if (source[index] === '(') {
      const group = readBalancedGroup(source, index)
      if (group === null) return null
      routePattern = group.pattern
      index = group.nextIndex
    }

    const modifier = source[index]
    if (modifier === '*') {
      pattern += routePattern === '[^/]+' ? '.*' : `(?:${routePattern})*`
      index += 1
    } else if (modifier === '+') {
      pattern += routePattern === '[^/]+' ? '.+' : `(?:${routePattern})+`
      index += 1
    } else if (modifier === '?') {
      pattern += `(?:${routePattern})?`
      index += 1
    } else {
      pattern += `(?:${routePattern})`
    }
  }

  try {
    return new RegExp(`${pattern}$`)
  } catch {
    return null
  }
}

function sourceMatchesPath(source: string, route: string): boolean {
  const vercelPathPattern = vercelPathSourceToRegExp(source)
  if (vercelPathPattern !== null) {
    return vercelPathPattern.test(route)
  }

  try {
    return new RegExp(`^${source}$`).test(route)
  } catch {
    return source === route
  }
}

describe('sourceMatchesPath', () => {
  it('matches raw regex rewrite sources', () => {
    expect(sourceMatchesPath('/((?!.*\\.).*)', '/bav-rechner')).toBe(true)
    expect(sourceMatchesPath('/((?!.*\\.).*)', '/assets/logo.svg')).toBe(false)
  })

  it('matches Vercel path-parameter rewrite sources', () => {
    expect(sourceMatchesPath('/:path*', '/bav-rechner')).toBe(true)
    expect(sourceMatchesPath('/:path*', '/produkte/bav')).toBe(true)

    expect(sourceMatchesPath('/:path((?!uk/).*)', '/bav-rechner')).toBe(true)
    expect(sourceMatchesPath('/:path((?!uk/).*)', '/uk/bav-rechner')).toBe(false)
  })
})

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
