import assert from "node:assert/strict";
import test from "node:test";

import {
  GRID,
  isObstaclePlacement,
  manhattanDistance,
  snapToGrid,
} from "../app/game/factory-grid.mjs";
import { LEVELS, getTransportDuration } from "../app/game/factory-model.mjs";

test("level four uses grid distance while level two keeps fixed transport", () => {
  assert.equal(
    getTransportDuration(
      LEVELS[2],
      { gridX: 1, gridY: 1 },
      { gridX: 8, gridY: 4 },
    ),
    0.5,
  );
  assert.equal(
    getTransportDuration(
      LEVELS[4],
      { gridX: 1, gridY: 1 },
      { gridX: 8, gridY: 4 },
    ),
    5,
  );
});

test("grid helpers snap positions and reject only obstacle placement", () => {
  assert.deepEqual(snapToGrid(74, 109), { gridX: 2, gridY: 3 });
  assert.equal(
    isObstaclePlacement(LEVELS[4], { gridX: 7, gridY: 3 }),
    true,
  );
  assert.equal(
    manhattanDistance({ gridX: 1, gridY: 1 }, { gridX: 4, gridY: 3 }),
    5,
  );
});

test("the level-four obstacle cells remain valid grid coordinates", () => {
  for (const obstacle of LEVELS[4].obstacles) {
    assert.equal(obstacle.gridX >= 0 && obstacle.gridX < GRID.columns, true);
    assert.equal(obstacle.gridY >= 0 && obstacle.gridY < GRID.rows, true);
  }
});
