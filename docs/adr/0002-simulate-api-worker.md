# ADR-0002 — Simulate API Worker (Commercial-Licence HTTP Facade)

**Status:** Accepted  
**Date:** 2026-05-11  
**Deciders:** Peter Hartwieg

---

## Context

The `CLAUDE.md` backend boundary permits new Workers only for sanctioned triggers.
ADR-0001 covers the QA-submission Worker.  This ADR sanctions a second Worker:
an HTTP facade over `runComparison()` for commercial-licence holders (insurance
brokers, investment advisors, employers) who need to embed RentenWiki.de
calculations inside their own CRM or client portals.

Demand: commercial licensees (per `COMMERCIAL_LICENSE.md`) need programmatic
access to the retirement-comparison engine without depending on the public
React UI.  A shared-secret Worker is the minimal surface that satisfies this
need while keeping the calculator fully offline for non-commercial users.

---

## Decision

Add `workers/simulate/` — a Cloudflare Worker that exposes a single endpoint:

```
POST https://api.rentenwiki.de/simulate
```

### Auth

Every request must carry an `Authorization: Bearer <secret>` header.  The
secret is provisioned per commercial licence via `wrangler secret put
API_SHARED_SECRET` and rotated on licence change.

### CORS

A single allowed origin is configured via the `CRM_ALLOWED_ORIGIN` secret.
Preflight (`OPTIONS`) and cross-origin `POST` requests from any other origin
are rejected (`403`).  No `Access-Control-Allow-Origin` header is emitted for
disallowed origins.

### Payload

Request body is a `ComparisonRequest` JSON object (same shape as the public
TypeScript API in `src/api/comparison.ts`).  The Worker delegates entirely to
`runComparison()` — no engine logic lives in the Worker itself.

Response body is the `ApiResult<ComparisonResponse>` envelope returned by
`runComparison()`, plus an `X-Api-Version` response header (semver derived
from the internal `API_VERSION` constant).

### Data handling

- Input profiles and assumption objects are processed **ephemerally** —
  discarded after the response.
- No KV / R2 / D1 bindings; compute-only Worker.
- **EU residency:** the Worker must be deployed to Cloudflare's EU region
  (Regional Services policy or smart-placement) to satisfy GDPR requirements
  for commercial-licence holders operating in Germany/EEA.
- No PII is logged by the Worker; Cloudflare's built-in access logs (IP,
  timestamp) are governed by Cloudflare's EU DPA.

### Commercial-licence enforcement

Access is gated on the `API_SHARED_SECRET` Bearer token.  Tokens are issued
only to entities that have signed the commercial licence
(`COMMERCIAL_LICENSE.md`).  The indemnification clause in that licence covers
broker/advisor client-facing use.

---

## Consequences

- Adds a second sanctioned backend entry in `CLAUDE.md` / `AGENTS.md`.
- Does **not** affect the public calculator: all calculation logic remains in
  `src/api/` and is still fully offline for non-commercial users.
- Future multi-origin support (multiple licensees) requires a revisit of this
  ADR — `CRM_ALLOWED_ORIGIN` is intentionally single-valued today.
- Any new endpoint (e.g. `POST /portfolio`) requires a further ADR amendment.

---

## Alternatives considered

**Public endpoint without auth:** Rejected — would bypass the donation model
and expose the engine to bulk scraping without a commercial agreement.

**Separate npm package:** Considered but deferred; the Worker approach ships
faster and the TypeScript API (`src/api/`) is already stable.

**Multiple `CRM_ALLOWED_ORIGIN` values:** Deferred; today's single-licence
deployment model doesn't need it.
