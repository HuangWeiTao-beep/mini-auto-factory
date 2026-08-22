# Task 1 Report

## Changed files

- `game/app/game/order-scheduling.mjs`
- `game/app/game/order-scheduling.d.mts`
- `game/app/game/factory-model.mjs`
- `game/app/game/factory-model.d.mts`
- `game/tests/order-scheduling.test.mjs`
- `game/tests/factory-model.test.mjs`

## Key interfaces

- `PRODUCTS`: chapter-two product catalog with stable IDs, labels, aria labels, color tokens, and route definitions.
- `ORDER_SCENARIO_RULES`: frozen per-level order generation config for levels 6-10.
- `createSeededRandom(seed)`: deterministic PRNG with no `Math.random` dependency.
- `createOrderScenario(levelId, seed)`: deterministic scenario builder returning shuffled palette order, scheduled orders, and queue state.
- `shufflePaletteTypes(paletteTypes, seed)`: deterministic palette permutation helper.
- `activateArrivedOrders(scenario, elapsed)`: immutable status promotion from `scheduled` to `waiting`.
- `enqueueWaitingOrder(scenario, orderId)`: immutable queue append plus `waiting -> queued`.
- `moveQueuedOrder(scenario, orderId, nextIndex)`: immutable queue reorder helper.
- `isOrderSchedulingLevel(levelOrId)`: explicit chapter-two discriminator for callers.
- `getAllowedPaletteTypes(level)`: explicit palette helper for later UI/session consumers.

## Test command and result

- Command: `cd game && node --test tests/order-scheduling.test.mjs tests/factory-model.test.mjs`
- Result on 2026-08-22: 37 tests passed, 0 failed.

## Self-review

- Confirmed TDD red step first: initial run failed on missing `order-scheduling.mjs` and missing `factory-model` exports.
- Kept `createProductionState(design)` signature and return contract intact for chapter-one callers.
- Preserved chapter-one level 1-5 values and assertions while extending unlock cap and explicit level metadata.
- Ensured chapter-two domain code stays data-only: no React, no storage, no `Math.random`, no runtime save/archive behavior.
- Locked deterministic seeds in tests so later changes to order generation or palette shuffling surface immediately.

## Commit hash

- Feature commit: `44dc7b16ec2378b0d7f90d279e3ddbe87bca7a64`

## Concerns

- `coater` is now modeled in metadata and level definitions, but chapter-two runtime material flow is intentionally not implemented in Task 1; later tasks still need to decide how coated output integrates with production execution and persistence.

## Fix round 1

### Findings addressed

- Blocked chapter-two levels from entering or advancing through the legacy chapter-one production loop by guarding `startProduction(...)` and `advanceProduction(...)` when `level.mode === "orderScheduling"`.
- Expanded save validation to accept and normalize unlocked/active levels up to the current max level derived from `LEVELS`, so 6-10 progression survives persistence.
- Synced `factory-model.d.mts` so `OrderConfig` now declares the runtime `paletteTypes` field.

### Additional files touched

- `game/app/game/game-save.mjs`
- `game/tests/game-session.test.mjs`
- `game/tests/game-save.test.mjs`

### Verification

- Command: `cd game && node --test tests/factory-model.test.mjs tests/game-session.test.mjs tests/game-save.test.mjs`
- Result on 2026-08-22: 53 tests passed, 0 failed.
- Command: `cd game && node --test tests/order-scheduling.test.mjs tests/factory-model.test.mjs tests/game-session.test.mjs tests/game-save.test.mjs`
- Result on 2026-08-22: 60 tests passed, 0 failed.

### Notes

- This safety boundary intentionally keeps chapter-two sessions in design mode until Task 2 provides the real order-scheduling runtime.
