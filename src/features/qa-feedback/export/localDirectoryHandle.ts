/**
 * File System Access API — directory handle manager (issue 14).
 *
 * Wraps `showDirectoryPicker()` with a session-scoped in-memory cache so the
 * first call in a session shows the native picker and all subsequent calls
 * write directly without prompting again.
 *
 * ## Browser support
 *
 * `showDirectoryPicker` is available in Chrome/Edge (Chromium ≥ 86). It is
 * absent in Firefox and Safari. All callers must feature-detect before
 * calling; `isLocalSaveSupported()` is the single detection point.
 *
 * ## No network
 *
 * All operations write to local disk via the File System Access API.
 * No fetch, no XHR, no server code.
 *
 * ## Lifetime
 *
 * The cached handle lives for the JavaScript module lifetime (effectively the
 * browser session). There is no persistence across page reloads — the tester
 * must re-select the directory once per session. This is intentional: the
 * File System Access API does not guarantee handle validity across page loads
 * without explicit persistence via IndexedDB.
 */

// ─── Feature detection ─────────────────────────────────────────────────────────

/**
 * Returns true when `showDirectoryPicker` is available in the current
 * browsing context. Use this to show/hide the "Lokal speichern" button.
 *
 * Checking at call time (not at module load) keeps the module SSR-safe and
 * allows tests to stub `window.showDirectoryPicker` after module import.
 */
export function isLocalSaveSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  )
}

// ─── Handle cache (module-scoped, session lifetime) ───────────────────────────

let cachedHandle: FileSystemDirectoryHandle | null = null

/**
 * Acquire a `FileSystemDirectoryHandle` for the reports directory.
 *
 * - First call: shows the native `showDirectoryPicker()` dialog. The tester
 *   selects the destination folder (suggested: `.scratch/qa-feedback-mode/reports/`).
 * - Subsequent calls within the same session: returns the cached handle without
 *   showing a picker.
 *
 * Throws when:
 *   - The API is unavailable (caller should guard with `isLocalSaveSupported()`).
 *   - The tester cancels the picker (`AbortError`).
 *   - Permission is denied by the browser.
 *
 * The caller (localSave.ts) is responsible for surfacing errors to the tester.
 */
export async function acquireReportsDirectory(): Promise<FileSystemDirectoryHandle> {
  if (cachedHandle !== null) {
    return cachedHandle
  }

  const picker = (window as { showDirectoryPicker?: (opts?: { id?: string; mode?: string; startIn?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker

  if (typeof picker !== 'function') {
    throw new Error('showDirectoryPicker is not available in this browser.')
  }

  const handle = await picker({
    id: 'qa-reports',
    mode: 'readwrite',
    startIn: 'downloads',
  })

  cachedHandle = handle
  return handle
}

/**
 * Write `content` as a UTF-8 text file named `filename` in the given
 * `FileSystemDirectoryHandle`.
 *
 * Overwrites any existing file with the same name (expected for re-runs of the
 * same report). The write is atomic at the OS level via `createWritable()` +
 * `close()`.
 */
export async function saveToDirectory(
  handle: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * Write raw binary data (`Uint8Array`) to `filename` in the given directory.
 * Used for PNG screenshot artifacts written alongside the `.md` issue file.
 */
export async function saveBinaryToDirectory(
  handle: FileSystemDirectoryHandle,
  filename: string,
  data: Uint8Array,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  // Cast to ArrayBuffer-backed Uint8Array to satisfy FileSystemWriteChunkType.
  // The PNG bytes originate from `dataUrlToUint8Array` which always produces
  // a plain ArrayBuffer (not a SharedArrayBuffer), so the cast is safe.
  await writable.write(data as unknown as Uint8Array<ArrayBuffer>)
  await writable.close()
}

/**
 * Clear the cached handle. Exposed for testing and for any future "change
 * directory" UI affordance. Normal callers do not need this.
 */
export function clearCachedHandle(): void {
  cachedHandle = null
}
