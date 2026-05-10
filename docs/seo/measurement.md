# Measurement setup (owner-side, HTTP-level only)

This document captures how to wire up search-engine measurement for **rentenwiki.de** without adding any frontend analytics, cookies, or telemetry. Everything described here happens on the **owner side** (search-console accounts, IndexNow pings) and operates purely at the HTTP layer — there is no JavaScript tag, no cookie, and no PII collection involved.

> **Privacy posture is non-negotiable.** See the dedicated [Privacy / analytics posture](#privacy--analytics-posture) section below before adding anything to this doc. Any future frontend analytics is a separate decision that requires GDPR review and consent UX — it is **not** in scope here.

---

## Google Search Console (GSC)

### Verification

GSC needs proof you control the domain. Pick one:

1. **DNS TXT record (preferred for `rentenwiki.de`)**
   - In GSC, choose property type **Domain** (covers all subdomains and `http`/`https`).
   - GSC issues a verification token of the form `google-site-verification=<token>`.
   - Add a `TXT` record at the apex (`rentenwiki.de`) with that exact value at the DNS provider.
   - Click **Verify** in GSC. Propagation is usually a few minutes; can take up to 24 hours.

2. **HTML file (URL-prefix property fallback)**
   - GSC issues a file named `google<code>.html`.
   - Drop the file at `public/google<code>.html` in this repo. Vite copies everything in `public/` verbatim into the build output, so after the next deploy it will be served at `https://rentenwiki.de/google<code>.html`.
   - Click **Verify** in GSC.
   - Note: this verifies a **URL-prefix** property only (i.e. `https://rentenwiki.de/`), not all subdomains. The DNS approach is preferred for completeness.

### Sitemap submission

After verification:

1. In GSC → **Sitemaps**, submit:
   ```
   https://rentenwiki.de/sitemap.xml
   ```
2. The sitemap is generated from the public route registry at build time (see `src/seo/publicRouteRegistry.ts`) and published as `dist/sitemap.xml` by the build pipeline, which Cloudflare Workers then serves at `/sitemap.xml`.
3. GSC re-fetches the sitemap on its own schedule. Re-submit manually after a deploy that adds or renames URLs to speed up discovery.

### URL inspection workflow

Use **URL Inspection** to verify that prerendered topic pages are indexable and rendered correctly:

1. Paste the full URL (e.g. `https://rentenwiki.de/rentenluecke-rechner`) into the search box at the top of GSC.
2. Confirm:
   - **URL is on Google** (or **URL is not on Google** + the reason).
   - **Coverage** → no `noindex` directive, canonical points where expected.
   - **Enhancements** → structured data parses without errors (the topic pages emit JSON-LD blocks; warnings here usually mean a schema field is missing).
3. Click **Test live URL** → **View tested page** → **Screenshot / HTML** to confirm the prerendered HTML contains the actual content (not the React shell). This is the canonical check that prerendering is doing its job.
4. **Request indexing** after major content changes to a topic page. Use sparingly — Google rate-limits this and it has no effect on broad ranking.

---

## Bing Webmaster Tools (BWT)

### Verification

Three options; pick whichever is operationally easiest:

- **DNS CNAME / TXT record** — Bing supplies a value, add it to DNS at the apex.
- **XML file** — drop a `BingSiteAuth.xml` at `public/BingSiteAuth.xml`, deploys to `https://rentenwiki.de/BingSiteAuth.xml`.
- **Import from GSC** — once GSC verification is live, BWT can import the property in one click. This is the path of least resistance.

### Sitemap submission

After verification, submit the same sitemap URL:

```
https://rentenwiki.de/sitemap.xml
```

BWT typically picks up changes faster than GSC.

### AI Performance report

BWT exposes a dedicated **AI Performance** report (under the Performance section). It surfaces impression and click data for AI-generated answers (Bing Chat / Copilot) that **cite** rentenwiki.de as a source. No additional setup is required beyond the standard BWT verification — once the sitemap is being crawled, citations show up here automatically.

This is currently the cleanest first-party signal for "is this site being cited by AI assistants?" — Google does **not** offer an equivalent (see [AI overview / GEO note](#ai-overview--geo-note) below).

---

## IndexNow

IndexNow is a shared protocol (Bing, Yandex, others) for proactively notifying search engines when URLs change, instead of waiting for the next crawl. We use it as a **manual post-deploy step** for now — there is no CI integration yet.

### One-time setup

1. Generate a key. Any URL-safe random string of 8-128 hex characters works (e.g. `openssl rand -hex 32`).
2. Register the key with Bing via BWT → IndexNow, or implicitly by hosting the verification file (next step) and submitting any URL.
3. Save the key verification file at `public/<key>.json`. Its content must be a JSON document containing exactly the key string, e.g.:
   ```json
   "abcdef0123456789..."
   ```
   After deploy it is served at `https://rentenwiki.de/<key>.json`. IndexNow fetches this to confirm key ownership.
4. Store the key itself in a private password manager / secret store. It is not strictly secret (anyone who fetches `<key>.json` can read it), but rotating it requires re-registering, so don't lose it.

### Per-deploy ping (manual)

After each deploy that changes URLs, POST the updated set to IndexNow. Endpoint:

```
https://api.indexnow.org/IndexNow
```

Payload:

```json
{
  "host": "rentenwiki.de",
  "key": "<your-key>",
  "keyLocation": "https://rentenwiki.de/<your-key>.json",
  "urlList": [
    "https://rentenwiki.de/",
    "https://rentenwiki.de/rentenluecke-rechner",
    "https://rentenwiki.de/etf-vs-bav",
    "https://rentenwiki.de/sitemap.xml"
  ]
}
```

Submit via `curl`:

```bash
curl -X POST https://api.indexnow.org/IndexNow \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @indexnow-payload.json
```

A `200 OK` or `202 Accepted` means the request was accepted. Other codes (`400`, `403`, `422`) usually indicate a key or host mismatch — re-check `keyLocation` and that `<key>.json` is reachable.

Limits worth knowing:

- Up to **10 000 URLs per request**. For our scale (a handful of topic pages plus the sitemap), one request per deploy is enough.
- Don't ping the same URL more than once per few minutes; IndexNow may throttle.
- Only ping URLs you actually changed in this deploy. Pinging everything every time wastes the partner's crawl budget and provides no value.

### When to consider CI integration

Out of scope for this iteration. If/when we automate this, the natural place is a post-deploy hook in the Cloudflare Workers workflow that diffs the published route registry against the previous deploy and POSTs only the changed URLs. Until then: do it by hand, document each ping date in the deploy notes if needed.

---

## Privacy / analytics posture

Explicit policy for this site, restated to keep the boundary visible:

- **No frontend analytics.** No Google Analytics, Plausible, Matomo, Fathom, or any other JS tag.
- **No cookies.** The app uses `localStorage` and `sessionStorage` for user-entered scenarios and the disclaimer-banner collapse state. No cookies are set, ever.
- **No telemetry.** No error-tracking SDK (Sentry, etc.), no ping-on-load, no beacon endpoints.
- **No accounts, no logins, no PII collection.**
- **No hidden tracking.** No fingerprinting, no third-party iframes that phone home, no pixel beacons.

GSC and BWT operate on the **owner side**: they read from search-engine logs that already exist server-to-search-engine, plus one-time verification and sitemap pings from this site. Nothing in those flows touches a visitor's browser beyond the standard HTTP request that any search-engine crawler would already make.

This is consistent with the project-wide "No PII collection without a backend story" guardrail in `CLAUDE.md` (Critical guardrails §3). Any **future** frontend analytics — even privacy-preserving / first-party / cookieless — is a separate product decision that requires:

1. A documented GDPR lawful basis (likely consent).
2. A consent UX (banner with affirmative opt-in, real "reject" path).
3. Region/retention/processor review.
4. An explicit backlog item — not a casual addition.

Nothing in this measurement doc relaxes that boundary.

---

## AI overview / GEO note

A practical caveat for anyone reading the data:

- **Google does NOT provide a clean "AI Overview" filter in Search Console.** Traffic from queries where Google's AI Overview / SGE feature appeared is **mixed into the regular Search → Performance → Web report**. There is no checkbox or segment to isolate it. You can sometimes infer AI-Overview-driven traffic from query patterns (long natural-language questions, high impressions / low CTR), but it is not a first-class metric inside GSC today.
- **Bing does provide AI-citation data** via the BWT **AI Performance** report described above. This is the cleanest first-party signal we currently have for AI-generated-answer citations.

For active prompt-level checks on whether AI assistants cite the site correctly and respect the not-advice framing, use the manual prompt-lab workflow documented in [`ai-prompt-lab.md`](./ai-prompt-lab.md).
