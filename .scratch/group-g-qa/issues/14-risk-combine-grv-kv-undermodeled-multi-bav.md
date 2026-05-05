---
title: "RISK: Combine-mode GRV reduction and KV status only consider first bAV instance"
Status: done
Severity: risk
Area: Group G / combine simulation / engine
---

## Description

Two under-modeling issues in `useCombineSimulation.ts`:

1. **GRV reduction** uses only the first active bAV instance ([useCombineSimulation.ts:63](src/app/useCombineSimulation.ts), [useCombineSimulation.ts:72](src/app/useCombineSimulation.ts)). Users with multiple bAV contracts (Dilan, Bernd) will see incorrect GRV projections.

2. **Retirement health status** is inferred from `wsa.bav[0]?.kvdrMember` ([useCombineSimulation.ts:107](src/app/useCombineSimulation.ts)), while compare-mode uses `assumptions.statutoryPension.retirementHealthStatus` ([simulationContext.ts:256](src/engine/simulationContext.ts)). The recommender duplicates the same flawed `bav[0]` inference ([recommender.ts:397](src/app/recommender.ts)).

This is inconsistent with the compare-mode pipeline and will produce wrong outputs for:
- Dilan / Bernd: multiple bAV contracts.
- Karin / Hans-style freiwillig / PKV retirement cases where `bav[0]` is absent or not representative.

## Fix direction

- GRV reduction: aggregate the salary-sacrifice contributions across **all** active bAV instances before computing the GRV reduction.
- KV status: read `retirementHealthStatus` from the workspace's global assumptions field (aligned with how compare-mode and `simulationContext` work), not from `bav[0]`.
- Update `recommender.ts` to use the same source.
