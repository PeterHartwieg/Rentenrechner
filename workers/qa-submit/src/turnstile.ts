const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Full Turnstile siteverify response shape.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/#fields-in-the-response
 */
interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  cdata?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
}

export interface TurnstileVerifyOptions {
  /**
   * Comma-separated list of allowed hostnames (e.g. "rentenwiki.de,www.rentenwiki.de").
   * Derived from the `TURNSTILE_ALLOWED_HOSTNAMES` env var so it stays configurable
   * without a code change — consistent with how `ALLOWED_ORIGINS` is structured.
   */
  allowedHostnames: string;
  /**
   * Optional: if the Turnstile widget is configured with an `action` string,
   * provide it here and any token with a different action will be rejected.
   * Leave empty/undefined to skip action validation.
   */
  expectedAction?: string;
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
  options: TurnstileVerifyOptions,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set("remoteip", remoteIp);

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) return { ok: false, error: "turnstile_api_error" };

  const data = (await response.json()) as TurnstileResponse;

  if (!data.success) {
    return { ok: false, error: "turnstile_failed" };
  }

  // Hostname validation — tokens minted for a different Cloudflare site are rejected.
  const allowed = options.allowedHostnames
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (allowed.length > 0 && data.hostname !== undefined) {
    if (!allowed.includes(data.hostname)) {
      return { ok: false, error: "turnstile_hostname_mismatch" };
    }
  } else if (allowed.length > 0 && data.hostname === undefined) {
    // Hostname is absent in the API response — treat as a mismatch so we
    // do not silently accept tokens whose origin cannot be verified.
    return { ok: false, error: "turnstile_hostname_missing" };
  }

  // Action validation — only applied when the caller has configured an expected action.
  if (options.expectedAction && options.expectedAction.length > 0) {
    if (data.action !== options.expectedAction) {
      return { ok: false, error: "turnstile_action_mismatch" };
    }
  }

  return { ok: true };
}
