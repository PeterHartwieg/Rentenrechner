import { useEffect, useState } from 'react'

export type Viewport = 'phone' | 'tablet' | 'desktop'

export const PHONE_MAX = 639
export const TABLET_MIN = 640
export const TABLET_MAX = 1023
export const DESKTOP_MIN = 1024

const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`
const TABLET_QUERY = `(min-width: ${TABLET_MIN}px) and (max-width: ${TABLET_MAX}px)`

export function resolveViewport(): Viewport {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'desktop'
  }
  if (window.matchMedia(PHONE_QUERY).matches) return 'phone'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'desktop'
}

/**
 * Returns the current viewport bucket. Used by chrome primitives whose
 * variants differ in *mount* (e.g. MobileNav only on phone). CSS-only
 * visual differences should stay in stylesheets — this hook is for cases
 * where conditional React subtrees matter.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(resolveViewport)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const phoneMql = window.matchMedia(PHONE_QUERY)
    const tabletMql = window.matchMedia(TABLET_QUERY)

    function update() {
      setViewport(resolveViewport())
    }

    phoneMql.addEventListener('change', update)
    tabletMql.addEventListener('change', update)
    update()

    return () => {
      phoneMql.removeEventListener('change', update)
      tabletMql.removeEventListener('change', update)
    }
  }, [])

  return viewport
}
