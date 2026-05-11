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
    expect(response.headers.get('X-Api-Version')).toMatch(/^\d+\.\d+\.\d+$/)
    expect(await json(response)).toMatchObject({
      ok: true,
      data: {
        detailLevel: 'standard',
        effectiveMonthlyNettoBelastungEur: 250,
      },
    })
  })
})
