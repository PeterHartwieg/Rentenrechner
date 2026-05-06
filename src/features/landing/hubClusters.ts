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
      { href: '/rentenluecke-rechner', label: 'Rentenlücke berechnen' },
      { href: '/rente-netto-berechnen', label: 'Rente netto berechnen' },
    ],
  },
  {
    heading: 'bAV und ETF',
    links: [
      { href: '/bav-rechner', label: 'bAV-Rechner' },
      { href: '/etf-vs-bav', label: 'bAV oder ETF vergleichen' },
    ],
  },
  {
    heading: 'Geförderte Vorsorge',
    links: [
      { href: '/riester-rechner', label: 'Riester-Rechner' },
      { href: '/altersvorsorgedepot-rechner', label: 'Altersvorsorgedepot-Rechner' },
      { href: '/riester-vs-altersvorsorgedepot', label: 'Riester oder Altersvorsorgedepot' },
    ],
  },
  {
    heading: 'Private Vorsorge',
    links: [
      { href: '/basisrente-rechner', label: 'Basisrente-Rechner (Rürup)' },
      { href: '/private-rentenversicherung-rechner', label: 'Private Rentenversicherung-Rechner' },
    ],
  },
  {
    heading: 'Portfolio',
    links: [
      { href: '/altersvorsorgeprodukte-vergleichen', label: 'Altersvorsorgeprodukte vergleichen' },
    ],
  },
] as const
