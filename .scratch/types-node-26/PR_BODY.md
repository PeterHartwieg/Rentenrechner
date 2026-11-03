Align root `@types/node` with the Node 22 runtime used by CI, replacing `^24.12.2` with `^22.20.5` (the latest 22.x release returned by the npm registry). Regenerate the root lockfile with `npm install`; the only transitive change is the matching `undici-types` version. This supersedes Dependabot #445.

Runtime findings:

- All four `setup-node` configurations use `node-version: 22`: PR verification, main verification, and both property-sweep jobs. The repository has no `.nvmrc`, `.node-version`, or root `engines` declaration. This workstation normally uses Node 24.17.0; validation for this change uses Node 22.23.4 to match CI.
- [Cloudflare Workers Builds currently defaults to Node 24.22.1](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) and supports overrides through `NODE_VERSION`, `.nvmrc`, or `.node-version`. There is no repository version-file override; dashboard-only build settings were not available to verify. Node 22 remains the oldest explicitly configured build/test runtime, so its API surface determines the root types.
- Root `wrangler.jsonc` uses compatibility date `2026-05-09` and `nodejs_compat`. [Workers provides a subset of Node APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/); this flag does not select a Node 26 runtime. Worker manifests, locks, and configuration are unchanged.

Do not take #445's proposed `26.6.5`: Node 26 types would allow APIs that are unavailable in Node 22 CI (and potentially Node 24 builds). Using the latest 22.x types keeps declarations aligned with the runtime we build and test on without changing runtime policy.

Validation on Node 22.23.4:

- `npm ci` passed.
- `npm run verify` passed: lint, 292 test files (5,617 passed, one skipped), route coverage (99.01% branches), both Worker typechecks and test suites, TypeScript build, production build, prerender, and distribution checks. No type-error fixes were needed.
- `npm audit --omit=dev --audit-level=high` passed with zero vulnerabilities.

The initial full run hit one asynchronous UI lookup failure in `Calculator.test.tsx` (the offer-review navigation test). All seven tests in that file passed in isolation, then the unmodified full verification command passed on rerun. No application code or test settings were changed. Remote PR CI must be checked after the harness pushes and opens the PR.

After this PR merges, close #445 if it is still open, with the comment `Superseded by #<this PR>`.
