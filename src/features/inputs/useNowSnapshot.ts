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
 *   - `getSnapshot` returns `Date.now()` when `lastEditedAt` is set; without
 *     a recorded edit it freezes at `initialNow` (captured once per mount)
 *     so the strip doesn't tick uselessly for fresh workspaces.
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

import { useCallback, useState, useSyncExternalStore } from 'react'

export function useNowSnapshot(lastEditedAt: number | undefined): number {
  // Lazy `useState` init reads `Date.now()` exactly once per mount — React
  // permits impure reads inside the initializer because it runs in a setup
  // phase, not during render. Used as the "no edit yet" baseline so the
  // computed elapsedMs in the caller stays 0 and the strip reads "soeben".
  const [initialNow] = useState<number>(() => Date.now())
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (lastEditedAt === undefined) return () => {}
      const intervalId = window.setInterval(onStoreChange, 1_000)
      return () => window.clearInterval(intervalId)
    },
    [lastEditedAt],
  )
  const getSnapshot = useCallback(
    () => (lastEditedAt === undefined ? initialNow : Date.now()),
    [initialNow, lastEditedAt],
  )
  // Pass `initialNow` as the SSR fallback (third arg) so renders on the
  // server don't read `Date.now()`. Same constant value on every SSR call.
  const getServerSnapshot = useCallback(() => initialNow, [initialNow])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
