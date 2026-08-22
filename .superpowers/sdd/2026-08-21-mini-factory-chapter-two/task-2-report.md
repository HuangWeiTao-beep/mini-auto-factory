# Task 2 Report

## Changed files

- `game/app/game/factory-model.mjs`
- `game/app/game/factory-model.d.mts`
- `game/app/game/feedback-policy.mjs`
- `game/app/game/feedback-policy.d.mts`
- `game/tests/factory-model.test.mjs`
- `game/tests/chapter-two-production.test.mjs`

## Key interfaces and behavior

- `createProductionState(design, level, scenario)` keeps the legacy chapter-one state shape unchanged and adds chapter-two `orders`, `queue`, `completedOrderIds`, `failure`, `scenarioSeed`, and `scenarioLevelId` fields only for order-scheduling levels.
- `enqueueProductionOrder(state, orderId)` is the model-owned `waiting -> queued` transition. Invalid IDs and every other order status return the original state object.
- `moveProductionOrder(state, orderId, nextIndex)` reorders only orders whose runtime status is `queued`; scheduled, waiting, in-production, completed, and overdue orders return the original state object.
- Chapter-two material payloads carry `orderId`, `productId`, and `recipeStepIndex` from source launch through transport and machine buffers.
- Chapter-two routing selects the next device from `PRODUCTS[productId].route`; machine completion advances `recipeStepIndex`. Legacy chapter-one `rod/blank/undrilledBolt/bolt` output behavior remains on its original tick path.
- Chapter-two source emission is queue-gated and removes only the head order while marking it `inProduction`.
- Exit settlement validates order identity and the complete recipe before marking an order complete. Wrong machines, skipped operations, and product mismatches stay uncounted and produce a next-operation diagnostic.
- Each chapter-two tick activates arrivals, advances production and settles deliveries, then checks deadlines. Delivery exactly at `deadlineAt` succeeds; an unfinished due order immediately sets `mode: "failure"`, marks due orders overdue, and records `{ orderId, productId, overdueSeconds }`.
- `getFailureDiagnostic(...)` accepts an optional structured order failure and formats it ahead of legacy contextual feedback, warnings, and route hints.
- A chapter-two state without initialized orders remains in design mode when started, preserving the Task 2/Task 3 boundary until session-level scenario wiring is implemented.

## TDD and test results

- RED: the first focused run failed because `enqueueProductionOrder` was not exported and overdue failure details did not override legacy feedback.
- GREEN: recipe-aware runtime, queue APIs, deadline ordering, and failure formatting made the new focused behaviors pass.
- Debugging pass: the fixed-seed regression first exposed a test fixture with a 2.5-second `drill -> exit` transport. The fixture was corrected to minimum modeled transport, after which levels 6-10 all completed under deadline-first scheduling.
- Required command: `cd game && node --test tests/factory-model.test.mjs tests/chapter-two-production.test.mjs` — 44 passed, 0 failed.
- Lint: `cd game && npm run lint` — exit 0, no lint errors.
- Full build and regression suite: `cd game && npm test` — build succeeded; 96 passed, 0 failed.

## Self-review

- Confirmed the no-argument `createProductionState(design)` return object remains exactly equal to the chapter-one contract and the full chapter-one timing/routing suite passes.
- Confirmed source queue gating, head-only launch, queue removal, and `inProduction` locking are asserted through public model APIs.
- Confirmed ordinary, precision, and rustproof products complete through lathe/exit, drill/exit, and coater/exit respectively.
- Confirmed coating bypass and product identity mismatch do not increment completion and identify the expected next operation.
- Confirmed delivery and deadline settlement ordering at the exact timestamp, plus immediate structured overdue failure.
- Confirmed deterministic levels 6-10 complete with deadline-first queueing while a deliberately wrong priority misses its urgent order.
- Confirmed no save, React UI, session action, publishing, merge, or Task 3+ implementation was added.
- `git diff --check` reported no whitespace errors; only the repository's existing LF-to-CRLF checkout notices appeared.

## Commit

- Planned commit message: `feat: run recipe-aware order production`
- Pre-commit HEAD: `de665b0e588dea8b58f85f1005e197caaa412d91`
- The created feature commit hash is supplied in the final handoff because a commit cannot contain its own hash.

## Concerns

- None after Fix round 1. The original physical-layout feasibility concern was resolved by recalibrating scenario deadlines and replacing the overlapping fixture with a legal distance-aware layout.

## Fix round 1

### Findings addressed

- Recalibrated `ORDER_SCENARIO_RULES` deadline lead windows to the chapter-two design ranges: level 6 `[22, 22]`, level 7 `[18, 26]`, level 8 `[24, 32]`, level 9 `[22, 34]`, and level 10 `[20, 32]`.
- Updated deterministic order snapshots and level configuration assertions for the new fixed-seed deadlines.
- Replaced the overlapping completion fixture with a compact layout whose devices are all added and revalidated through `canPlaceDevice`, stay inside the player-reachable bounds, avoid configured obstacle cells, and do not overlap.
- Kept distance transport intact: distance-mode fixture connections explicitly assert a transport duration of at least two seconds, and levels 6-10 still complete with deadline-first scheduling.
- Changed chapter-two paused-edit restart to regenerate a pristine scenario from the existing `scenarioSeed`, clearing runtime statuses, queue, completion, failure, sources, lines, and machine buffers while preserving deterministic order identity.
- Added a regression that launches an order, pauses, edits, and restarts, then asserts the exact initial scenario is restored with no orphaned `inProduction` order.

### TDD evidence

- RED: the legal-layout fixed-seed test failed at level 7 under the old deadline windows, and the paused-edit regression retained `L6-01` as `inProduction` with no material.
- GREEN: the calibrated windows plus same-seed scenario regeneration made both regressions pass.
- Focused command: `cd game && node --test tests/factory-model.test.mjs tests/chapter-two-production.test.mjs` — 45 passed, 0 failed.
- Deterministic scenario command: `cd game && node --test tests/order-scheduling.test.mjs` — 7 passed, 0 failed.
- Lint: `cd game && npm run lint` — exit 0, no lint errors.
- Full build and regression suite: `cd game && npm test` — build succeeded; 97 passed, 0 failed.
- `git diff --check` reported no whitespace errors; only LF-to-CRLF checkout notices appeared.

### Commit

- Pre-fix HEAD: `24674afa2bf92f3c43a0d5dfa159eabd94115882`
- Fix-round commit hash is supplied in the final handoff because a commit cannot contain its own hash.

### Remaining concerns

- None.
