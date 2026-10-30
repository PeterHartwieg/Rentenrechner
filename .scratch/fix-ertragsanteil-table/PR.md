The Ertragsanteil lookup disagreed with the statutory table at 69 ages and incorrectly returned 1% from age 89. It now uses all 59 official [fromAge, percent] bands, with 1% applying from age 97. Completed-age flooring and negative-age clamping are preserved.

Source of truth: [§22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG](https://www.gesetze-im-internet.de/estg/__22.html), the Ertragsanteil table following “Der Ertrag des Rentenrechts (Ertragsanteil) ist aus der nachstehenden Tabelle zu entnehmen”. Every band was checked against this official page on 2026-10-30; all requested bands agree with the law, with no discrepancies.

- Add independent statutory expectations for every age 0–120, plus fractional, negative and later ages.
- Add the insurance classification regression: age 60, EUR 1,000/month yields EUR 2,640 taxable annually (12,000 × 22%).
- Correct the existing age-89 and age-95 assertions, keeping the age-100 assertion at 1%.
- Include the exported band data in legalRuleData so ruleSetFingerprint tracks the table, and bump de2026 metadata revision 2 → 3. Fingerprint: 083462e03b0836a5 → 2ebfd51c7a0ed60b.
- Check MethodePage's age-65/66 and age-67 examples and insuranceClassification.test.ts's expectations: their statutory 18%/17% values remain correct, so these files need no changes.
- Refresh scenario provenance from committed calculation sources. Its evaluated ages 59/60/68/72/74 change to the corrected percentages and the full band catalog is now captured. All 5,872 scenario stage values remain unchanged. Unrelated Monte Carlo floating-point noise from recapture was discarded; external goldens and integration snapshots are unchanged.

Changed ages (percent, old → new; every affected age listed):

| Age | Old | New |
| --- | --- | --- |
| 3 | 57% | 58% |
| 5 | 56% | 57% |
| 6 | 55% | 56% |
| 7 | 55% | 56% |
| 8 | 54% | 56% |
| 9 | 53% | 55% |
| 10 | 53% | 55% |
| 11 | 52% | 54% |
| 12 | 52% | 54% |
| 13 | 51% | 53% |
| 14 | 50% | 53% |
| 15 | 50% | 52% |
| 16 | 49% | 52% |
| 17 | 49% | 51% |
| 18 | 48% | 51% |
| 19 | 48% | 50% |
| 20 | 47% | 50% |
| 21 | 47% | 49% |
| 22 | 46% | 49% |
| 23 | 45% | 48% |
| 24 | 45% | 48% |
| 25 | 44% | 47% |
| 26 | 44% | 47% |
| 27 | 43% | 46% |
| 28 | 43% | 45% |
| 29 | 42% | 45% |
| 30 | 42% | 44% |
| 31 | 41% | 44% |
| 32 | 41% | 43% |
| 33 | 40% | 42% |
| 34 | 39% | 42% |
| 35 | 39% | 41% |
| 36 | 38% | 40% |
| 37 | 38% | 40% |
| 38 | 37% | 39% |
| 39 | 36% | 38% |
| 40 | 36% | 38% |
| 41 | 35% | 37% |
| 42 | 35% | 36% |
| 43 | 34% | 35% |
| 44 | 34% | 35% |
| 45 | 33% | 34% |
| 47 | 32% | 33% |
| 51 | 30% | 29% |
| 59 | 24% | 23% |
| 60 | 23% | 22% |
| 68 | 17% | 16% |
| 72 | 14% | 13% |
| 74 | 13% | 12% |
| 77 | 9% | 10% |
| 78 | 8% | 9% |
| 79 | 8% | 9% |
| 80 | 7% | 8% |
| 81 | 6% | 7% |
| 82 | 5% | 7% |
| 83 | 5% | 6% |
| 84 | 4% | 6% |
| 85 | 3% | 5% |
| 86 | 3% | 5% |
| 87 | 2% | 5% |
| 88 | 2% | 4% |
| 89 | 1% | 4% |
| 90 | 1% | 4% |
| 91 | 1% | 4% |
| 92 | 1% | 3% |
| 93 | 1% | 3% |
| 94 | 1% | 2% |
| 95 | 1% | 2% |
| 96 | 1% | 2% |

Validation:

- `npm ci`
- Regression-first run reproduced all 69 incorrect integer ages and the age-60 taxable-income error before the fix.
- Programmatic comparison of both production bands and the independent 0–120 test fixture against the fetched official table.
- `npm run verify` without environment overrides (lint, unit/integration/property tests, Worker typechecks and tests, production build and prerender). The main suite passed all 282 files: 5,407 tests passed and one skipped. Vitest now caps workers at four in repository configuration to prevent CPU contention from causing intermittent UI wait failures. File isolation and all existing test time limits are preserved. The isolated `src/Calculator.test.tsx` rerun also passed all seven tests.

Follow-up after merge: redeploy `workers/simulate`, which bundles `src/api`, so the hosted API uses the corrected table.
