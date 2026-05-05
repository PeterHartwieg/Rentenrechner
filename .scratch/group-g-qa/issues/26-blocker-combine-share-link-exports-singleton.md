---
title: "BLOCKER: Combine-mode \"Link kopieren\" exports singleton compare state, drops portfolio"
Status: done
Severity: blocker
Area: Group G / combine mode / share links
---

## Description

The combine details view still renders `DetailComparisonTable` with `onCopyLink={handleCopyLink}` ([App.tsx:402](src/App.tsx)). The button is exposed as "Link kopieren" ([DetailComparisonTable.tsx:38](src/features/results/DetailComparisonTable.tsx)).

`handleCopyLink` always calls `buildShareUrl(profile, assumptions)` ([useDerivedViews.ts:126](src/app/useDerivedViews.ts)), and URL share itself only serializes v1 singleton `profile` / `assumptions` ([urlShare.ts:34](src/utils/urlShare.ts)). Route detection explicitly treats share URLs as compare-mode singleton state ([useRoute.ts:51](src/app/useRoute.ts)).

## Impact

A "Mein Plan" user can copy a link that reopens as compare mode and **drops their entire contract inventory**. This is worse than no share button — it gives a false sense of reproducibility. Users may share a "Mein Plan" link expecting the recipient to see their portfolio and instead the recipient sees a singleton comparison configured against unrelated defaults.

## Fix direction

Either:
1. Hide / disable the share button in combine mode until v2 portfolio share-link serialization exists.
2. Extend `urlShare.ts` to support a v2 portfolio payload, update `useRoute.ts` to detect and load it, and have `handleCopyLink` emit the right shape based on mode.

Option 1 is the smaller publication-blocking fix; option 2 is the proper feature.

## Affected users

Any "Mein Plan" user who clicks "Link kopieren" — currently silently broken.
