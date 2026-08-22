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

- Fixed-seed completion tests intentionally use minimum modeled transport distance to isolate production and scheduling semantics. The current Task 1 deadline windows are shorter than the lower bound of some fully non-overlapping distance-mode layouts (especially an urgent level-10 precision order), so physical-layout feasibility should be recalibrated with scenario timing before chapter-two UI/E2E acceptance. No Task 1 scenario constants were changed in this task.
