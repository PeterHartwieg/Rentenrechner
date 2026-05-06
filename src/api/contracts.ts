/**
 * Public DTO types for the API facade.
 *
 * All responses are wrapped in ApiResult<T> — a discriminated union on `ok`.
 * This envelope keeps downstream consumers (CLI, future HTTP layer, SDK)
 * consistent regardless of transport.
 */

export const API_VERSION = 'v1' as const
export type ApiVersion = typeof API_VERSION

export interface ApiMeta {
  apiVersion: ApiVersion
  ruleYear: number
}

export interface ApiDiagnostic {
  path: string
  code: string
  severity: 'error' | 'warning'
  message: string
}

export interface ApiSuccess<T> {
  ok: true
  meta: ApiMeta
  data: T
  warnings: ApiDiagnostic[]
}

export interface ApiError {
  ok: false
  meta: ApiMeta | null
  errors: ApiDiagnostic[]
  warnings: ApiDiagnostic[]
}

export type ApiResult<T> = ApiSuccess<T> | ApiError

export function success<T>(
  data: T,
  meta: ApiMeta,
  warnings: ApiDiagnostic[] = [],
): ApiSuccess<T> {
  return { ok: true, meta, data, warnings }
}

export function error(
  errors: ApiDiagnostic[],
  meta: ApiMeta | null = null,
  warnings: ApiDiagnostic[] = [],
): ApiError {
  return { ok: false, meta, errors, warnings }
}

// ---------------------------------------------------------------------------
// Safety helpers — shared across all API facades
// ---------------------------------------------------------------------------

/**
 * Wrap an engine call — returns ApiError instead of throwing.
 * This is the outermost safety net so callers always get a structured response.
 */
export function safeEngineCall<T>(
  fn: () => T,
  meta: ApiMeta | null,
): { ok: true; value: T } | ApiError {
  try {
    const value = fn()
    return { ok: true, value }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return error(
      [{ path: '', code: 'ENGINE_ERROR', severity: 'error', message: `Engine error: ${msg}` }],
      meta,
    )
  }
}

/**
 * Recursively check if any numeric value in a flat/nested object is NaN.
 * Returns the first dotted path found, or null if clean.
 */
export function findNaN(obj: unknown, prefix = ''): string | null {
  if (obj === null || obj === undefined) return null
  if (typeof obj === 'number' && Number.isNaN(obj)) return prefix || '<root>'
  if (typeof obj !== 'object') return null
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const p = findNaN(obj[i], `${prefix}[${i}]`)
      if (p) return p
    }
    return null
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const p = findNaN(val, prefix ? `${prefix}.${key}` : key)
    if (p) return p
  }
  return null
}

/**
 * Assert that `value` is a non-null object and that every key in `numericFields`
 * maps to a finite number. Returns an ApiDiagnostic if any check fails.
 */
export function requireNumericFields(
  value: unknown,
  path: string,
  numericFields: readonly string[],
): ApiDiagnostic | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { path, code: 'INVALID_INPUT', severity: 'error', message: `${path} must be a non-null object.` }
  }
  const rec = value as Record<string, unknown>
  for (const field of numericFields) {
    const v = rec[field]
    if (typeof v !== 'number' || !isFinite(v)) {
      return {
        path: `${path}.${field}`,
        code: 'INVALID_INPUT',
        severity: 'error',
        message: `${path}.${field} must be a finite number.`,
      }
    }
  }
  return null
}

/**
 * Assert that `value` is a non-null object. Returns an ApiDiagnostic if not.
 */
export function requireObject(value: unknown, path: string): ApiDiagnostic | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { path, code: 'INVALID_INPUT', severity: 'error', message: `${path} must be a non-null object.` }
  }
  return null
}
