/**
 * GitHub webhook helpers — Phase 4 of ADR-0001's QA-submission backend.
 *
 * The /cleanup endpoint receives `issues.closed` events from GitHub and
 * deletes the linked R2 screenshot. To do that safely (the endpoint is
 * public) we verify the HMAC-SHA256 signature on every request using the
 * same secret configured on GitHub's webhook page.
 *
 * No external dependencies — everything goes through the Worker runtime's
 * Web Crypto API.
 */

const SCREENSHOT_URL_PATTERN =
  /https:\/\/qa\.rentenwiki\.de\/screenshot\/([a-zA-Z0-9-]+\.(?:png|jpe?g))/g

/**
 * Verify the `X-Hub-Signature-256` header on a GitHub webhook request.
 *
 * GitHub sends `sha256=<hex>` where `<hex>` is the hex-encoded HMAC-SHA256
 * digest of the request body using the shared webhook secret.
 *
 * Returns `false` on any malformed input rather than throwing — we never
 * want a webhook with a bad signature to fault the Worker.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  headerSignature: string | null,
  secret: string,
): Promise<boolean> {
  if (!headerSignature || !headerSignature.startsWith("sha256=")) {
    return false;
  }
  const expectedHex = headerSignature.slice("sha256=".length).toLowerCase();
  if (expectedHex.length !== 64 || !/^[0-9a-f]+$/.test(expectedHex)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const expectedBytes = hexToBytes(expectedHex);
  const bodyBytes = new TextEncoder().encode(rawBody);
  return crypto.subtle.verify("HMAC", key, expectedBytes, bodyBytes);
}

/**
 * Pull every R2 screenshot key referenced from an issue body. The /submit
 * handler appends `![screenshot](https://qa.rentenwiki.de/screenshot/<uuid>.png)`
 * — this regex extracts the `<uuid>.png` portion. Returns an empty array if
 * the issue body has no screenshot link (issues without an attached image,
 * or issues filed via mailto / prefilled-URL paths that bypass the Worker).
 */
export function extractScreenshotKeys(issueBody: string | null): string[] {
  if (!issueBody) return [];
  const keys = new Set<string>();
  for (const match of issueBody.matchAll(SCREENSHOT_URL_PATTERN)) {
    if (match[1]) keys.add(match[1]);
  }
  return Array.from(keys);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
