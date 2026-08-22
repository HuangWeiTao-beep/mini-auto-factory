# Task 3 Report

## Changed files

- `game/app/game/game-save.mjs`
- `game/app/game/game-save.d.mts`
- `game/app/game/game-session.mjs`
- `game/app/game/game-session.d.mts`
- `game/app/game/useGameSession.ts`
- `game/tests/game-save.test.mjs`
- `game/tests/game-session.test.mjs`

## Key interfaces and behavior

- `SAVE_VERSION` is now `2`; the canonical save shape adds `chapterTwoSeeds: Record<number, number>` and keeps the persisted level range fixed at 1-10.
- `restoreGameSession(storage, selectedLevelId)` migrates/loads the save, reuses or creates the active chapter-two seed, derives the deterministic order scenario and palette from that seed, and creates a pristine design-mode production state. A first seed is written immediately so a refresh cannot silently reroll it.
- `generateChapterTwoSeed(previousSeed, cryptoSource?)` uses `crypto.getRandomValues` when available, falls back to unsigned time plus a module-local monotonic counter when unavailable or throwing, and guarantees a retry seed differs from the previous seed even if the random source repeats.
- `resetGameSession(session, keepDesign)` retains the chapter-one reset behavior. On levels 6-10 it generates a new seed regardless of `keepDesign`, updates only the active level's seed, rebuilds the scenario, and clears every runtime production field.
- `enqueueSessionOrder(session, orderId)` and `moveSessionQueuedOrder(session, orderId, nextIndex)` delegate to the Task 2 model only in `running` mode. Invalid, design-mode, paused, and no-op requests return the original session object.
- `selectGameLevel(...)` saves the current stable session before restoring another level. This preserves a just-generated retry seed even if the user changes levels before React's persistence effect runs.
- `toPersistedGameSession(...)` and `saveGameSession(...)` carry stable progress, drafts, and seeds only. The serialized save never contains scenario palette copies, orders, queue, elapsed time, materials, lines, machines, or other in-flight production data.
- `useGameSession()` advances against `LEVELS[current.activeLevelId]` from the current session ref, persists `chapterTwoSeeds`, and exposes `enqueueOrder`, `moveOrderUp`, and `moveOrderDown`. The deterministic scenario remains available on the returned session for the chapter-two UI.
- The `.d.mts` declarations were synchronized with the v2 save/session runtime so TypeScript consumers see the new seed, scenario, and action contracts.

## Migration and random strategy

- Valid v1 JSON is normalized to v2 while preserving `unlockedLevel`, normalized `activeLevelId`, `bestResults`, and `drafts`; `chapterTwoSeeds` starts empty because v1 never owned stable chapter-two seeds.
- Invalid seed keys (outside 6-10 or non-canonical numeric keys) and values (non-integer or outside unsigned 32-bit range) are discarded individually. A malformed seed container falls back to `{}` without deleting otherwise valid player progress.
- Palette order is not stored separately. `createOrderScenario(levelId, seed)` remains the single deterministic derivation point for both the order table and equipment palette, avoiding two persisted sources of truth.
- Refresh and level switching reuse persisted seeds. Retry always replaces the active chapter-two seed. Chapter-one behavior does not acquire scenario fields in its production state.

## TDD and verification

- Save RED: focused tests initially failed on the missing v2 field, absent v1 migration, and unfiltered invalid seeds.
- Save GREEN: `node --test tests/game-save.test.mjs` — 10 passed, 0 failed.
- Session RED: the first run failed on missing session action/seed exports. A targeted mutation that removed the pre-switch save reproduced rollback from a fresh retry seed to the old persisted seed.
- Session GREEN: the new restore/reset/action flow and pre-switch save made the focused regressions pass.
- Required acceptance: `cd game && node --test tests/game-save.test.mjs tests/game-session.test.mjs` — 30 passed, 0 failed.
- Full Node regression: `cd game && node --test tests/*.test.mjs` — 105 passed, 0 failed.
- Build: `cd game && npm run build` — exit 0.
- Lint: `cd game && npm run lint` — exit 0, no lint errors.
- Type declaration check: the initial `npx tsc --noEmit` exposed four Task 3 declaration errors plus existing `MachineCard.tsx` errors. After synchronizing the save/session declarations, all Task 3 errors disappeared; seven pre-existing chapter-two UI errors remain in `MachineCard.tsx` and are outside this task.

## Self-review

- Checked every Task 3 brief item against the final diff, including the 5→6 unlock, level-10 cap, refresh stability, retry reroll, immediate level-switch race, running-save reset, and runtime-only order actions.
- Confirmed v1 migration strips any accidental v1 seed field rather than treating it as authoritative.
- Confirmed the save normalizer emits only the six canonical v2 keys and never stores the derived palette or runtime state.
- Confirmed invalid order actions preserve referential identity, preventing React pseudo-updates.
- Confirmed the animation loop resolves the level from the current session ref rather than a stale render closure.
- Confirmed the complete legacy chapter-one and chapter-two model suites pass.
- `git diff --check` reported no whitespace errors; only the repository's LF-to-CRLF checkout notices appeared.
- An external reviewer was not spawned because the task dispatch explicitly prohibited subagents; this report records the required inline self-review instead.

## Commit

- Planned commit message: `feat: persist chapter two scenarios safely`
- Pre-commit HEAD: `e6183f52d705232938c6a9e22ef5a411c09abb03`
- The created feature commit hash is supplied in the final handoff because a commit cannot contain its own hash.

## Concerns

- `npx tsc --noEmit` still exits 1 on seven pre-existing `MachineCard.tsx` issues introduced by chapter-two model types (optional machine durations, missing coater icon coverage, and order-material rendering). Task 3's save/session declaration errors are resolved; fixing the remaining UI errors would cross into Task 4+.

## Fix round 1

### Findings addressed

- Made the current in-memory stable session authoritative during level changes. `restoreGameSession(...)` now carries the complete stable draft map, and `saveGameSession(...)` returns a canonical snapshot that `selectGameLevel(...)` merges over any stale restore result before rebuilding the target scenario and pristine production state.
- Preserved a just-retried chapter-two seed and revised layout across level switches even when `setItem` throws or is absent. Storage still supplies target-level data that is not present in memory, but cannot roll back in-memory drafts, seeds, unlocks, or best results.
- Propagated the stable draft map through `toPersistedGameSession(...)` and `useGameSession()`, while keeping runtime orders, queues, timers, materials, machines, and lines outside the save boundary.
- Aligned `.d.mts` storage contracts with runtime behavior: read access is required, while `setItem` and `removeItem` are explicitly optional at the tolerant persistence boundary. `saveGameSession(...)` now declares its real `GameSaveState` return and accepts the runtime-supported persistable session shape.
- Rejected non-finite and non-integer `nextIndex` values in both `moveProductionOrder(...)` and `moveSessionQueuedOrder(...)`. Invalid moves return the exact original state/session object before reaching queue mutation.

### TDD evidence

- RED: throwing and read-only storage both rolled the retry seed from the new in-memory value back to `1606`; the revised draft was also lost after switching away and back.
- GREEN: both storage variants preserve the new seed, deterministic scenario, and revised draft across the same two-level switch sequence.
- RED: `NaN`, `-Infinity`, and `0.5` moved the second queued order to index 0 at the production/session boundary.
- GREEN: `NaN`, `Infinity`, `-Infinity`, and `0.5` all preserve referential identity at both boundaries.
- Required acceptance: `cd game && node --test tests/game-save.test.mjs tests/game-session.test.mjs` — 31 passed, 0 failed.
- Focused model/session/save coverage: `cd game && node --test tests/game-save.test.mjs tests/game-session.test.mjs tests/chapter-two-production.test.mjs` — 46 passed, 0 failed.
- Full Node regression: `cd game && node --test tests/*.test.mjs` — 107 passed, 0 failed.
- Build: `cd game && npm run build` — exit 0.
- Lint: `cd game && npm run lint` — exit 0, no lint errors.
- Type declaration check: `cd game && npx tsc --noEmit` reports only the same seven unchanged `MachineCard.tsx` Task 4 errors; no changed Task 3 declaration or Hook errors remain.
- `git diff --check` reported no whitespace errors; only the repository's LF-to-CRLF checkout notices appeared.

### Commit

- Pre-fix HEAD: `eda8fc901c7f01f6d4c10f2b10154a56b8188a1f`
- Planned fix commit message: `fix: preserve chapter two session state`
- The fix commit hash is supplied in the final handoff because a commit cannot contain its own hash.

### Remaining concerns

- The seven pre-existing `MachineCard.tsx` type errors remain intentionally deferred to Task 4; this fix round does not modify chapter-two UI.

## Fix round 2

### Finding addressed

- Made `session.drafts` a coherent authoritative snapshot whenever a design becomes persistable. `updateGameDesign(...)` now updates the active draft in design and paused modes, and both chapter-one and chapter-two `resetGameSession(...)` paths update the stable draft after keeping or clearing the layout.
- Running state still never promotes an in-flight design into the stable draft map. The subsequent running save therefore reuses the exact non-running snapshot already carried by the session instead of overwriting storage with an older entry.
- This preserves the Fix round 1 write-failure guarantee: memory remains authoritative during level switches, but its draft map is no longer stale after an ordinary successful design save.

### TDD evidence

- RED: starting with chapter-one draft A, editing to B, saving in design mode, starting production, saving in running mode, and refreshing restored A.
- GREEN: the same sequence restores B because the design edit synchronizes `session.drafts[1]` before production starts.
- Added direct assertions that clearing the layout updates the stable draft map in both chapter-one and chapter-two reset flows.
- Required acceptance: `cd game && node --test tests/game-save.test.mjs tests/game-session.test.mjs` — 32 passed, 0 failed.
- Full Node regression: `cd game && node --test tests/*.test.mjs` — 108 passed, 0 failed.
- Build: `cd game && npm run build` — exit 0.
- Lint: `cd game && npm run lint` — exit 0, no lint errors.
- `git diff --check` reported no whitespace errors; only the repository's LF-to-CRLF checkout notices appeared.

### Commit

- Pre-fix HEAD: `fccaa16f172d4d8c3fd081c6063d7b43296c40f4`
- Planned fix commit message: `fix: keep stable drafts current`
- The fix commit hash is supplied in the final handoff because a commit cannot contain its own hash.

### Remaining concerns

- The seven pre-existing `MachineCard.tsx` Task 4 type errors remain outside this session-layer fix.
