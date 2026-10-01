// Review panel definitions and selection.
//
// Policy (issue #382): the routine panel is Grok 4.6 + Opus. The complex panel
// (Fable 5.1 + Astra + Grok 4.6) exists for rare, genuinely intricate changes
// and is ONLY reachable through the explicit --complex flag — never picked
// automatically by heuristics.
//
// The `model` field is the model we request on the command line. The parser
// separately checks the provider-reported model identity (see adapters.mjs);
// a reviewer that reports a different model fails closed.

export const PANEL_KINDS = ['routine', 'complex']

export const PANELS = {
  routine: [
    { reviewer: 'grok', model: 'grok-4.6', label: 'Grok 4.6' },
    { reviewer: 'claude', model: 'opus', label: 'Claude Opus (default alias)' },
  ],
  complex: [
    { reviewer: 'claude', model: 'claude-fable-5-1', label: 'Claude Fable 5.1 (exact id)' },
    { reviewer: 'codex', model: 'gpt-6-astra', label: 'Codex GPT-6-Astra' },
    { reviewer: 'grok', model: 'grok-4.6', label: 'Grok 4.6' },
  ],
}

// Selects a panel. `complex` must be an explicit caller decision — the planner
// refuses to guess. Returns panel entries plus a provenance note for receipts.
export function selectPanel({ complex = false } = {}) {
  const kind = complex ? 'complex' : 'routine'
  return {
    kind,
    reviewers: PANELS[kind].map((entry) => ({ ...entry })),
    note:
      kind === 'complex'
        ? 'complex panel selected via explicit --complex flag'
        : 'routine panel (default)',
  }
}

// argv parsing for `--complex`, used by BOTH CLI entrypoints so neither can
// drift into its own `=== true` check.
//
// `--complex` is a boolean flag, but a value can reach it two ways: the argv
// parser assigns the next non-`--` token (`--complex true` → the STRING
// 'true') and `--complex=true` parses to the same string. Comparing against
// `=== true` silently downgraded both to the routine panel. The rule now: the
// bare flag and the documented literal `true` (or an empty value) enable the
// complex panel; absence keeps it routine; anything else is REJECTED loudly.
// An explicit complex request is never quietly turned into a cheaper panel.
// (Entrypoints additionally reject unknown flags, so `--complexx=true` cannot
// read as "routine was requested" either.)
export function assertExplicitComplexFlag(rawValue) {
  if (rawValue === undefined || rawValue === false) return false
  if (rawValue === true || rawValue === '' || rawValue === 'true') return true
  throw new Error(
    `--complex is a boolean flag and takes no value, got: ${JSON.stringify(rawValue)}. ` +
      'Pass a bare --complex (or --complex true / --complex=true) to escalate to the complex panel, ' +
      'or omit it for the routine panel.',
  )
}
