// Storage-key constants extracted to a side-effect-free module so
// `useRoute.detectSavedMode` (called by App.tsx on every page) can read them
// without dragging the rest of `src/storage.ts` (engine projection,
// scenario validators, etc.) into the initial bundle for static-content
// routes.
//
// Two localStorage keys coexist during the v1→v2 transition. Read order
// for `loadSavedState` / `loadSavedWorkspace` is V2 first, then V1 with
// migration applied.

export const STORAGE_KEY_V1 = 'rentenrechner-state-v1'
export const STORAGE_KEY_V2 = 'rentenrechner-state-v2'
