import { useEffect, useState } from 'react'

// Minimal in-app router. Two static legal pages plus the calculator at /.
// We avoid pulling in react-router because the only routes we need are these
// three and the framework dependency would be larger than the implementation.
//
// Static-host SPA fallback (Cloudflare Pages / Vercel / Netlify) is required
// for direct loads of /impressum or /datenschutz. See `public/_redirects`.

export type Route = '/' | '/impressum' | '/datenschutz'

const KNOWN_ROUTES: Route[] = ['/', '/impressum', '/datenschutz']

export function normalizeRoute(pathname: string): Route {
  // Strip a trailing slash unless the path is just "/"
  const trimmed = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  return (KNOWN_ROUTES as string[]).includes(trimmed) ? (trimmed as Route) : '/'
}

export function useRoute(): { route: Route; navigate: (target: Route) => void } {
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window === 'undefined') return '/'
    return normalizeRoute(window.location.pathname)
  })

  useEffect(() => {
    function onPopState() {
      setRoute(normalizeRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(target: Route): void {
    if (typeof window === 'undefined') return
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
    setRoute(target)
    window.scrollTo(0, 0)
  }

  return { route, navigate }
}
