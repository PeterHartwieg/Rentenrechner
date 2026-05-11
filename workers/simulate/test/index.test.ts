import { describe, expect, it } from 'vitest'

import worker from '../src/index'

interface Env {
  API_SHARED_SECRET: string
  CRM_ALLOWED_ORIGIN: string
}

const env: Env = {
  API_SHARED_SECRET: 'test-secret',
  CRM_ALLOWED_ORIGIN: 'https://crm.example.test',
}

function simulateRequest(init: RequestInit & { origin?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.origin) headers.set('Origin', init.origin)

  return new Request('https://api.rentenwiki.de/simulate', {
    ...init,
    headers,
  })
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

describe('simulate Worker HTTP API', () => {
  it('returns 503 when the API secret is not configured (fail closed on misconfigured deploy)', async () => {
    const unconfiguredEnv = { API_SHARED_SECRET: '', CRM_ALLOWED_ORIGIN: env.CRM_ALLOWED_ORIGIN }
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: {
          Authorization: 'Bearer ',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      unconfiguredEnv,
    )

    expect(response.status).toBe(503)
    expect(await json(response)).toMatchObject({ ok: false })
  })

  it('rejects requests without the shared-secret bearer token', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
    )

    expect(response.status).toBe(401)
    expect(await json(response)).toMatchObject({ ok: false })
  })

  it('returns CORS headers on 401 so browsers from the allowed origin can read the error body', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.CRM_ALLOWED_ORIGIN)
  })

  it('rejects disallowed CORS origins', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: 'https://elsewhere.example.test',
        headers: {
          Authorization: `Bearer ${env.API_SHARED_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      env,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('handles allowed CORS preflight without running simulation', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'OPTIONS',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: { 'Access-Control-Request-Method': 'POST' },
      }),
      env,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.CRM_ALLOWED_ORIGIN)
  })

  it('rejects non-POST methods after CORS handling', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'GET',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: { Authorization: `Bearer ${env.API_SHARED_SECRET}` },
      }),
      env,
    )

    expect(response.status).toBe(405)
    expect(await json(response)).toMatchObject({ ok: false })
  })

  it('rejects invalid JSON with the API error envelope', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: {
          Authorization: `Bearer ${env.API_SHARED_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
      env,
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toMatchObject({ ok: false })
  })

  it('allows server-to-server requests with valid auth and no Origin header', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.API_SHARED_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ monthlyNettoBelastungEur: 200 }),
      }),
      env,
    )

    expect(response.status).toBe(200)
    // No Origin → no CORS headers needed
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    // X-Api-Version must be present even without an Origin header (server-to-server callers need it)
    expect(response.headers.get('X-Api-Version')).toBe('v1')
    expect(await json(response)).toMatchObject({ ok: true })
  })

  it('rejects server-to-server requests with missing auth and no Origin header', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
    )

    expect(response.status).toBe(401)
    expect(await json(response)).toMatchObject({ ok: false })
  })

  it('returns a structured 500 envelope for malformed JSON shapes that crash the engine', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: {
          Authorization: `Bearer ${env.API_SHARED_SECRET}`,
          'Content-Type': 'application/json',
        },
        // null profile triggers a runtime throw inside runComparison
        body: JSON.stringify({ profile: null, assumptions: null }),
      }),
      env,
    )

    // Must be a structured error envelope, not an unhandled 500 crash
    const body = await json(response)
    expect(body).toMatchObject({ ok: false })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.CRM_ALLOWED_ORIGIN)
  })

  it('returns runComparison data and the manifest API version for authenticated calls', async () => {
    const response = await worker.fetch(
      simulateRequest({
        method: 'POST',
        origin: env.CRM_ALLOWED_ORIGIN,
        headers: {
          Authorization: `Bearer ${env.API_SHARED_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: {},
          assumptions: {},
          monthlyNettoBelastungEur: 250,
          detailLevel: 'standard',
          includeMonteCarlo: false,
        }),
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.CRM_ALLOWED_ORIGIN)
    // X-Api-Version must match the manifest apiVersion exactly (e.g. 'v1')
    expect(response.headers.get('X-Api-Version')).toBe('v1')
    expect(await json(response)).toMatchObject({
      ok: true,
      data: {
        detailLevel: 'standard',
        effectiveMonthlyNettoBelastungEur: 250,
      },
    })
  })
})
