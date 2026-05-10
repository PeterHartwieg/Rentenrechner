/**
 * Tests for composeInstanceEvidenceMaps (issue #111).
 *
 * Pins the wiring contract between the workspace shape and the
 * `instanceEvidenceMaps` prop consumed by `CombineIncomePanel`. Without this
 * lookup the panel falls back to `inputConfidence`, which treats absent
 * fields as `model_estimate` and produces false-positive estimate badges.
 */

import { describe, it, expect } from 'vitest'
import type { Workspace } from '../domain/workspace'
import type { EvidenceState } from '../domain/instances'
import { defaultWorkspace } from '../storage'
import { composeInstanceEvidenceMaps } from './composeInstanceEvidenceMaps'

function withInstance<K extends keyof Workspace['baseline']['assumptions']>(
  key: K,
  inst: Workspace['baseline']['assumptions'][K] extends Array<infer T> ? T : never,
): Workspace {
  const ws = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  ;(ws.baseline.assumptions[key] as unknown as unknown[]) = [inst]
  return ws
}

describe('composeInstanceEvidenceMaps', () => {
  it('returns an empty map when the workspace has no instances', () => {
    expect(composeInstanceEvidenceMaps(defaultWorkspace)).toEqual({})
  })

  it('keys by instanceId across all six product arrays', () => {
    const ws = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    const a = ws.baseline.assumptions
    a.bav = [
      {
        instanceId: 'bav-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: { monthlyGrossConversion: 'user_confirmed' as EvidenceState },
      } as unknown as (typeof a.bav)[number],
    ]
    a.etf = [
      {
        instanceId: 'etf-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: { monthlyContribution: 'model_estimate' as EvidenceState },
      } as unknown as (typeof a.etf)[number],
    ]
    a.insurance = [
      {
        instanceId: 'ins-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: {} as Record<string, EvidenceState>,
      } as unknown as (typeof a.insurance)[number],
    ]
    a.basisrente = [
      {
        instanceId: 'bas-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: {} as Record<string, EvidenceState>,
      } as unknown as (typeof a.basisrente)[number],
    ]
    a.altersvorsorgedepot = [
      {
        instanceId: 'avd-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: {} as Record<string, EvidenceState>,
      } as unknown as (typeof a.altersvorsorgedepot)[number],
    ]
    a.riester = [
      {
        instanceId: 'rie-1',
        label: '',
        status: 'active',
        contractStartYear: 2026,
        evidenceMap: {} as Record<string, EvidenceState>,
      } as unknown as (typeof a.riester)[number],
    ]

    const result = composeInstanceEvidenceMaps(ws)
    expect(Object.keys(result).sort()).toEqual([
      'avd-1',
      'bas-1',
      'bav-1',
      'etf-1',
      'ins-1',
      'rie-1',
    ])
    expect(result['bav-1']).toEqual({ monthlyGrossConversion: 'user_confirmed' })
    expect(result['etf-1']).toEqual({ monthlyContribution: 'model_estimate' })
    expect(result['ins-1']).toEqual({})
  })

  it('[#111] preserves an empty evidenceMap (the false-positive trigger)', () => {
    // Instances created via the wizard with all-zero / "übernommen" inputs end up
    // with an empty evidenceMap. The panel's badge predicate must see this empty
    // map so it can suppress the "Teilweise geschätzt" badge — without the wiring
    // it falls back to inputConfidence, which lowestConfidence reports as
    // model_estimate for any absent field, producing the bug from #111.
    const ws = withInstance('etf', {
      instanceId: 'etf-empty',
      label: '',
      status: 'active',
      contractStartYear: 2026,
      evidenceMap: {} as Record<string, EvidenceState>,
    } as unknown as Workspace['baseline']['assumptions']['etf'][number])

    const result = composeInstanceEvidenceMaps(ws)
    expect(result['etf-empty']).toEqual({})
  })
})
