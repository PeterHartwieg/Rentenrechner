import { createIssue } from "./github";
import { verifyTurnstile } from "./turnstile";
import type { ErrorResponse, SubmitRequest, SubmitResponse } from "./types";

export interface Env {
  QA_SCREENSHOTS: R2Bucket;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  GH_PAT: string;
  GH_REPO: string;
  ALLOWED_ORIGINS: string;
}

const TITLE_MAX = 250;
const BODY_MAX = 10_000;
const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const SCREENSHOT_KEY_PATTERN = /^[a-zA-Z0-9-]+\.(png|jpe?g)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (request.method === "GET" && url.pathname.startsWith("/screenshot/")) {
      return serveScreenshot(url.pathname, env);
    }

    if (url.pathname === "/submit") {
      if (request.method === "OPTIONS") {
        return handlePreflight(origin, env);
      }
      if (request.method === "POST") {
        return handleSubmit(request, origin, env);
      }
      return errorResponse(405, "method_not_allowed", "Methode nicht erlaubt.", origin);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function serveScreenshot(pathname: string, env: Env): Promise<Response> {
  const key = pathname.slice("/screenshot/".length);
  if (!SCREENSHOT_KEY_PATTERN.test(key)) {
    return new Response("not found", { status: 404 });
  }
  const obj = await env.QA_SCREENSHOTS.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}

function handlePreflight(origin: string | null, env: Env): Response {
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

async function handleSubmit(
  request: Request,
  origin: string | null,
  env: Env,
): Promise<Response> {
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
    return errorResponse(
      403,
      "origin_not_allowed",
      "Anfrage von dieser Domain ist nicht erlaubt.",
      origin,
    );
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") {
    return errorResponse(
      415,
      "unsupported_media_type",
      "Erwartetes Format: application/json.",
      origin,
    );
  }

  let payload: SubmitRequest;
  try {
    payload = (await request.json()) as SubmitRequest;
  } catch {
    return errorResponse(400, "invalid_json", "Anfrage konnte nicht gelesen werden.", origin);
  }

  if (
    typeof payload.title !== "string" ||
    payload.title.length === 0 ||
    payload.title.length > TITLE_MAX
  ) {
    return errorResponse(
      400,
      "invalid_title",
      `Titel fehlt oder ist zu lang (max ${TITLE_MAX} Zeichen).`,
      origin,
    );
  }

  if (
    typeof payload.body !== "string" ||
    payload.body.length === 0 ||
    payload.body.length > BODY_MAX
  ) {
    return errorResponse(
      400,
      "invalid_body",
      `Beschreibung fehlt oder ist zu lang (max ${BODY_MAX} Zeichen).`,
      origin,
    );
  }

  if (typeof payload.turnstileToken !== "string" || payload.turnstileToken.length === 0) {
    return errorResponse(400, "missing_turnstile", "Turnstile-Token fehlt.", origin);
  }

  const remoteIp = request.headers.get("cf-connecting-ip");
  const turnstileOk = await verifyTurnstile(
    payload.turnstileToken,
    env.TURNSTILE_SECRET,
    remoteIp,
  );
  if (!turnstileOk) {
    return errorResponse(
      403,
      "turnstile_failed",
      "Spam-Schutz-Prüfung fehlgeschlagen. Bitte erneut versuchen.",
      origin,
    );
  }

  let screenshotKey: string | null = null;
  if (payload.screenshotBase64) {
    const imgContentType = payload.screenshotContentType ?? "image/png";
    if (!ALLOWED_IMAGE_TYPES.has(imgContentType)) {
      return errorResponse(
        400,
        "invalid_image_type",
        "Nur PNG oder JPEG erlaubt.",
        origin,
      );
    }

    let bytes: Uint8Array;
    try {
      const binary = atob(payload.screenshotBase64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
    } catch {
      return errorResponse(
        400,
        "invalid_base64",
        "Screenshot-Daten konnten nicht gelesen werden.",
        origin,
      );
    }

    if (bytes.byteLength > SCREENSHOT_MAX_BYTES) {
      return errorResponse(
        413,
        "screenshot_too_large",
        `Screenshot zu groß (max ${SCREENSHOT_MAX_BYTES / 1024 / 1024} MB).`,
        origin,
      );
    }

    const ext = imgContentType === "image/png" ? "png" : "jpg";
    screenshotKey = `${crypto.randomUUID()}.${ext}`;
    await env.QA_SCREENSHOTS.put(screenshotKey, bytes, {
      httpMetadata: { contentType: imgContentType },
    });
  }

  let finalBody = payload.body;
  if (screenshotKey) {
    finalBody += `\n\n## Screenshot\n\n![screenshot](https://qa.rentenwiki.de/screenshot/${screenshotKey})`;
  }

  const issue = await createIssue(
    env.GH_PAT,
    env.GH_REPO,
    payload.title,
    finalBody,
    ["needs-triage"],
  );

  if (!issue) {
    if (screenshotKey) {
      await env.QA_SCREENSHOTS.delete(screenshotKey).catch(() => undefined);
    }
    return errorResponse(
      502,
      "github_failed",
      "Issue konnte nicht erstellt werden. Bitte später erneut versuchen.",
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    } satisfies SubmitResponse,
    { status: 201, headers: corsHeaders(origin) },
  );
}

function isOriginAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  return allowed
    .split(",")
    .map((s) => s.trim())
    .includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

function errorResponse(
  status: number,
  error: string,
  message: string,
  origin: string | null,
): Response {
  return jsonResponse(
    { ok: false, error, message } satisfies ErrorResponse,
    {
      status,
      headers: corsHeaders(origin),
    },
  );
}
