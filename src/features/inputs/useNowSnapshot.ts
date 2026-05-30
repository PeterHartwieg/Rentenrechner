/**
 * `useNowSnapshot` — React-pure "current time" hook used by the
 * `AngabenProduktePage` receipt strip.
 *
 * Returns a numeric "now" snapshot that ticks every second while a baseline
 * `lastEditedAt` is present, so the relative-time receipt strip refreshes
 * live ("vor 5 s" → "vor 6 s" → …). Render itself never calls `Date.now()`,
 * which keeps the component compliant with React 19's purity rules.
 *
 * Mechanism:
 *   - `subscribe` starts a 1-second `setInterval` that pings React to
 *     re-read the snapshot, and clears the interval on unmount / when
 *     `lastEditedAt` flips back to `undefined`.
 *   - `getSnapshot` returns a *cached* timestamp (`nowRef`, refreshed only by
 *     the 1-second tick) when `lastEditedAt` is set; without a recorded edit
 *     it freezes at `initialNow` (captured once per mount) so the strip
 *     doesn't tick uselessly for fresh workspaces. It never calls `Date.now()`
 *     during a snapshot read, so `useSyncExternalStore`'s `Object.is` compare
 *     stays stable across read/compare passes (React 19 "The result of
 *     getSnapshot should be cached to avoid an infinite loop" — CR-PR4-R2-1).
 *
 * Tests can pin time deterministically by combining
 * `vi.useFakeTimers()` + `vi.setSystemTime()` before the first mount and
 * advancing the timers between assertions.
 *
 * Regression note (CR-PR4-R1-1): a prior implementation used a no-op
 * `subscribe` and only recomputed `getSnapshot` when `lastEditedAt`
 * changed — `useSyncExternalStore` therefore had no signal to re-render,
 * so the "zuletzt geändert vor X" string would freeze at its initial
 * bucket and never re-bucket. Lives in its own module so the
 * `react-refresh/only-export-components` lint stays happy on
 * `AngabenProduktePage.tsx` (component file).
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'

export function useNowSnapshot(lastEditedAt: number | undefined): number {
  // Lazy `useState` init reads `Date.now()` exactly once per mount — React
  // permits impure reads inside the initializer because it runs in a setup
  // phase, not during render. Used as the "no edit yet" baseline so the
  // computed elapsedMs in the caller stays 0 and the strip reads "soeben".
  const [initialNow] = useState<number>(() => Date.now())
  // Cache the ticking timestamp in a ref. `getSnapshot` reads this ref instead
  // of calling `Date.now()` directly, so two consecutive snapshot reads within
  // the same tick return the identical value. React 19 compares snapshots with
  // `Object.is` on every read pass; a fresh `Date.now()` per call would look
  // like a perpetual store change and trip the "getSnapshot should be cached
  // to avoid an infinite loop" warning. The ref only advances in the tick.
  const nowRef = useRef<number>(initialNow)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (lastEditedAt === undefined) return () => {}
      const intervalId = window.setInterval(() => {
        nowRef.current = Date.now()
        onStoreChange()
      }, 1_000)
      return () => window.clearInterval(intervalId)
    },
    [lastEditedAt],
  )
  const getSnapshot = useCallback(
    () => (lastEditedAt === undefined ? initialNow : nowRef.current),
    [initialNow, lastEditedAt],
  )
  // Pass `initialNow` as the SSR fallback (third arg) so renders on the
  // server don't read `Date.now()`. Same constant value on every SSR call.
  const getServerSnapshot = useCallback(() => initialNow, [initialNow])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
