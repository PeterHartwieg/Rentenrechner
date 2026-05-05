---
title: "RISK: Stale Sparerpauschbetrag-sharing warning pinned by a test even though sharing is applied later"
Status: done
Severity: risk
Area: engine / portfolioAdapter
---

## Description

`buildPortfolioFunding` still reports Sparerpauschbetrag sharing as *deferred* when two ETF instances exist ([portfolioAdapter.ts:836](src/engine/portfolioAdapter.ts)), even though the sharing is actually applied later in the adapter ([portfolioAdapter.ts:1325](src/engine/portfolioAdapter.ts)).

A test asserts that the deferral note exists ([portfolioAdapter.test.ts:310](src/engine/portfolioAdapter.test.ts)). If these notes ever become user-visible, users will see a false "Sparerpauschbetrag wird nicht geteilt" limitation that does not reflect the actual calculation.

## Fix direction

Either:
1. Remove the early deferral note and re-evaluate whether the test should assert the absence of that note (and separately assert correct sharing behavior), or
2. Move the sharing logic earlier so the note is accurate at the point it is emitted.

Also update the test so it cannot be used to "lock in" a misleading UX message.
