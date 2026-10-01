// Minimal argv parsing for the review CLIs. No dependency on a parser lib:
// flags are `--name value`, `--name=value`, or boolean `--flag`.
//
// The `--name=value` form is parsed, not ignored: without it `--complex=true`
// produced a flag literally named `complex=true` and left `flags.complex`
// undefined, so the panel-selection guard saw "no --complex" and quietly ran
// the routine panel — the same silent downgrade the explicit-flag rule exists
// to prevent. Anything the entrypoint does not know about is rejected by
// assertKnownFlags rather than ignored, so a typo cannot shrink a request.

export function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const body = arg.slice(2)
    const equals = body.indexOf('=')
    if (equals !== -1) {
      flags[body.slice(0, equals)] = body.slice(equals + 1)
      continue
    }
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { flags, positional }
}

// Fails on any flag the entrypoint does not accept and on stray positional
// arguments. Both are input mistakes whose silent effect would be to run
// something other than what was asked for (a misspelled `--complex` reads as
// "routine was requested"), so they abort BEFORE any GitHub or model call.
export function assertKnownFlags({ flags, positional = [], allowed, usage }) {
  const unknown = Object.keys(flags).filter((name) => !allowed.includes(name))
  if (unknown.length > 0) {
    throw new Error(
      `unknown flag(s): ${unknown.map((name) => (name === '' ? '--' : `--${name}`)).join(', ')}. ` +
        `Known flags: ${allowed.map((name) => `--${name}`).join(', ')}. ${usage}`,
    )
  }
  if (positional.length > 0) {
    throw new Error(
      `unexpected argument(s): ${positional.join(', ')} — this CLI takes flags only. ${usage}`,
    )
  }
}

// Reads a boolean flag the same way for every entrypoint: present (bare,
// `=`-empty, or the literal `true`) is on, absent is off, and anything else
// is an error. `--publish=yes` silently not publishing would be the same
// class of quiet mis-execution as `--complex=true` silently going routine.
// (The complex flag has its own message; see panels.assertExplicitComplexFlag.)
export function booleanFlag(flags, name) {
  const raw = flags[name]
  if (raw === undefined || raw === false) return false
  if (raw === true || raw === '' || raw === 'true') return true
  throw new Error(
    `--${name} is a boolean flag and takes no value, got: ${JSON.stringify(raw)}. ` +
      `Pass a bare --${name} (or --${name}=true), or omit it.`,
  )
}

export function requirePositiveInt(flags, name) {
  const raw = flags[name]
  const value = typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer, got: ${JSON.stringify(raw ?? null)}`)
  }
  return value
}
