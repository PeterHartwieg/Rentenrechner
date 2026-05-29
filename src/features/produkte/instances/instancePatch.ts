/**
 * Shared instance patch-diffing for the per-product combine-mode editors.
 *
 * Every editor's `CommonContractFields` `onChange` used to inline the same
 * shallow-diff-then-dispatch loop (copy-pasted verbatim across all six
 * editors — CR-PR4-R2-4). It lives here, in a non-component module, so the
 * `react-refresh/only-export-components` lint stays happy on `_shared.tsx`
 * (which exports only components) — the same split rationale as
 * `fieldHelpers.ts` / `invFieldContext.ts`.
 */

/**
 * Shallow-diff `next` against `prev` and return only the changed top-level
 * keys as a partial patch. Editors send this through `patchInstance` so a
 * single-field edit never replaces the whole instance — sibling fields stay
 * untouched in the workspace (and so don't churn `lastEditedAt` or clobber a
 * concurrent edit on another field).
 */
export function diffInstancePatch<T extends object>(prev: T, next: T): Partial<T> {
  const patch: Partial<T> = {}
  ;(Object.keys(next) as Array<keyof T>).forEach((k) => {
    if (next[k] !== prev[k]) {
      ;(patch as Record<string, unknown>)[k as string] = next[k]
    }
  })
  return patch
}

/**
 * Build the `onChange` handler `CommonContractFields` expects: diff the
 * incoming instance against the current one and dispatch the non-empty patch.
 *
 * The five "plain" editors (bAV, ETF, pAV, Basisrente, AVD) use this directly.
 * Riester composes `diffInstancePatch` manually instead, because it also
 * mirrors `currentValueEUR` into `existingCapital` before dispatching.
 */
export function makeInstancePatcher<T extends object>(
  instance: T,
  patchInstance: (patch: Partial<T>) => void,
): (next: T) => void {
  return (next) => {
    const patch = diffInstancePatch(instance, next)
    if (Object.keys(patch).length > 0) patchInstance(patch)
  }
}
