// Minimal argv parsing for the review CLIs. No dependency on a parser lib:
// flags are `--name value` or boolean `--flag`.

export function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      i++
    } else {
      flags[name] = true
    }
  }
  return { flags, positional }
}

export function requirePositiveInt(flags, name) {
  const raw = flags[name]
  const value = typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer, got: ${JSON.stringify(raw ?? null)}`)
  }
  return value
}
