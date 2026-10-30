import { describe, expect, it } from 'vitest'
import { pathToRoute, routeToPath } from '../app/useRoute'
import { isEditorialChromeRoute } from '../features/articles/articleResolver'
import { PUBLIC_ROUTE_IDS, publicRouteRegistry } from './publicRouteRegistry'
import {
  buildComponentMap,
  EDITORIAL_ROUTE_IDS,
  PRERENDER_COMPONENT_IDS,
  PRERENDER_COMPONENTS,
} from './prerenderRoutes'

// Exercise the map builder with the same source modules the SSR loader uses.
const loadPage = import.meta.glob<Record<string, unknown>>('/src/features/**/*.tsx')
const pageModules = Object.fromEntries(await Promise.all(
  Object.entries(PRERENDER_COMPONENTS).map(async ([id, entry]) =>
    [id, entry === null ? {} : await loadPage[entry.module]()]),
))
const componentMap = buildComponentMap(pageModules)

describe('public route parity', () => {
  it('has exactly the registry IDs in the prerender component map', () => {
    expect([...PRERENDER_COMPONENT_IDS].sort()).toEqual([...PUBLIC_ROUTE_IDS].sort())
    expect(Object.keys(componentMap).sort()).toEqual([...PUBLIC_ROUTE_IDS].sort())
  })

  describe.each(PUBLIC_ROUTE_IDS)('%s', (id) => {
    it('round-trips through the app router at its registered canonical path', () => {
      const route = pathToRoute(id)
      if (id !== '/404') expect(route.kind).not.toBe('not-found')
      expect(routeToPath(route)).toBe(id)
      expect(publicRouteRegistry[id].canonical).toBe(routeToPath(route))
      expect(pathToRoute(routeToPath(route))).toEqual(route)
    })

    it('has a prerender component (or the deliberate homepage landing shell)', () => {
      expect(componentMap).toHaveProperty(id)
      if (id === '/') expect(componentMap[id]).toBeNull()
      else expect(componentMap[id]).toBeTypeOf('function')
    })

    it('uses the same editorial chrome as the app landing view', () => {
      expect(EDITORIAL_ROUTE_IDS.has(id)).toBe(id === '/' || isEditorialChromeRoute(id))
    })
  })
})
