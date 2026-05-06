/**
 * Rule resolver — maps an optional requested year to the active GermanRules instance.
 *
 * Today only one rule year is compiled into the bundle (de2026). When de2027
 * ships, `supportedYears` expands and the resolver gains a second branch.
 */

import type { GermanRules } from '../domain'
import type { ApiResult } from './contracts'
import { API_VERSION, success, error } from './contracts'
import { activeRules } from '../rules'

export function resolveRuleYear(
  requestedYear?: number,
): ApiResult<{ rules: GermanRules; ruleYear: number }> {
  const meta = { apiVersion: API_VERSION, ruleYear: activeRules.year }

  if (requestedYear === undefined || requestedYear === activeRules.year) {
    return success({ rules: activeRules, ruleYear: activeRules.year }, meta)
  }

  return error(
    [
      {
        path: 'ruleYear',
        code: 'UNSUPPORTED_RULE_YEAR',
        severity: 'error',
        message: `Rule year ${requestedYear} is not supported. Supported: [${activeRules.year}].`,
      },
    ],
    meta,
  )
}
