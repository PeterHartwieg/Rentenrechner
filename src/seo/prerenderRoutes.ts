import { isEditorialChromeRoute } from '../features/articles/articleResolver'
import { PUBLIC_ROUTE_IDS } from './publicRouteRegistry'

// One manifest drives SSR module loading, component mapping, and parity tests.
// null deliberately selects the homepage landing shell.
export const PRERENDER_COMPONENTS = {
  '/': null,
  '/404': { module: '/src/features/publicPages/PageNotFound.tsx', exportName: 'PageNotFound' },
  '/artikel': { module: '/src/features/articles/ArticleHubPage.tsx', exportName: 'ArticleHubPage' },
  '/methode': { module: '/src/features/methode/MethodePage.tsx', exportName: 'MethodePage' },
  '/eingaben': { module: '/src/features/inputs/AngabenPage.tsx', exportName: 'AngabenPage' },
  '/eingaben/produkte': { module: '/src/features/inputs/AngabenProduktePage.tsx', exportName: 'AngabenProduktePage' },
  '/rentenluecke-rechner': { module: '/src/features/publicPages/RentenluckeRechnerPage.tsx', exportName: 'RentenluckeRechnerPage' },
  '/bav-rechner': { module: '/src/features/publicPages/BavRechnerPage.tsx', exportName: 'BavRechnerPage' },
  '/etf-vs-bav': { module: '/src/features/publicPages/EtfVsBavPage.tsx', exportName: 'EtfVsBavPage' },
  '/riester-rechner': { module: '/src/features/publicPages/RiesterRechnerPage.tsx', exportName: 'RiesterRechnerPage' },
  '/altersvorsorgedepot-rechner': { module: '/src/features/publicPages/AltersvorsorgedepotRechnerPage.tsx', exportName: 'AltersvorsorgedepotRechnerPage' },
  '/riester-vs-altersvorsorgedepot': { module: '/src/features/publicPages/RiesterVsAltersvorsorgedepotPage.tsx', exportName: 'RiesterVsAltersvorsorgedepotPage' },
  '/basisrente-rechner': { module: '/src/features/publicPages/BasisrenteRechnerPage.tsx', exportName: 'BasisrenteRechnerPage' },
  '/private-rentenversicherung-rechner': { module: '/src/features/publicPages/PrivateRentenversicherungRechnerPage.tsx', exportName: 'PrivateRentenversicherungRechnerPage' },
  '/rente-netto-berechnen': { module: '/src/features/publicPages/RenteNettoBerechnePage.tsx', exportName: 'RenteNettoBerechnePage' },
  '/altersvorsorgeprodukte-vergleichen': { module: '/src/features/publicPages/AltersvorsorgeproduktePage.tsx', exportName: 'AltersvorsorgeproduktePage' },
  '/vergleich': { module: '/src/features/vergleich/VergleichJourneyPage.tsx', exportName: 'VergleichJourneyPage' },
  '/vergleich/details': { module: '/src/features/vergleich-detail/VergleichDetailPage.tsx', exportName: 'VergleichDetailPage' },
  '/impressum': { module: '/src/features/legal/ImpressumPage.tsx', exportName: 'ImpressumPage' },
  '/datenschutz': { module: '/src/features/legal/DatenschutzPage.tsx', exportName: 'DatenschutzPage' },
} as const

export const PRERENDER_COMPONENT_IDS = Object.keys(PRERENDER_COMPONENTS)

// SSR always renders the landing view at /; the live app makes this
// editorial only when calculatorView is landing.
export const EDITORIAL_ROUTE_IDS = new Set(
  PUBLIC_ROUTE_IDS.filter((id) => id === '/' || isEditorialChromeRoute(id)),
)

export function buildComponentMap(modules: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(Object.entries(PRERENDER_COMPONENTS).map(([id, entry]) => {
    if (entry === null) return [id, null]
    const component = modules[id]?.[entry.exportName]
    if (!component) throw new Error(`Missing prerender export ${entry.exportName} for ${id}`)
    return [id, component]
  }))
}
