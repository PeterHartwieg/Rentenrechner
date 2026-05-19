// ---------------------------------------------------------------------------
// hubClusters.ts — typed exports for the homepage's "Erkunde Themen" hub.
// Issue #03.
//
// Lives outside `LandingPage.tsx` so the component file only exports the
// component (Vite's react-refresh rule). The hub data is referenced from the
// page itself and from regression tests.
//
// Locked structure (5 clusters, 10 anchors). Most target slugs do not have
// pages yet — issues #04–#07 ship them later. We deliberately do NOT introduce
// interim placeholder pages; the anchors link to bare canonical paths and
// resolve as the topic pages land.
//
// Anchor copy guardrails:
//   - Descriptive German, not advisory.
//   - No winner / recommendation framing ("besser als" / "empfohlen" /
//     "lohnt sich" are forbidden).
//   - No new "Rentenrechner" copy in user-visible labels.
//   - Bare canonical paths (no `?topic=` deep-link — issue #13 deferred).
//   - Trailing slash on every href so full-page navigations hit the with-slash
//     form CF Pages serves natively (avoids the no-slash → with-slash 307).
// ---------------------------------------------------------------------------

export interface HubLink {
  readonly href: string
  readonly label: string
}

export interface HubCluster {
  readonly heading: string
  readonly links: readonly HubLink[]
}

export const HUB_CLUSTERS: readonly HubCluster[] = [
  {
    heading: 'Renten-Lücke',
    links: [
      { href: '/rentenluecke-rechner/', label: 'Rentenlücke berechnen' },
      { href: '/rente-netto-berechnen/', label: 'Rente netto berechnen' },
    ],
  },
  {
    heading: 'bAV und ETF',
    links: [
      { href: '/bav-rechner/', label: 'bAV-Rechner' },
      { href: '/etf-vs-bav/', label: 'bAV oder ETF vergleichen' },
    ],
  },
  {
    heading: 'Geförderte Vorsorge',
    links: [
      { href: '/riester-rechner/', label: 'Riester-Rechner' },
      { href: '/altersvorsorgedepot-rechner/', label: 'Altersvorsorgedepot-Rechner' },
      { href: '/riester-vs-altersvorsorgedepot/', label: 'Riester oder Altersvorsorgedepot' },
    ],
  },
  {
    heading: 'Private Vorsorge',
    links: [
      { href: '/basisrente-rechner/', label: 'Basisrente-Rechner (Rürup)' },
      { href: '/private-rentenversicherung-rechner/', label: 'Private Rentenversicherung-Rechner' },
    ],
  },
  {
    heading: 'Portfolio',
    links: [
      { href: '/altersvorsorgeprodukte-vergleichen/', label: 'Altersvorsorgeprodukte vergleichen' },
    ],
  },
] as const

// ---------------------------------------------------------------------------
// Featured articles — editorial right-rail on the Landing page (PR 2).
//
// Curated subset of HUB_CLUSTERS links, in display order. Each href MUST
// match a `link.href` in HUB_CLUSTERS so labels stay consistent — the
// resolver below walks the clusters once and yields `{ href, label, cluster }`
// triplets. The cluster heading doubles as the per-article kicker so readers
// see what topic family the article belongs to without us inventing a
// separate taxonomy.
// ---------------------------------------------------------------------------

export interface FeaturedArticle {
  readonly href: string
  readonly label: string
  readonly cluster: string
}

export const FEATURED_ARTICLE_HREFS: readonly string[] = [
  '/rentenluecke-rechner/',
  '/etf-vs-bav/',
  '/basisrente-rechner/',
  '/altersvorsorgeprodukte-vergleichen/',
] as const

export function resolveFeaturedArticles(): readonly FeaturedArticle[] {
  // Build the href → article index once so each FEATURED_ARTICLE_HREFS lookup
  // is O(1) and so a missing curated href fails fast at module-evaluation time
  // (catches drift between `FEATURED_ARTICLE_HREFS` and `HUB_CLUSTERS` during
  // build/test instead of silently shrinking the right rail).
  const index = new Map<string, FeaturedArticle>()
  for (const cluster of HUB_CLUSTERS) {
    for (const link of cluster.links) {
      index.set(link.href, {
        href: link.href,
        label: link.label,
        cluster: cluster.heading,
      })
    }
  }
  return FEATURED_ARTICLE_HREFS.map((href) => {
    const article = index.get(href)
    if (!article) {
      throw new Error(
        `resolveFeaturedArticles: FEATURED_ARTICLE_HREFS contains "${href}" ` +
          `but no matching HUB_CLUSTERS link exists. Update either the curated ` +
          `featured list or the hub clusters so the two stay in sync.`,
      )
    }
    return article
  })
}

export function countHubArticles(): number {
  return HUB_CLUSTERS.reduce((acc, c) => acc + c.links.length, 0)
}
