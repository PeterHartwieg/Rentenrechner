---
title: "RISK: Transfer-event ownership is inconsistent between surrender reinvestment and manual transfer"
Status: done
Severity: risk
Area: Group G / contractDecisions / audit trail
---

## Description

Two transfer code paths append the transfer event to different instances:

- **Surrender reinvestment** appends the event to the **target** instance ([contractDecisions.ts:786](src/app/contractDecisions.ts), [contractDecisions.ts:798](src/app/contractDecisions.ts)).
- **Manual transfer** appends the event to the **source** instance ([contractDecisions.ts:831](src/app/contractDecisions.ts)).

The portfolio adapter can still collect both for now, but any future **audit / edit UI** that reconstructs "why did this contract shrink?" or "where did this capital come from?" will misplace evidence based on which code path created the event.

## Fix direction

Standardize on one ownership convention. The most intuitive is:
- **Source instance** carries the "capital left" event.
- **Target instance** carries the "capital received" event.

Or: both instances carry a symmetric pair of linked events (shared `transferId`). Pick one and apply it consistently to both paths in `contractDecisions.ts`.

## Notes

Low urgency while there is no audit/edit UI, but will become a blocker once editing of transfer history is in scope.
