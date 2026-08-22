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
