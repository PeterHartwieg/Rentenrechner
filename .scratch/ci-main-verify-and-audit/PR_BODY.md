Main pushes now run the same `npm ci` and `npm run verify` gate as pull requests. The existing `verify` check name, fork-safe `pull_request` event, read-only contents permission, and exact-SHA manual verification remain intact.

- Add a blocking production audit (`npm audit --omit=dev --audit-level=high`) and a non-blocking full audit whose output appears in the GitHub job summary.
- Schedule weekly Dependabot updates for npm at the root and under `workers/*`, and for GitHub Actions.
- Align Scenario Report checkout/setup-node with the other workflows at v6; upload-artifact stays at v4, matching property-sweep.
- Run `npm audit fix` without `--force`, raise Vite to 8.3.5, Vitest to 4.1.12, Wrangler to 4.156.0, and the Cloudflare Vite plugin to 1.66.0. Update both Workers' Vitest/Wrangler requirements and Worker types to the v5 peer required by Wrangler. Refresh the root workspace lockfile and both standalone Worker lockfiles.

Audit counts (2026-10-30; counts are per audited lockfile, not additive):

| Audit | Before | After |
| --- | --- | --- |
| Root, all dependencies | 21: 11 high, 8 moderate, 2 low; 0 critical | 2 moderate; 0 high, critical, or low |
| Root, production dependencies | 0 | 0 |
| QA submit Worker, all dependencies | 12: 9 high, 2 moderate, 1 low; 0 critical | 0 |
| Simulate Worker, all dependencies | 12: 9 high, 2 moderate, 1 low; 0 critical | 0 |

The two remaining moderate findings are `qs` and its parent `typed-rest-client`, used only by the Stryker mutation tooling: `@stryker-mutator/core@10.0.0 → typed-rest-client@2.3.1 → qs@6.15.1`. The parent pins this vulnerable qs version, and another `npm audit fix` leaves it unchanged. Resolving it requires a separate upstream dependency update or an override; no forced updates or overrides are introduced here. No high/critical findings remain, including in the standalone Workers.

Validation:

- `npm ci` at the root and in both Workers.
- `npm run verify` (lint, frontend tests, Worker typechecks/tests, production build and prerender).
- `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high`; both pass.
- Full audit of each standalone Worker; both pass with zero findings.
- actionlint 1.7.12 validates all workflows; Dependabot YAML parses successfully.
- GitHub CI will run when the harness pushes and opens this PR; no remote CI result is claimed by the local implementation.

Manual follow-ups for Peter (outside this PR):

- Review and enable `enforce_admins` in main branch protection as appropriate.
- Review/update the Cloudflare Workers Builds dashboard build/deploy configuration.
