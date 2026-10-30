Private Leibrente Ertragsanteil citations now use §22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG, preserving each file's section-sign spacing and non-breaking spaces. This includes UI copy, glossary, recommendation snapshots, comments, public-page MDX and existing documentation/briefs.

Verified against [the official §22 EStG text](https://www.gesetze-im-internet.de/estg/__22.html): the age-based Ertragsanteil table is in Doppelbuchstabe bb Satz 4 itself. Remove the incorrect "Anlage 1" references from MethodePage and the insurance domain comment.

The diff contains only comment/string/Markdown/MDX/snapshot text changes and the explicitly requested citation assertion regex. No calculation logic, rates, table values, numeric test expectations, statutory values in de2026.ts or route titles change. The Besteuerungsanteil glossary entry and all existing correct cohort citations remain unchanged.

Validation:

- `npm ci`
- `npm run verify` passed: lint; 282 main test files with 5,407 tests passed and one skipped; Worker typechecks and all 37 Worker tests; production build and prerender.
- `git diff --check`
- Repository-wide abbreviated Ertragsanteil citation search: no matches.
- TypeScript AST comparison: node kinds, identifiers and numeric literals unchanged outside citation text and the authorized assertion regex.

Remaining exact abbreviated `aa` citation matches all concern Besteuerungsanteil (GRV, Basisrente, Versorgungswerk or the explicitly proposed cohort treatment in research):

| File | Lines | Context |
| --- | --- | --- |
| `.scratch/seo-geo-discovery/briefs/basisrente-rechner.md` | 62, 109 | Basisrente cohort taxation |
| `RENTENPAKET_SCENARIO_RESEARCH.md` | 205 | Proposed nachgelagerte cohort taxation |
| `docs/context/products.md` | 37 | GRV |
| `docs/context/rules-and-tax.md` | 29 | GRV cohort table |
| `src/content/calculationNotes.ts` | 68, 73 | GRV and Basisrente |
| `src/content/terms.ts` | 243 | Besteuerungsanteil term |
| `src/domain/products/basisrente.ts` | 8 | Basisrente |
| `src/domain/products/grv.ts` | 13 | Versorgungswerk, same taxation as GRV |
| `src/engine/altersvorsorgedepot.ts` | 450 | Distinguishes certified pensions from GRV/Basisrente cohort treatment |
| `src/engine/basisrente.ts` | 8, 132, 154, 158, 246 | Basisrente cohort channel |
| `src/engine/combineContext.ts` | 14, 116 | GRV/Versorgungswerk routing |
| `src/engine/grv.ts` | 8, 15, 226 | GRV/Versorgungswerk |
| `src/engine/portfolioCombine.ts` | 164, 308, 428 | Cohort routing and Basisrente |
| `src/engine/retirementPayout.ts` | 17 | Basisrente cohort table |
| `src/features/mein-plan/MeinPlanPage.tsx` | 1024 | GRV/Versorgungswerk |
| `src/test/scenarioReports/rulesFingerprint.ts` | 34 | Retirement-cohort taxable fraction |

Follow-up: independently audit the pre-existing `src/test/externalGoldenFixtures.ts:922` comment "17 % → 2,040 EUR taxable" against its fixture inputs. Both numbers are retained unchanged in this citation-only change.
