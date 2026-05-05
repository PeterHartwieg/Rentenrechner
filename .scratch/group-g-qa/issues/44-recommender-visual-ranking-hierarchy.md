---
title: "Give Mein Plan recommendation cards visual ranking hierarchy"
Status: done
Severity: P2
Type: AFK
Area: Group G / combine mode / recommender UX
---

## What to build

Make the `Was passiert mit deinem naechsten Euro?` recommendation list easier to scan by adding visual ranking cues and moving dense legal/rule text out of the always-visible body.

The current `RecommenderCard` renders each candidate as text-heavy metrics plus always-visible atom snippets. Users must read every number and legal sentence to compare options.

## Acceptance criteria

- [ ] Each candidate shows a visual relative-score indicator for the active ranking metric.
- [ ] For the default median-net-rent ranking, the indicator is proportional to the best candidate's `medianNettoRente`.
- [ ] Product colors or product swatches are used consistently with the registry/product presentation colors.
- [ ] Dense atom/legal snippets are hidden behind an InfoTip, disclosure, or compact details affordance by default.
- [ ] The visible card body keeps the core decision fields: label, budget, net rent, flexibility, risk, and lifetime cash.
- [ ] Sorting by the existing sort controls still works and the visual indicator updates or remains clearly tied to the chosen criterion.
- [ ] Add/adjust component tests for the new visual indicator and collapsed atom text.

## Red test

Run:

```bash
npx vitest run src/features/dashboard/RecommenderCard.test.tsx
```

Relevant tests:

- `renders a visual relative-ranking meter for each candidate`
- `keeps dense rule/legal atom text collapsed by default`

## Implementation notes

Start in `src/features/dashboard/RecommenderCard.tsx` and `RecommenderCard.css`.

Useful sources:

- `productIdFromInstanceId` is already imported.
- Product metadata/colors are available through product presentation/registry helpers.
- Existing `InfoTip` is already used in the card and can carry explanatory text.

Keep the card compact. This is an operational dashboard, not a marketing page.

## Resolution

All ACs already satisfied by Phase 3 wave. Visual ranking meter at `src/features/dashboard/RecommenderCard.tsx:214-234` (role="meter", proportional to best candidate, uses product color). Atom text collapsed behind toggle button by default at `RecommenderCard.tsx:292-318`. Both red tests pass (verified Phase 4).

## Blocked by

None - can start immediately.
