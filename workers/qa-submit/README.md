# qa-submit Worker

Cloudflare Worker that receives QA submissions from the rentenwiki.de composer
and creates GitHub issues with screenshots stored in R2. Sanctioned by
[ADR-0001](../../docs/adr/0001-qa-submission-backend-amendment.md).

## Architecture

```
[composer at rentenwiki.de]
   |  POST /submit { title, body, screenshotBase64, turnstileToken }
   v
[qa.rentenwiki.de — this Worker]
   |  1. Origin check (ALLOWED_ORIGINS)
   |  2. Turnstile verify
   |  3. R2 upload screenshot → signed URL
   |  4. GitHub API create issue with body + image markdown
   v
[github.com/PeterHartwieg/Rentenrechner/issues]
```

Cleanup: `issues.closed` webhook → Worker `/cleanup` deletes the R2 object.
R2 lifecycle rule (90-day TTL) is the safety net.

## First-time deploy

Prereqs: Wrangler logged in, R2 enabled on the Cloudflare account, Turnstile
site keys, GitHub fine-grained PAT.

```sh
cd workers/qa-submit
npm install

# 1. Create R2 bucket (one-time, idempotent)
wrangler r2 bucket create rentenwiki-qa-screenshots

# 2. Deploy the Worker (creates qa.rentenwiki.de DNS automatically)
wrangler deploy

# 3. Set secrets (only works after the Worker exists from step 2)
wrangler secret put TURNSTILE_SECRET   # paste Turnstile secret key
wrangler secret put GH_PAT             # paste GitHub fine-grained PAT

# 4. Verify
curl https://qa.rentenwiki.de/health
# expected: ok
```

## Local dev

```sh
npm run dev
# wrangler dev serves on http://localhost:8787
# .dev.vars file (gitignored) holds local-only secrets:
#   TURNSTILE_SECRET=...
#   GH_PAT=...
```

## Endpoints

- `GET /health` — liveness check, returns `ok`.
- `POST /submit` — composer submission. Validates Origin + Turnstile, optionally
  uploads screenshot to R2, creates a GitHub issue with `needs-triage` label.
  Request: `{ title, body, screenshotBase64?, screenshotContentType?, turnstileToken }`.
  Response: `{ ok: true, issueUrl, issueNumber }` or `{ ok: false, error, message }`.
- `GET /screenshot/<uuid>.{png,jpg}` — serves a screenshot from the private R2
  bucket. GitHub uses this URL to render images in issue bodies.
- `POST /cleanup` — GitHub `issues.closed` webhook. Verifies HMAC-SHA256
  signature with `GH_WEBHOOK_SECRET`, extracts screenshot keys from the issue
  body, deletes the matching R2 objects. Acks `ping` events with 200.

## Webhook configuration (one-time)

After the first `wrangler deploy` succeeds:

1. Generate a webhook secret. Any cryptographically random hex string works:
   ```sh
   openssl rand -hex 32
   # or, with Node:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Save it as a Worker secret:
   ```sh
   wrangler secret put GH_WEBHOOK_SECRET
   # paste the hex string when prompted
   ```
3. Configure the webhook on the GitHub repo:
   - https://github.com/PeterHartwieg/Rentenrechner/settings/hooks → **Add webhook**
   - **Payload URL:** `https://qa.rentenwiki.de/cleanup`
   - **Content type:** `application/json`
   - **Secret:** paste the same hex string
   - **SSL verification:** Enable
   - **Which events?** *Let me select individual events* → check **Issues** only
   - **Active:** ticked
   - Click *Add webhook*. GitHub immediately sends a `ping` event — the
     **Recent Deliveries** tab should show a green check.
4. Sanity-check by closing any test issue. The webhook delivery should return
   `{ ok: true, deleted: <0 or 1> }` depending on whether the issue body had a
   screenshot link.

## Local dev secrets

Create `.dev.vars` (gitignored) for `wrangler dev`:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
GH_PAT=github_pat_local_dev_token_here
```

The Turnstile value above is Cloudflare's official "always passes" test secret —
useful for local dev so you don't burn real Turnstile attempts.
