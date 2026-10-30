// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicRouteRegistry } from '../seo/publicRouteRegistry'
import { ROUTES, useRoute } from './useRoute'

beforeEach(() => {
  window.history.replaceState(null, '', '/methode/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

it('initializes from the pathname, updates titles, and preserves search and hash during navigation', () => {
  const push = vi.spyOn(window.history, 'pushState')
  const navigated = vi.fn()
  window.addEventListener('rentenwiki:navigated', navigated)
  try {
    const { result } = renderHook(useRoute)
    expect(result.current.route).toEqual(ROUTES.methode)
    expect(document.title).toBe(publicRouteRegistry['/methode'].title)

    act(() => result.current.navigate(ROUTES.vergleichDetail, '?scenario=optimistisch', '#details'))
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/vergleich/details/?scenario=optimistisch#details')
    expect(result.current.route).toEqual(ROUTES.vergleichDetail)
    expect(document.title).toBe(publicRouteRegistry['/vergleich/details'].title)

    act(() => result.current.navigate(ROUTES.vergleichDetail, '?scenario=optimistisch', '#details'))
    expect(push).toHaveBeenCalledTimes(1)
    expect(navigated).toHaveBeenCalledTimes(2)

    act(() => result.current.navigate(ROUTES.vertrag('bav:1')))
    expect(window.location.pathname).toBe('/vertrag/bav%3A1')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
    expect(result.current.route).toEqual(ROUTES.vertrag('bav:1'))
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  } finally {
    window.removeEventListener('rentenwiki:navigated', navigated)
  }
})

it('handles browser back/forward and removes the popstate listener on unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const navigated = vi.fn()
  window.addEventListener('rentenwiki:navigated', navigated)
  try {
    const { result, unmount } = renderHook(useRoute)
    act(() => {
      window.history.replaceState(null, '', '/artikel/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.route).toEqual(ROUTES.artikel)
    expect(navigated).toHaveBeenCalledTimes(1)
    unmount()
    expect(remove).toHaveBeenCalledWith('popstate', expect.any(Function))
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(navigated).toHaveBeenCalledTimes(1)
  } finally {
    window.removeEventListener('rentenwiki:navigated', navigated)
  }
})
