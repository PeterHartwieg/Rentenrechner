# RentenWiki.de

Interactive German retirement comparison tool evaluating:

- private ETF investing
- betriebliche Altersversorgung (bAV)
- private fund/ETF insurance (Schicht 3)
- Basisrente / Rürup (Schicht 1)
- Altersvorsorgedepot / AVD (Schicht 2, Reform 2026)
- Riester Altvertrag (Schicht 2)
- gesetzliche Rente (GRV baseline)

Live at [rentenwiki.de](https://rentenwiki.de). Local-first React/Vite app — runs entirely in the browser; no backend, no telemetry, no accounts. Compares products by monthly net burden, projected retirement capital, and estimated monthly net retirement income using official 2026 German tax and social-security values.

## Important Limitation

**Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.**

This app produces illustrations, not advice. All calculations use German statutory values for the year 2026 (tax tariffs, social-security contributions, Rentenwert; sources: BMF, Deutsche Rentenversicherung, GKV-Spitzenverband). Results are estimates under your assumptions — returns, inflation, life expectancy, and future legislative changes are unknown. Do not rely on the output for investment, tax, or legal decisions; consult an independent advisor before signing a contract.

The model is intentionally transparent but not complete. Some German tax, social-security, and retirement-phase rules are simplified. See `BACKLOG.md` for details.

## License

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE.md). Personal, research, and internal-evaluation use is free.

**Commercial use requires a separate paid license.** Insurance brokers, investment advisors, employers, and any other commercial use must contact `peter@hartwieg.com` — see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

## Development

```bash
npm install
npm run dev         # local dev server
npm run verify      # lint + tests + build
npm test            # unit tests only
```

## Project Documents

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` / `AGENTS.md` | Developer guide for AI coding agents (Claude Code / Codex). Start here. |
| `docs/context/products.md` | Product routing table: simulator, validator, types, tests, UI input per product |
| `docs/context/rules-and-tax.md` | Legal area → engine file mapping |
| `docs/context/ui.md` | UI section → component and CSS mapping (incl. legal pages, reusable input sections, provenance primitives) |
| `docs/golden-coverage-audit.md` | What every external oracle pins; the standing safety net for math-touching changes |
| `docs/portfolio-schema-design.md` | Binding design for the singleton-to-instance migration (`schemaVersion: 1 → 2`); historical reference + invariants |
| `DESIGN.md` | Design vision, architecture, product assumptions |
| `BACKLOG.md` | Prioritized accuracy and product backlog |
| `LICENSE.md` | PolyForm Noncommercial 1.0.0 (free use scope) |
| `COMMERCIAL_LICENSE.md` | Paid commercial license terms (brokers / advisors / employers) |
| `LEGAL_REVIEW.md` | Source links and legal interpretation notes |
| `BAV_RESEARCH.md` | bAV-specific research |
| `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md` | Private insurance research |
| `ALTERSVORSORGEDEPOT_2027_RESEARCH.md` | AVD Reform 2026 research |

## Source Structure

```
src/
  rules/          de2026.ts, legalConstants.ts, index.ts
  domain/         index.ts, profile.ts, results.ts, fees.ts, rules.ts, salary.ts, retirementTax.ts
  domain/products/ bav.ts, etf.ts, insurance.ts, basisrente.ts, altersvorsorgedepot.ts, riester.ts, grv.ts
  data/           defaultScenario.ts, presets.ts, scenarioLibrary.ts
  content/        terms.ts, productFocus.ts, triggers.ts
  engine/         tax.ts, salary.ts, salaryPhaseFunding.ts, retirementTax.ts, retirementPayout.ts,
                  fees.ts, grv.ts, basisrente.ts, altersvorsorgedepot.ts, riester.ts, bavWarnings.ts,
                  simulationContext.ts, buildResult.ts, simulate.ts, productManifest.ts
  engine/products/ etf.ts/.validation.ts/.test.ts, bav, insurance, basisrente, altersvorsorgedepot, riester
  app/            useCalculatorState.ts, useSimulationResult.ts, useWorkspaceUiState.ts,
                  useDerivedViews.ts, simulationSelectors.ts, useSimulationViewModel.ts (facade),
                  productPresentation.ts, useRoute.ts
  features/       inputs/ (+ productUiRegistry.tsx, + sections/), results/ (+ provenance.tsx), cashflows/, assumptions/, legal/, workspace/, guidance/
  ui/             NumberField.tsx, ResultMetric.tsx, BavWaterfall.tsx, InfoTip.tsx, formatting.ts, helpers.ts
  utils/          scenarioSchema.ts, urlShare.ts, csvExport.ts, format.ts
  test/           factories.ts, externalGoldenFixtures.ts
  storage.ts, App.tsx, App.css, index.css
public/
  _redirects                # Cloudflare Pages / Netlify SPA fallback
vercel.json                 # Vercel SPA fallback
LICENSE.md, COMMERCIAL_LICENSE.md
```
