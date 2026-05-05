/**
 * Client-side viewport screenshot for the QA feedback flow.
 *
 * `html-to-image` is loaded via dynamic import so the bundle cost only
 * lands when QA mode is active (DECISIONS §5). Tests mock the dynamic
 * import to avoid pulling a real rasteriser into jsdom.
 *
 * Acceptance criterion (issue 02): "A client-side screenshot is captured
 * during the feedback flow and shown in the review preview."
 */

import { withSensitiveRedaction } from './redact'

export interface CapturedScreenshot {
  /** PNG blob suitable for download or object-URL preview. */
  blob: Blob
  /** Data URL for inline rendering inside the preview. */
  dataUrl: string
  /** Captured pixel dimensions (CSS pixels × devicePixelRatio is honoured). */
  width: number
  height: number
}

/**
 * Capture the current viewport as a PNG. Returns null when capture is not
 * possible in the current environment (jsdom, missing DOM globals).
 *
 * The function:
 *   1. Applies the sensitive-field mask (`data-qa-sensitive="true"`).
 *   2. Calls `html-to-image#toPng` against `document.documentElement`.
 *   3. Restores the original styles.
 *
 * The screenshot is reviewed before export — the tester can drop it from
 * the preview if they don't want to attach it.
 */
export async function captureViewportScreenshot(): Promise<CapturedScreenshot | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null

  const target = document.documentElement

  try {
    const { result } = await withSensitiveRedaction(document, async () => {
      // Dynamic import keeps the rasteriser out of the cold-start bundle.
      const htmlToImage = await import('html-to-image')
      const dataUrl = await htmlToImage.toPng(target, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 1,
        width: window.innerWidth,
        height: window.innerHeight,
        style: {
          // Snap to the viewport so a long page doesn't render its full height.
          transform: `translate(-${window.scrollX}px, -${window.scrollY}px)`,
        },
      })
      return dataUrl
    })
    const blob = dataUrlToBlob(result)
    return {
      blob,
      dataUrl: result,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  } catch {
    // Capture failures are non-fatal — the tester can still export the
    // markdown ticket without a screenshot. The redaction handle is restored
    // by `withSensitiveRedaction`'s finally even when capture rejects.
    return null
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!match) {
    return new Blob([dataUrl], { type: 'text/plain' })
  }
  const [, mime, base64] = match
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
