# Rentenrechner

Interactive German retirement comparison tool for evaluating:

- private ETF investing
- betriebliche Altersversorgung / bAV
- private fund or ETF insurance

The current version is a local-first React/Vite prototype for personal analysis. It compares products by monthly net burden, projected retirement capital, and estimated monthly net retirement income.

## Current Scope

- German market only
- German UI
- default personal profile:
  - 28 years old
  - 67 retirement age
  - 75,000 EUR gross salary
  - tax class I
  - no children
  - no church tax
  - public health insurance
- fixed return scenarios
- ETF, bAV, and private insurance products
- configurable product costs
- nominal and inflation-adjusted charts

## Important Limitation

This app is not financial, tax, or legal advice.

The current model is intentionally transparent but not yet complete. Some German tax, social-security, ETF tax, insurance tax, and retirement-phase rules are simplified. See `DESIGN.md` and `BACKLOG.md` for details.

## Development

Install dependencies:

```bash
npm install
```

Start the local app:

```bash
npm run dev
```

Run verification:

```bash
npm test
npm run lint
npm run build
```

## Project Documents

- `DESIGN.md`: design vision, architecture, product assumptions, deferred items
- `BACKLOG.md`: prioritized accuracy and product backlog

## Main Source Files

- `src/App.tsx`: UI and charts
- `src/data/defaultScenario.ts`: personal and product defaults
- `src/domain/types.ts`: domain model
- `src/rules/de2026.ts`: German 2026 rule values
- `src/engine/salary.ts`: salary and bAV funding model
- `src/engine/projections.ts`: accumulation and payout helpers
- `src/engine/simulate.ts`: product comparison orchestration

