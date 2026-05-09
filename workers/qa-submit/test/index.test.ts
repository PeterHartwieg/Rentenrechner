/**
 * Smoke tests for the qa-submit Worker — covers the four failure paths
 * required by gh#67:
 *   1. Request validation (missing / invalid fields)
 *   2. Turnstile failure
 *   3. Screenshot upload failure
 *   4. GitHub issue creation failure
 *
 * Tests run in a standard Node environment (vitest + node). The Cloudflare
 * runtime globals (R2Bucket, ExportedHandler) are type-only; at runtime we
 * supply plain object mocks that satisfy the same interface.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

// The worker's fetch signature accepts (request, env) — the ExecutionContext
// third argument is part of the ExportedHandler contract but unused in the
// current implementation. We cast here so the test helper compiles cleanly
// against the inferred 2-arg source type.
type FetchFn = (req: Request, env: MockEnv) => Promise<Response>;
const fetchWorker = worker.fetch as unknown as FetchFn;

// ---------------------------------------------------------------------------
// Minimal Env mock
// ---------------------------------------------------------------------------
function makeEnv(overrides: Partial<MockEnv> = {}): MockEnv {
  return {
    QA_SCREENSHOTS: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket,
    TURNSTILE_SITE_KEY: "test-site-key",
    TURNSTILE_SECRET: "test-secret",
    GH_PAT: "test-pat",
    GH_REPO: "owner/repo",
    GH_WEBHOOK_SECRET: "test-webhook-secret",
    ALLOWED_ORIGINS: "https://rentenwiki.de",
    ...overrides,
  };
}

interface MockEnv {
  QA_SCREENSHOTS: R2Bucket;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  GH_PAT: string;
  GH_REPO: string;
  GH_WEBHOOK_SECRET: string;
  ALLOWED_ORIGINS: string;
}

// Helper to build a valid POST /submit request
function makeSubmitRequest(
  payload: Record<string, unknown>,
  origin = "https://rentenwiki.de",
): Request {
  return new Request("https://qa.rentenwiki.de/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(payload),
  });
}

// Valid minimal payload (before we inject failures)
const VALID_PAYLOAD = {
  title: "Bug report title",
  body: "Some description of the issue.",
  turnstileToken: "valid-token",
};

// Mock fetch globally so we can control Turnstile + GitHub responses
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Request validation — missing / invalid fields
// ---------------------------------------------------------------------------
describe("request validation", () => {
  it("returns 403 for disallowed origin", async () => {
    const req = makeSubmitRequest(VALID_PAYLOAD, "https://evil.example.com");
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("origin_not_allowed");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("https://qa.rentenwiki.de/submit", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://rentenwiki.de" },
      body: "hello",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unsupported_media_type");
  });

  it("returns 400 for missing title", async () => {
    const req = makeSubmitRequest({ body: "desc", turnstileToken: "tok" });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_title");
  });

  it("returns 400 for empty title", async () => {
    const req = makeSubmitRequest({ title: "", body: "desc", turnstileToken: "tok" });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_title");
  });

  it("returns 400 for title exceeding max length", async () => {
    const req = makeSubmitRequest({
      title: "x".repeat(251),
      body: "desc",
      turnstileToken: "tok",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_title");
  });

  it("returns 400 for missing body", async () => {
    const req = makeSubmitRequest({ title: "Title", turnstileToken: "tok" });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 for missing turnstileToken", async () => {
    const req = makeSubmitRequest({ title: "Title", body: "desc" });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("missing_turnstile");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://qa.rentenwiki.de/submit", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://rentenwiki.de" },
      body: "not-json{",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_json");
  });
});

// ---------------------------------------------------------------------------
// 2. Turnstile failure
// ---------------------------------------------------------------------------
describe("Turnstile failure", () => {
  it("returns 403 when Turnstile verification fails (success: false)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );

    const req = makeSubmitRequest(VALID_PAYLOAD);
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("turnstile_failed");
  });

  it("returns 403 when Turnstile API returns HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(new Response("server error", { status: 500 }));

    const req = makeSubmitRequest(VALID_PAYLOAD);
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("turnstile_failed");
  });
});

// ---------------------------------------------------------------------------
// 3. Screenshot upload failure
// ---------------------------------------------------------------------------
describe("screenshot upload failure", () => {
  it("returns 400 for invalid base64 screenshot data", async () => {
    // Turnstile passes
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const req = makeSubmitRequest({
      ...VALID_PAYLOAD,
      screenshotBase64: "!!!not-valid-base64!!!",
      screenshotContentType: "image/png",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_base64");
  });

  it("returns 400 for disallowed image content type", async () => {
    // Turnstile passes
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const req = makeSubmitRequest({
      ...VALID_PAYLOAD,
      screenshotBase64: btoa("fake image data"),
      screenshotContentType: "image/gif",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_image_type");
  });

  it("returns 413 when screenshot exceeds size limit", async () => {
    // Turnstile passes
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    // 9 MB — exceeds SCREENSHOT_MAX_BYTES (8 MB)
    const bigData = "A".repeat(9 * 1024 * 1024);
    const req = makeSubmitRequest({
      ...VALID_PAYLOAD,
      screenshotBase64: btoa(bigData),
      screenshotContentType: "image/png",
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("screenshot_too_large");
  });
});

// ---------------------------------------------------------------------------
// 4. GitHub issue creation failure
// ---------------------------------------------------------------------------
describe("GitHub issue creation failure", () => {
  it("returns 502 when GitHub API returns non-OK response", async () => {
    // Turnstile passes, then GitHub fails
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
      );

    const req = makeSubmitRequest(VALID_PAYLOAD);
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("github_failed");
  });

  it("cleans up uploaded screenshot when GitHub issue creation fails", async () => {
    const env = makeEnv();
    const putMock = env.QA_SCREENSHOTS.put as ReturnType<typeof vi.fn>;
    const deleteMock = env.QA_SCREENSHOTS.delete as ReturnType<typeof vi.fn>;

    // Turnstile passes, GitHub fails
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unprocessable Entity" }), { status: 422 }),
      );

    const req = makeSubmitRequest({
      ...VALID_PAYLOAD,
      screenshotBase64: btoa("fake png bytes"),
      screenshotContentType: "image/png",
    });

    const res = await fetchWorker(req, env);
    expect(res.status).toBe(502);

    // The screenshot was uploaded (put called once)
    expect(putMock).toHaveBeenCalledTimes(1);
    // And then deleted as rollback
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path — success
// ---------------------------------------------------------------------------
describe("successful submission", () => {
  it("returns 201 with issueUrl and issueNumber on success", async () => {
    // Turnstile passes, GitHub returns created issue
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 42,
            html_url: "https://github.com/owner/repo/issues/42",
          }),
          { status: 201 },
        ),
      );

    const req = makeSubmitRequest(VALID_PAYLOAD);
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; issueNumber: number; issueUrl: string };
    expect(body.ok).toBe(true);
    expect(body.issueNumber).toBe(42);
    expect(body.issueUrl).toBe("https://github.com/owner/repo/issues/42");
  });
});

// ---------------------------------------------------------------------------
// Misc route smoke tests
// ---------------------------------------------------------------------------
describe("other routes", () => {
  it("GET /health returns 200 ok", async () => {
    const req = new Request("https://qa.rentenwiki.de/health");
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("unknown route returns 404", async () => {
    const req = new Request("https://qa.rentenwiki.de/unknown");
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it("non-POST /submit returns 405", async () => {
    const req = new Request("https://qa.rentenwiki.de/submit", {
      method: "PUT",
      headers: { origin: "https://rentenwiki.de" },
    });
    const res = await fetchWorker(req, makeEnv());
    expect(res.status).toBe(405);
  });
});
