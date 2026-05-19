import { describe, expect, it } from 'vitest'
import {
  countAllArticles,
  countArticlesInCluster,
  findArticleByPath,
  getLatestArticleModified,
  isArticleRoute,
  isEditorialChromeRoute,
  resolveHubGroups,
} from './articleResolver'
import { HUB_CLUSTERS } from '../landing/hubClusters'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'

describe('articleResolver — HUB_CLUSTERS × publicRouteRegistry resolution', () => {
  it('resolveHubGroups returns one group per HUB_CLUSTERS entry, in order', () => {
    const groups = resolveHubGroups()
    expect(groups.length).toBe(HUB_CLUSTERS.length)
    for (let i = 0; i < HUB_CLUSTERS.length; i += 1) {
      expect(groups[i].heading).toBe(HUB_CLUSTERS[i].heading)
      expect(groups[i].entries.length).toBe(HUB_CLUSTERS[i].links.length)
    }
  })

  it('resolveHubGroups attaches each cluster link to its registry entry', () => {
    const groups = resolveHubGroups()
    for (const group of groups) {
      for (const entry of group.entries) {
        expect(entry.route).toBeDefined()
        expect(entry.route.canonical).toBe(entry.path)
        expect(entry.cluster).toBe(group.heading)
      }
    }
  })

  it('findArticleByPath returns null for non-clustered paths', () => {
    expect(findArticleByPath('/')).toBeNull()
    expect(findArticleByPath('/artikel')).toBeNull()
    expect(findArticleByPath('/impressum')).toBeNull()
    expect(findArticleByPath('/404')).toBeNull()
  })

  it('findArticleByPath returns the matching entry for a clustered path', () => {
    const entry = findArticleByPath('/bav-rechner')
    expect(entry).not.toBeNull()
    expect(entry!.cluster).toBe('bAV und ETF')
    expect(entry!.route.h1).toBe(publicRouteRegistry['/bav-rechner'].h1)
  })

  it('isArticleRoute is true for every clustered route, false for hub/legal/404', () => {
    expect(isArticleRoute('/bav-rechner')).toBe(true)
    expect(isArticleRoute('/etf-vs-bav')).toBe(true)
    expect(isArticleRoute('/')).toBe(false)
    expect(isArticleRoute('/artikel')).toBe(false)
    expect(isArticleRoute('/impressum')).toBe(false)
    expect(isArticleRoute('/404')).toBe(false)
  })

  it('isEditorialChromeRoute promotes /artikel + every clustered route', () => {
    expect(isEditorialChromeRoute('/artikel')).toBe(true)
    expect(isEditorialChromeRoute('/bav-rechner')).toBe(true)
    expect(isEditorialChromeRoute('/')).toBe(false)
    expect(isEditorialChromeRoute('/impressum')).toBe(false)
  })

  it('isEditorialChromeRoute keeps /methode sober (PR 4 — Sober D, not editorial)', () => {
    // The Methode page wears the same white + IBM Plex Sans chrome as the
    // tool pages. Promoting it into the editorial set would flip its
    // background to cream and the H1 to Newsreader serif, breaking the
    // sober reference-page visual treatment shipped in PR 4.
    expect(isEditorialChromeRoute('/methode')).toBe(false)
  })

  it('countArticlesInCluster sums to countAllArticles across HUB_CLUSTERS', () => {
    const total = countAllArticles()
    const summed = HUB_CLUSTERS.reduce(
      (acc, c) => acc + countArticlesInCluster(c.heading),
      0,
    )
    expect(summed).toBe(total)
  })

  it('countArticlesInCluster returns 0 for unknown headings (no throw)', () => {
    expect(countArticlesInCluster('Nonexistent Cluster')).toBe(0)
  })

  it('getLatestArticleModified returns a YYYY-MM-DD string', () => {
    const latest = getLatestArticleModified()
    expect(latest).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
