# Structured validation diagnostics

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Add API-facing validation diagnostics for profile, shared comparison assumptions, rule-year, product-id, return-scenario, and tax-operation inputs. This slice should keep the current internal validators intact while adding a public diagnostic layer that reports machine-readable error codes and useful field paths where the API owns the schema.

Decision: do not rewrite the existing validators and do not duplicate all product validators. The API diagnostic layer reports field-level paths for API-owned DTO fields and shared compare-mode fields (profile, rule year, visible products, return scenarios, Monte Carlo, selected scenario). Product-specific assumptions still pass through the existing product validators as the authoritative final gate; if one fails, the API reports the product slot root path such as `assumptions.bav` or `assumptions.insurance` with a product-validation error code.

The first consumer should be a small validation API function that can validate a comparison request after defaults are applied. Later tax and comparison facade issues should reuse the same diagnostic shapes.

## Acceptance criteria

- [ ] Validation diagnostics include at least `path`, `code`, `severity`, and a fallback message.
- [ ] Profile validation reports field paths such as `profile.age`, `profile.retirementAge`, and `profile.grossSalaryYear`.
- [ ] Shared assumption validation reports field paths for invalid visible products, return scenarios, Monte Carlo settings, retirement end age, inflation rate, and selected scenario id.
- [ ] Product-specific assumption validation keeps the existing product validators authoritative and reports slot-root paths such as `assumptions.bav` when those validators fail.
- [ ] A product-validator failure for an invalid product field, for example `bav.monthlyGrossConversion < 0`, is pinned by a test to return a slot-root error at `assumptions.bav`, not a synthetic deeper path.
- [ ] The diagnostic layer does not reimplement statutory/product validation formulas beyond public DTO shape and range checks needed to produce useful paths.
- [ ] The existing `validateState`/product validators remain as the final gate before any simulation API succeeds.
- [ ] Explicit empty `visibleProducts` is accepted as valid.
- [ ] Unsupported rule year uses the same error shape as other validation failures.
- [ ] Validation functions are pure, serializable, React-free, and browser-free.
- [ ] Tests cover valid defaults, invalid profile, invalid assumptions, invalid product id, invalid return scenario, invalid Monte Carlo, unsupported rule year, and explicit empty `visibleProducts`.

## Blocked by

- .scratch/pure-frontend-api/issues/01-api-envelope-manifest-and-rule-resolution.md
