## Gate production deploys on full verify

On 2026-11-04 (via Spock), Peter decided: **yes**, gate production deploys on CI after 6 Nov; **no** to turning off the GitHub admin bypass on the required `verify` check. Branch protection stays as it is.

### Approach
I took the preferred path, which needs no new secret. The Cloudflare Workers Builds **production** trigger now runs `npm run verify` as its build command, replacing `npm run build`. The deploy command stays `npx wrangler deploy`. If full verify fails on a main commit, the build fails and Workers Builds does not deploy. If verify passes, the deploy goes ahead as before. `npm run verify` ends with `npm run build && npm run check:dist`, so the deploy still gets the same `dist/`. Workspace `npm ci` installs the worker packages that `worker:typecheck`/`worker:test` need.

The non-production trigger is unchanged: `npm run build` + `npx wrangler versions upload`, so PR previews stay cheap.

### In-repo changes (docs and comments only, no app or logic changes)
- `.github/workflows/main-verify.yml`: the `full` job comment now says Workers Builds production runs `npm run verify` before deploy. Job names, triggers, gates and the `ci-cost-lint` marker are unchanged.
- `README.md`, `AGENTS.md`, `CLAUDE.md`: removed "Workers Builds deploys independently of GitHub checks; gating is separate work" and described the gate in its place.

Not changed: branch protection, admin bypass, the required `verify` check, the focused PR job, property-sweep, scenario filters, `workers/simulate`, `workers/qa-submit`.

### Post-merge Cloudflare change still needed (owner bot)
Cloudflare credentials were not available in the implementer environment, so **this setting has NOT been applied yet**. Until it is, the docs in this PR describe the intended state. Owner bot: please apply this right after merging:

Account `3253c5d21db2a945afa450f3d7e430b5`, Worker script_tag `8af5749f7bc64448811770b2a2690899`.

1. Production trigger "Deploy default branch" `72a0848b-c015-4ff2-8f6b-4af1d49fccc2`:
   ```
   PATCH /accounts/3253c5d21db2a945afa450f3d7e430b5/builds/triggers/72a0848b-c015-4ff2-8f6b-4af1d49fccc2
   {"build_command": "npm run verify"}
   ```
   Keep `deploy_command: "npx wrangler deploy"` and `branch_includes: ["main"]`.
2. If the Worker's `production_settings` mirror the trigger, set `production_settings.build_command = "npm run verify"` there as well (`deploy_command` unchanged).
3. Do **not** touch trigger `9a7e9a98-7cea-4b24-bad4-6f7a2527f686` (non-prod) or `previews_base_config`. Both stay on `npm run build` / `npx wrangler versions upload`.
4. Confirm with a GET that the production trigger shows `build_command: npm run verify`. On the next main push, check that the "Workers Builds: rentenwiki" build log runs lint, tests and worker checks before `wrangler deploy`.

### Invariant
This is a CI/docs polish change and does not touch engine math. The nearest architectural invariant is the **Backend boundary** (CLAUDE.md): no new network endpoints, secrets or deploy targets. The rentenwiki Worker is still deployed only by Workers Builds.

### Testing
- `npm ci` passed.
- `npm run verify` (full) passed locally. Regenerated `public/og/*.png` and CRLF-only `.snap` changes were discarded.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
