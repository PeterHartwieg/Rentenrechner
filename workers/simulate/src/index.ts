import { runComparison } from '../../../src/api/comparison'
import { getManifest } from '../../../src/api/manifest'
import type { ComparisonRequest } from '../../../src/api/comparison'

export interface Env {
  API_SHARED_SECRET: string
  CRM_ALLOWED_ORIGIN: string
}

function jsonResponse(
  body: unknown,
  status: number,
  corsOrigin?: string | null,
): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin
    headers['Vary'] = 'Origin'
    headers['X-Api-Version'] = getManifest().data.apiVersion
  }
  return new Response(JSON.stringify(body), { status, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const isAllowedOrigin = origin === env.CRM_ALLOWED_ORIGIN
    // CORS headers are only added when Origin is present and matches the allowed origin.
    // Server-to-server callers (no Origin header) receive no CORS headers — this is correct.
    const corsOrigin = isAllowedOrigin ? origin : null

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin!,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      })
    }

    // Fail closed if the secret was never set — prevents auth bypass on misconfigured deploys.
    if (!env.API_SHARED_SECRET) {
      return jsonResponse({ ok: false, error: 'Service unavailable' }, 503)
    }

    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${env.API_SHARED_SECRET}`) {
      // Include CORS headers so browsers from the allowed origin can read the 401 body.
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, corsOrigin)
    }

    // Reject cross-origin browser requests from disallowed origins.
    // Server-to-server callers (no Origin header) are allowed through with auth only.
    if (origin !== null && !isAllowedOrigin) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, corsOrigin)
    }

    let body: ComparisonRequest
    try {
      body = (await request.json()) as ComparisonRequest
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, corsOrigin)
    }

    try {
      const result = runComparison(body)
      return jsonResponse(result, 200, corsOrigin)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ ok: false, error: `Engine error: ${msg}` }, 500, corsOrigin)
    }
  },
}
