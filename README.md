# Rentenrechner

Interactive German retirement comparison tool evaluating:

- private ETF investing
- betriebliche Altersversorgung (bAV)
- private fund/ETF insurance (Schicht 3)
- Basisrente / Rürup (Schicht 1)
- Altersvorsorgedepot / AVD (Schicht 2, Reform 2026)
- Riester Altvertrag (Schicht 2)
- gesetzliche Rente (GRV baseline)

The current version is a local-first React/Vite prototype for personal analysis. It compares products by monthly net burden, projected retirement capital, and estimated monthly net retirement income, using official 2026 German tax and social-security values.

## Important Limitation

This app is not financial, tax, or legal advice.

The model is intentionally transparent but not complete. Some German tax, social-security, and retirement-phase rules are simplified. See `BACKLOG.md` for details.

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
| `docs/context/ui.md` | UI section → component and CSS mapping |
| `DESIGN.md` | Design vision, architecture, product assumptions |
| `BACKLOG.md` | Prioritized accuracy and product backlog |
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
  data/           defaultScenario.ts, presets.ts
  engine/         tax.ts, salary.ts, retirementTax.ts, projections.ts, fees.ts, grv.ts,
                  basisrente.ts, altersvorsorgedepot.ts, riester.ts, bavWarnings.ts,
                  simulationContext.ts, buildResult.ts, simulate.ts, productManifest.ts
  engine/products/ etf.ts/.validation.ts/.test.ts, bav, insurance, basisrente, altersvorsorgedepot, riester
  app/            useCalculatorState.ts, useSimulationViewModel.ts, productPresentation.ts
  features/       inputs/, results/, cashflows/, assumptions/
  ui/             NumberField.tsx, ResultMetric.tsx, BavWaterfall.tsx, formatting.ts, helpers.ts
  utils/          scenarioSchema.ts, urlShare.ts, csvExport.ts, format.ts
  test/           factories.ts
  storage.ts, App.tsx, App.css, index.css
```
