// @vitest-environment jsdom

/**
 * Tests for localDirectoryHandle.ts (issue 14).
 *
 * The File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`)
 * is not available in jsdom. All tests stub the browser globals they need.
 *
 * Coverage:
 *   - `isLocalSaveSupported()` detection logic.
 *   - `acquireReportsDirectory()` calls picker on first call, returns cache on second.
 *   - `acquireReportsDirectory()` re-throws on AbortError and other errors.
 *   - `saveToDirectory()` invokes getFileHandle + createWritable + write + close.
 *   - `saveBinaryToDirectory()` writes a Uint8Array.
 *   - `clearCachedHandle()` forces next call to show picker again.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireReportsDirectory,
  clearCachedHandle,
  isLocalSaveSupported,
  saveBinaryToDirectory,
  saveToDirectory,
} from './localDirectoryHandle'

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal fake FileSystemDirectoryHandle. */
function makeFakeHandle(): FileSystemDirectoryHandle {
  const writeSpy = vi.fn().mockResolvedValue(undefined)
  const closeSpy = vi.fn().mockResolvedValue(undefined)
  const writableSpy = { write: writeSpy, close: closeSpy }
  const createWritableSpy = vi.fn().mockResolvedValue(writableSpy)
  const getFileHandleSpy = vi.fn().mockResolvedValue({ createWritable: createWritableSpy })

  return {
    getFileHandle: getFileHandleSpy,
    // Minimal shape — other FileSystemDirectoryHandle methods not used.
  } as unknown as FileSystemDirectoryHandle
}

// ─── Feature detection ─────────────────────────────────────────────────────────

describe('isLocalSaveSupported()', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // Remove the stub so other tests start clean.
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('returns false when showDirectoryPicker is absent', () => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
    expect(isLocalSaveSupported()).toBe(false)
  })

  it('returns true when showDirectoryPicker is a function', () => {
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn()
    expect(isLocalSaveSupported()).toBe(true)
  })

  it('returns false when showDirectoryPicker is set to a non-function', () => {
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = 'not-a-function'
    expect(isLocalSaveSupported()).toBe(false)
  })
})

// ─── acquireReportsDirectory ───────────────────────────────────────────────────

describe('acquireReportsDirectory()', () => {
  beforeEach(() => {
    clearCachedHandle()
  })

  afterEach(() => {
    clearCachedHandle()
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('calls showDirectoryPicker on first invocation', async () => {
    const fakeHandle = makeFakeHandle()
    const pickerSpy = vi.fn().mockResolvedValue(fakeHandle)
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = pickerSpy

    const result = await acquireReportsDirectory()

    expect(pickerSpy).toHaveBeenCalledOnce()
    expect(result).toBe(fakeHandle)
  })

  it('returns the cached handle on the second call without showing the picker again', async () => {
    const fakeHandle = makeFakeHandle()
    const pickerSpy = vi.fn().mockResolvedValue(fakeHandle)
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = pickerSpy

    const first = await acquireReportsDirectory()
    const second = await acquireReportsDirectory()

    expect(pickerSpy).toHaveBeenCalledOnce() // still just once
    expect(first).toBe(fakeHandle)
    expect(second).toBe(fakeHandle)
    expect(first).toBe(second)
  })

  it('re-throws AbortError when the tester cancels the picker', async () => {
    const abortError = Object.assign(new Error('User cancelled'), { name: 'AbortError' })
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(abortError)

    await expect(acquireReportsDirectory()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('re-throws SecurityError (insecure context)', async () => {
    const secError = Object.assign(new Error('Not secure'), { name: 'SecurityError' })
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(secError)

    await expect(acquireReportsDirectory()).rejects.toMatchObject({ name: 'SecurityError' })
  })

  it('throws when showDirectoryPicker is unavailable', async () => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker

    await expect(acquireReportsDirectory()).rejects.toThrow(
      'showDirectoryPicker is not available',
    )
  })
})

// ─── clearCachedHandle ─────────────────────────────────────────────────────────

describe('clearCachedHandle()', () => {
  afterEach(() => {
    clearCachedHandle()
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('forces the picker to open again after clearing', async () => {
    const fakeHandle = makeFakeHandle()
    const pickerSpy = vi.fn().mockResolvedValue(fakeHandle)
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = pickerSpy

    await acquireReportsDirectory()
    clearCachedHandle()
    await acquireReportsDirectory()

    expect(pickerSpy).toHaveBeenCalledTimes(2)
  })
})

// ─── saveToDirectory ───────────────────────────────────────────────────────────

describe('saveToDirectory()', () => {
  it('creates a file handle, opens a writable, writes content, and closes', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    const closeSpy = vi.fn().mockResolvedValue(undefined)
    const writable = { write: writeSpy, close: closeSpy }
    const createWritableSpy = vi.fn().mockResolvedValue(writable)
    const fileHandle = { createWritable: createWritableSpy }
    const getFileHandleSpy = vi.fn().mockResolvedValue(fileHandle)
    const handle = { getFileHandle: getFileHandleSpy } as unknown as FileSystemDirectoryHandle

    await saveToDirectory(handle, 'qa-2026-05-05T10-00-00-test.md', '# Issue')

    expect(getFileHandleSpy).toHaveBeenCalledWith('qa-2026-05-05T10-00-00-test.md', {
      create: true,
    })
    expect(createWritableSpy).toHaveBeenCalledOnce()
    expect(writeSpy).toHaveBeenCalledWith('# Issue')
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})

// ─── saveBinaryToDirectory ─────────────────────────────────────────────────────

describe('saveBinaryToDirectory()', () => {
  it('creates a file handle, opens a writable, writes binary data, and closes', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    const closeSpy = vi.fn().mockResolvedValue(undefined)
    const writable = { write: writeSpy, close: closeSpy }
    const createWritableSpy = vi.fn().mockResolvedValue(writable)
    const fileHandle = { createWritable: createWritableSpy }
    const getFileHandleSpy = vi.fn().mockResolvedValue(fileHandle)
    const handle = { getFileHandle: getFileHandleSpy } as unknown as FileSystemDirectoryHandle

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes
    await saveBinaryToDirectory(handle, 'screenshot.png', pngBytes)

    expect(getFileHandleSpy).toHaveBeenCalledWith('screenshot.png', { create: true })
    expect(writeSpy).toHaveBeenCalledWith(pngBytes)
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
