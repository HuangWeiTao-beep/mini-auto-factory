# Final Fix Report

## Scope

- Review source: `final-review.md`
- Worktree: `.worktrees/chapter-two-order-scheduling`
- Branch: `codex/chapter-two-order-scheduling`
- Starting commit: `c914e02`
- Integration: keep the branch and worktree; no push, merge, or deployment

## Findings resolved

### P1-1: approved level matrix and bottlenecks

- Restored level 6–10 order counts to `6 / 8 / 8 / 10 / 12`.
- Restored arrival windows to `[0,24] / [0,30] / [0,34] / [0,42] / [0,50]`.
- Kept the approved deadline lead windows.
- Restored level 9 to one drill and level 10 to one coater.
- Replaced the reduced fixed-order snapshots with behavioral matrix, window, deadline, product-mix, legal-layout, and completion assertions.

### P1-2: arbitrary retry-seed solvability

- Split raw deterministic candidate construction from the public validated scenario factory.
- The public factory evaluates salted candidates with the real production tick, the supported legal layout, and an earliest-deadline-first queue.
- Candidates are returned only after all orders complete before their deadlines.
- Added bounded random attempts, controlled evenly spaced safe candidates, and a verified per-level fallback.
- The external seed remains the scenario seed and cache key. Attempt salt affects only candidate selection, so refresh/recovery is stable and retry still changes the external seed.
- Added real factory simulations for 11 retry seeds across all 5 chapter-two levels (55 scenarios), including review seeds `0`, `4`, `7`, and `11`.

### P2-3: success settlement copy

- Chapter-two success messages now state `全部订单按时完成` for intermediate and chapter-ending levels.
- Chapter-one settlement copy remains unchanged.

### P2-4: rustproof status color

- Changed rustproof order-card status color from purple `#856aa4` to green `#34734a`.
- Playwright verifies the computed border color as `rgb(52, 115, 74)` on a real rustproof order card.

### P2-5: README release status

- Replaced the unsupported merge/deployment statement with release-candidate wording for the current branch.
- The README now explicitly defers merged/deployed claims until those operations are completed and verified.

## TDD evidence

- Matrix tests first failed on `4 !== 6` and showed all five reduced configurations.
- Multi-seed production first failed on level 7 seed `0` with an overdue order.
- After restoring the matrix, fixed and varied seeds still failed until validated retry generation was implemented.
- Settlement tests first received `订单看板稳定运行` instead of the required `全部订单按时完成` copy.
- The browser color test first received `rgb(133, 106, 164)` instead of green.
- Each focused suite was rerun to green before the full verification pass.

## Verification

- Baseline `npm.cmd test`: build succeeded; 112 passed, 0 failed.
- Final `npm.cmd test`: build succeeded; 114 passed, 0 failed.
- `npm.cmd run lint`: passed.
- `npx.cmd tsc --noEmit`: passed.
- `$env:E2E_PORT='4184'; npm.cmd run test:e2e`: 9 passed, 0 failed.
- E2E port 4184: free after teardown.
- `git diff --check`: passed.

## Result

All five final-review findings are addressed. The branch remains isolated in its existing worktree and is ready for the repository owner’s later integration decision.
