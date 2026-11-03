Migrate the root calculator, QA submission Worker, and Simulate API Worker from Vitest 4.1.12 to 5.0.5 together. This supersedes #448, #453 and #454.

All three manifests use `~5.0.5`; the root V8 coverage provider moves with Vitest. Regenerate the root workspace lock and both standalone Worker locks with `npm install` (Workers use `--workspaces=false` so npm writes their own locks). No peer bypasses or overrides are used.

Migration findings and breaking changes:

- Vitest's coverage provider requires the matching Vitest version. [#448's failed verification](https://github.com/PeterHartwieg/Rentenrechner/actions/runs/41654434475) stopped at `npm ci` with `ERESOLVE`: coverage 4.1.12 still required Vitest 4.1.12.
- Worker-only dependency updates also affect the root workspace lock. [#453](https://github.com/PeterHartwieg/Rentenrechner/actions/runs/41654956363) and [#454](https://github.com/PeterHartwieg/Rentenrechner/actions/runs/41654426129) stopped at root `npm ci` with `EUSAGE`, reporting missing Vitest/coverage 5.1.0 entries and inconsistent transitive dependencies.
- Vitest 5 requires Node >=22.12 and Vite >=6.4, with Vite now a peer. Existing Node 22 CI and Vite 8.3.5 satisfy these requirements. Neither Worker uses `@cloudflare/vitest-pool-workers`; both deliberately test in Node with mocked Worker bindings. Stryker's existing runner accepts Vitest 5.
- After installation, Vitest 5's server/config identity handling exposes [Cloudflare's dev-plugin conflict](https://github.com/cloudflare/workers-sdk/issues/15969): `There is already a server associated with the config`. Reproduced in full and targeted runs. Exclude `cloudflare()` when `VITEST` is set, because these suites run in Node/jsdom; retain React/MDX transforms, the build-date define, setup, isolation and worker limits. App builds/development retain the Cloudflare plugin.
- Review the other [Vitest 5 changes](https://vitest.dev/guide/migration/), including automatic mock clearing, top-level hoisted mocks, awaited async assertions, matcher types, coverage matching and CLI behavior. Validation below checks their impact without disabling new defaults or weakening assertions. [5.0.5 release notes](https://github.com/vitest-dev/vitest/releases/tag/v5.0.5).

Validation (2026-11-03):

- `npm ci` and both `npm --prefix workers/<worker> ci` commands passed. npm 10.9.9 (the version in the failed CI runs) also accepted all three locks with `ci --dry-run`.
- `npm run verify` passed on Node 24.17.0: lint, 292 test files (5,617 passed, one pre-existing skip), 112 route tests with 99.01% branch coverage, both Worker typechecks, 27 QA Worker tests, 16 Simulate Worker tests, TypeScript build, OG generation, production build, prerender and distribution checks.
- `npm exec --yes --package=node@22.23.4 -- npm run verify:focused` passed on the same Node version as CI. The actual migration diff automatically escalated to the full suite, with the same test totals and coverage; the production build and distribution checks also passed. The test runner's executable path was checked to confirm Node 22 was used.
- `npm exec --yes --package=node@22.23.4 -- node node_modules/vitest/vitest.mjs related --run --passWithNoTests scripts/ci-focused.mjs` selected one affected test file and passed all 38 tests. The focused-selector parser regression now identifies the installed Vitest 5 version; no CLI argument migration was necessary.
- `npm audit --omit=dev --audit-level=high` and `git diff --check` passed. Generated OG changes and snapshot line-ending rewrites from local runs were restored. No snapshot content changes, new skips, deleted tests, or weaker assertions are included.

Remote checks are pending the harness push/PR. `gh pr checks` confirms failed Workers Builds for all three superseded PRs, but their GitHub check output only links to the dashboard; the existing Wrangler OAuth credential receives `403 Forbidden` from Cloudflare's build-log API. The browser host is unavailable. Check the new PR's `verify` and `Workers Builds: rentenwiki` before merging.

After this PR merges, close #448, #453 and #454 if still open, commenting `Superseded by #<this PR>` on each. Leave them unchanged until then.
