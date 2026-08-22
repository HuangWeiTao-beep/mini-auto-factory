import assert from "node:assert/strict";
import test from "node:test";

import {
  LEVELS,
  addDevice,
  connectDevices,
  createEmptyDesign,
  moveDevice,
} from "../app/game/factory-model.mjs";

test("device and connection edits after pause change the action to restart production", async () => {
  const controls = await import("../app/game/production-controls.mjs").catch(() => ({}));
  assert.equal(
    typeof controls.markDesignEdited,
    "function",
    "paused design events must update the production control state",
  );
  assert.equal(
    typeof controls.getProductionActionLabel,
    "function",
    "the primary action must expose a mode-aware label",
  );

  let design = createEmptyDesign();
  design = addDevice(design, "source", 36, 36, "source");
  design = addDevice(design, "cutter", 72, 36, "cutter");

  const movedDesign = moveDevice(design, "cutter", 108, 36);
  const editedAfterMove = controls.markDesignEdited(
    "paused",
    false,
    design,
    movedDesign,
  );
  assert.equal(controls.getProductionActionLabel("paused", editedAfterMove), "重新开始生产");

  const connectedDesign = connectDevices(design, "source", "cutter", LEVELS[1]);
  const editedAfterConnection = controls.markDesignEdited(
    "paused",
    false,
    design,
    connectedDesign,
  );
  assert.equal(controls.getProductionActionLabel("paused", editedAfterConnection), "重新开始生产");
});

test("unchanged pause resumes while a fresh attempt starts production", async () => {
  const controls = await import("../app/game/production-controls.mjs").catch(() => ({}));
  assert.equal(typeof controls.getProductionActionLabel, "function");

  assert.equal(controls.getProductionActionLabel("paused", false), "继续生产");
  assert.equal(controls.getProductionActionLabel("design", false), "开始生产");
  const unchangedDesign = {};
  assert.equal(
    controls.markDesignEdited("paused", false, unchangedDesign, unchangedDesign),
    false,
  );
});

test("chapter boundary settlements keep completion copy and expose only valid next actions", async () => {
  const controls = await import("../app/game/production-controls.mjs").catch(() => ({}));
  assert.equal(
    typeof controls.getSuccessSettlement,
    "function",
    "success settlement behavior must be evaluated rather than source-matched",
  );

  assert.deepEqual(controls.getSuccessSettlement(LEVELS[5], 10), {
    message: "工坊验收稳定运行，第一章全部验收通过。第 6 关已解锁。",
    nextLevelId: 6,
  });
  assert.deepEqual(controls.getSuccessSettlement(LEVELS[6], 10), {
    message: "订单看板全部订单按时完成，第 7 关已解锁。",
    nextLevelId: 7,
  });
  assert.deepEqual(controls.getSuccessSettlement(LEVELS[10], 10), {
    message: "总装排程全部订单按时完成，第二章全部验收通过。",
    nextLevelId: null,
  });
});
