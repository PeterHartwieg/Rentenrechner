/**
 * Report assembly + Markdown emitter for the scenario-report suite (issue #377).
 *
 * Pure functions — no filesystem access. The CLI scripts under `scripts/`
 * (`scenario-report.ts`, `scenario-update-baseline.ts`) write the artifacts.
 *
 * The report always carries the INTERNAL REGRESSION label, states exactly what
 * its anchors DO and DO NOT prove (only the named stages, never whole-engine
 * legal correctness), and distinguishes every failure class: stage drift,
 * external-anchor violation, replay drift, rules drift, missing provenance.
 */

import type {
  CaseMode,
  EngineIdentity,
  ScenarioReport,
  StageDiff,
  SuiteCase,
  SuiteRunResult,
} from './types'

export const PROVENANCE_NOTE =
  'Alle erwarteten Werte wurden EINMAL aus der unveränderten Engine der Basis-Revision ' +
  'erfasst (siehe provenance.json). Sie sind INTERNE REGRESSIONSANKER: Der Bericht zeigt, ' +
  'dass sich nichts unerwartet geändert hat — er ist kein Rechenschafts- oder ' +
  'Rechtsnachweis. Grenzen: Externe Anker (Provenienz "external-golden-anchored") belegen ' +
  'ausschließlich die namentlich genannten Stufen; NICHTS davon belegt die rechtliche ' +
  'Korrektheit der Engine als Ganzes, und Zwischenschritte, die das Suite nicht erfasst ' +
  '(siehe "Nicht erfasst" je Fall), sind nicht abgedeckt. Unabhängig geprüfte Konstanten ' +
  'liegen in src/test/externalGoldenFixtures.ts (siehe docs/validation.md).'

/** Identity of both engines (baseline capture vs this evaluation), sha-prefixes resolved. */
export interface ReportIdentity {
  baseline: EngineIdentity & { baseShaCapturedAt: string }
  evaluated: EngineIdentity
  baselineRulesSnapshotSha: string
  liveRulesSnapshotSha: string
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('de-DE')
  return value.toLocaleString('de-DE', { maximumFractionDigits: 6 })
}

function formatStageValue(value: number | boolean | null): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return formatNumber(value)
}

/**
 * German label for the diff kind. Without it, a removed (or added) nullable
 * stage would render as `— | —` — visually identical to a value change whose
 * sides happen to be null.
 */
function kindLabel(kind: StageDiff['kind']): string {
  switch (kind) {
    case 'value-changed':
      return 'geändert'
    case 'removed':
      return 'entfernt'
    case 'added':
      return 'neu'
  }
}

/** Assembles the JSON-serializable report from a suite run. */
export function assembleReport(
  result: SuiteRunResult,
  identity: ReportIdentity,
  generatedAt: string,
): ScenarioReport {
  const familyIds = new Set(result.cases.map((c) => c.familyId))
  return {
    label: 'INTERNAL REGRESSION',
    provenanceNote: PROVENANCE_NOTE,
    generatedAt,
    generatedFrom: {
      baseline: identity.baseline,
      evaluated: identity.evaluated,
      baselineRulesSnapshotSha: identity.baselineRulesSnapshotSha,
      liveRulesSnapshotSha: identity.liveRulesSnapshotSha,
      rulesSnapshotDrift: result.rulesSnapshotDrift,
      rulesProvenanceStatus: result.rulesProvenanceStatus,
    },
    summary: {
      totalCases: result.totalCases,
      failedCases: result.failedCases,
      totalStages: result.totalStages,
      families: familyIds.size,
    },
    cases: result.cases.map((c) => ({
      caseId: c.caseId,
      family: c.familyId,
      familyLabel: c.familyLabel,
      mode: c.mode,
      provenance: c.provenance,
      purpose: c.purpose,
      entryPoint: entryPointOf(c.mode),
      ok: c.ok,
      stageCount: c.stageCount,
      firstDivergence: c.firstDivergence,
      diffs: c.diffs,
      anchorFailures: c.anchorFailures,
      unsupported: c.unsupported,
      replayDrift: c.replayDrift,
    })),
  }
}

function entryPointOf(mode: CaseMode): SuiteCase['entryPoint'] {
  switch (mode) {
    case 'compare':
      return 'simulateRetirementComparison'
    case 'combine':
      return 'runCombineSimulation'
    case 'monte-carlo':
      return 'runMonteCarlo'
  }
}

function diffLine(diff: StageDiff): string {
  const delta =
    diff.delta === null
      ? 'n/a'
      : `${diff.delta >= 0 ? '+' : ''}${formatNumber(diff.delta)}`
  return (
    `| \`${diff.path}\` | ${kindLabel(diff.kind)} | ${formatStageValue(diff.expected)} | ` +
    `${formatStageValue(diff.actual)} | ${delta} | ${diff.tolerance} |`
  )
}

const DIFF_TABLE_HEADER = [
  '| Betroffene Stufe (Pfad) | Art | Erwartet (Basis-Revision) | Aktuell | Delta | Toleranz |',
  '|---|---|---:|---:|---:|---:|',
].join('\n')

function identityLine(engine: EngineIdentity & { baseShaCapturedAt?: string }): string {
  const suffix = engine.engineSourcesDirty
    ? ` — ⚠️ **DIRTY Berechnungsquellen:** ${engine.engineDirtyPaths.join(', ')}`
    : ' — Berechnungsquellen identisch mit dem Commit'
  return (
    `\`${engine.sha}\` · Engine-Digest \`${engine.engineSourcesDigestSha}\`` +
    (engine.baseShaCapturedAt ? ` (erfasst ${engine.baseShaCapturedAt})` : '') +
    suffix
  )
}

/**
 * Renders the human-readable Markdown report. Failing cases lead with their
 * FIRST divergent stage (pipeline order) and list every divergent path.
 */
export function toMarkdownReport(report: ScenarioReport, run: SuiteRunResult): string {
  const lines: string[] = []
  const g = report.generatedFrom

  lines.push('# Szenario-Report (Issue #377)')
  lines.push('')
  lines.push(`> **${report.label}** — ${report.provenanceNote}`)
  lines.push('')
  lines.push('## Provenienz')
  lines.push('')
  lines.push(`- Baseline (Erfassung): ${identityLine(g.baseline)}`)
  lines.push(`- Diese Auswertung:    ${identityLine(g.evaluated)}`)
  if (g.baseline.engineSourcesDigestSha !== g.evaluated.engineSourcesDigestSha) {
    lines.push(
      '- ⚠️ Engine-Digest der Auswertung weicht von der Baseline-Erfassung ab — die Deltas ' +
        'stammen aus einem anderen Rechenwerkstand als dem erfassten.',
    )
  }
  lines.push(
    `- Rules-Identität: Baseline \`${g.baselineRulesSnapshotSha}\` vs. Auswertung ` +
      `\`${g.liveRulesSnapshotSha}\` → **${g.rulesProvenanceStatus}**`,
  )
  if (g.rulesProvenanceStatus === 'drift') {
    lines.push(
      '  ⚠️ Die Regeln (`src/rules/`) haben sich seit der Erfassung geändert. Die ' +
        'Stufen-Deltas zeigen dann Regeländerung UND Modelländerung gemischt — erst die ' +
        'Regeln freigeben (siehe docs/scenario-reports.md), dann Baselines bewusst aktualisieren.',
    )
  } else if (g.rulesProvenanceStatus === 'missing') {
    lines.push(
      '  ⚠️ **Keine provenance.json**: die Baselines können keiner Engine-Revision und keinem ' +
        'Regelstand zugeordnet werden. Das ist KEIN sauberer Lauf.',
    )
  }
  lines.push(`- Erstellt: ${report.generatedAt}`)
  lines.push('')
  lines.push('## Zusammenfassung')
  lines.push('')
  lines.push(
    `- ${report.summary.totalCases} Fälle in ${report.summary.families} Familien · ` +
      `${report.summary.totalStages} Stufenwerte`,
  )
  const gateBroken = g.rulesProvenanceStatus !== 'match'
  if (report.summary.failedCases === 0 && !gateBroken) {
    lines.push('- ✅ **Alle Fälle reproduzieren die Baseline; Rules-Identität stimmt.**')
  } else {
    if (report.summary.failedCases > 0) {
      lines.push(`- ❌ **${report.summary.failedCases} Fall/Fälle weichen ab.**`)
    }
    if (gateBroken) {
      lines.push(
        `- ❌ **Gate verletzt (rules provenance: ${g.rulesProvenanceStatus})** — unabhängig von den Einzelfällen ist dieser Lauf nicht als Reproduktion gewertet.`,
      )
    }
  }
  lines.push('')

  const failing = report.cases.filter((c) => !c.ok)
  if (failing.length > 0) {
    lines.push('## Abweichungen (erste divergierende Stufe je Fall)')
    lines.push('')
    lines.push('| Fall | Erste divergierende Stufe | Erwartet | Aktuell | Delta |')
    lines.push('|---|---|---:|---:|---:|')
    for (const c of failing) {
      const first = c.firstDivergence ?? c.replayDrift
      lines.push(
        `| \`${c.caseId}\` | ${first ? `\`${first.path}\` (${kindLabel(first.kind)})` : '_ohne Stufen-Delta (Anker/Wiedergabe)_'} | ` +
          `${first ? formatStageValue(first.expected) : '—'} | ` +
          `${first ? formatStageValue(first.actual) : '—'} | ` +
          `${first?.delta !== null && first?.delta !== undefined ? formatNumber(first.delta) : 'n/a'} |`,
      )
    }
    lines.push('')
  }

  // Details grouped by family, in registry order.
  let currentFamily = ''
  for (let i = 0; i < report.cases.length; i++) {
    const c = report.cases[i]
    const runCase = run.cases[i]
    if (c.family !== currentFamily) {
      currentFamily = c.family
      lines.push(`## ${c.familyLabel}`)
      lines.push('')
    }
    const status = c.ok ? '✅' : '❌'
    lines.push(`### ${status} \`${c.caseId}\``)
    lines.push('')
    lines.push(c.purpose)
    lines.push('')
    lines.push(
      `- Modus: \`${c.mode}\` · Einstiegspunkt: \`${c.entryPoint}\` · ` +
        `Provenienz: \`${c.provenance}\` · Stufen: ${c.stageCount}`,
    )
    if (runCase?.replayDrift) {
      lines.push(
        `- ⚠️ Deterministische Wiedergabe weicht ab: \`${runCase.replayDrift.path}\` ` +
          `(${formatStageValue(runCase.replayDrift.expected)} → ${formatStageValue(runCase.replayDrift.actual)})`,
      )
    }
    for (const failure of c.anchorFailures) {
      lines.push(`- ⚠️ Externer Anker verletzt: ${failure}`)
    }
    for (const u of c.unsupported) {
      lines.push(`- _Nicht erfasst:_ \`${u.path}\` — ${u.reason}`)
    }
    if (c.diffs.length > 0) {
      lines.push('')
      lines.push(`**${c.diffs.length} abweichende Stufe(n)** — erste divergierende Stufe: ` +
        `\`${c.firstDivergence?.path ?? '?'}\``)
      lines.push('')
      lines.push(DIFF_TABLE_HEADER)
      for (const diff of c.diffs.slice(0, 40)) {
        lines.push(diffLine(diff))
      }
      if (c.diffs.length > 40) {
        lines.push(`| … ${c.diffs.length - 40} weitere | | | | | |`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
