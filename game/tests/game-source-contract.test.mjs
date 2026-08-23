import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the game exposes all machines and production controls", async () => {
  const source = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );
  for (const label of [
    "钢棒源",
    "切割机",
    "车削机",
    "成品出口",
    "开始生产",
    "暂停生产",
    "重新设计",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("the game source exposes chapter selection, drilling and level-aware targets", async () => {
  const [source, levelSelect, sessionHook] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/useGameSession.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /LevelSelectModal/);
  assert.match(source, /钻孔机/);
  assert.match(source, /unlockedLevel/);
  assert.match(sessionHook, /LEVELS/);
  assert.match(source, /disabled=\{locked\}/);
  assert.match(levelSelect, /尚未解锁/);
});

test("the interaction layer includes drag, connection, warning and settlement flows", async () => {
  const [game, floor, machine, sessionHook] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/useGameSession.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sessionHook, /requestAnimationFrame/);
  assert.match(game, /平均产量/);
  assert.match(game, /返回关卡选择/);
  assert.match(floor, /onDrop/);
  assert.match(floor, /connectDevices|onConnect/);
  assert.match(machine, /draggable/);
  assert.match(machine, /输入端口/);
  assert.match(machine, /输出端口/);
});

test("the floor source renders obstacles, branch labels and transport duration", async () => {
  const floor = await readFile(
    new URL("../app/game/FactoryFloor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(floor, /obstacles/);
  assert.match(floor, /branchIndex/);
  assert.match(floor, /transportDuration/);
  assert.match(floor, /outgoing\(design, connection\.from\)\.length > 1/);
  assert.doesNotMatch(floor, /const showsBranchLabel = level\.id === 3 \|\| level\.id === 5/);
});

test("distance duration labels stay visible above compact machine cards", async () => {
  const [floor, styles] = await Promise.all([
    readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/game.css", import.meta.url), "utf8"),
  ]);
  const machineRule = styles.match(/\.machine\s*\{([^}]*)\}/)?.[1] ?? "";
  const labelLayerRule = styles.match(/\.connection-label-layer\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(floor, /className="connection-label-layer"/);
  assert.match(floor, /className="connection-duration-label"/);
  assert.doesNotMatch(floor, /<g className="connection-duration-label"/);
  assert.equal(Number(machineRule.match(/width:\s*(\d+)px/)?.[1]), 154);
  assert.equal(Number(machineRule.match(/min-height:\s*(\d+)px/)?.[1]), 132);
  assert.equal(Number(labelLayerRule.match(/z-index:\s*(\d+)/)?.[1]) > 3, true);
});

test("the feedback bar distinguishes quality, blocked targets and routing waits", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(game, /质量拒收/);
  assert.match(game, /目标设备阻塞/);
  assert.match(game, /分支 .* 正在等待/);
});

test("capacity and routing feedback tells the player what action to take next", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(game, /加工位与等待位已满，物料停在线上。请暂停后检查下游节拍或调整布局。/);
  assert.match(game, /轮到的线路被占用，物料保留且不会跳过。请等待支路清空，或暂停后调整支路负载。/);
});

test("critical controls keep keyboard cancellation, modal focus and running-state locks", async () => {
  const [game, levelSelect, floor, machine] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/MachineCard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(game, /event\.key === "Escape"\) setConnectingFrom\(null\)/);
  assert.match(game, /role="status" aria-live="polite"/);
  assert.match(game, /role="dialog" aria-modal="true" aria-labelledby="onboarding-title"/);
  assert.match(game, /role="dialog" aria-modal="true" aria-labelledby="settlement-title"/);
  assert.match(game, /autoFocus/);
  assert.match(levelSelect, /role="dialog" aria-modal="true" aria-labelledby="level-select-title"/);
  assert.match(levelSelect, /aria-label="关闭关卡选择"[^>]*autoFocus/);
  assert.match(floor, /ESC 取消/);
  assert.match(machine, /draggable=\{!locked\}/);
  assert.match(machine, /disabled=\{locked\}/);
});

test("settlement UI consumes the evaluated message and next-level action", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(game, /level\.routeHint/);
  assert.match(game, /state\.completed\} \/ \{level\.target/);
  assert.match(game, /getSuccessSettlement\(level, maxLevelId\)/);
  assert.match(game, /successSettlement\.message/);
  assert.match(game, /const nextLevelId = successSettlement\.nextLevelId/);
  assert.match(game, /state\.mode === "success" && nextLevelId/);
  assert.match(game, /selectLevel\(nextLevelId\)/);
});

test("completed levels expose their best time and success settlement calls out a new record", async () => {
  const [game, levelSelect, session] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/game-session.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(levelSelect, /bestResults/);
  assert.match(levelSelect, /最佳纪录/);
  assert.match(levelSelect, /bestResult\.elapsed\.toFixed\(1\)/);
  assert.match(game, /bestResults=\{bestResults\}/);
  assert.match(game, /本次刷新纪录/);
  assert.match(session, /recordBestResult\(session\.bestResults, session\.activeLevelId/);
});

test("failure settlement consumes the direct diagnostic policy before the route fallback", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    game,
    /getFailureDiagnostic\(\s*state\.warning,\s*contextualFeedback\?\.message,\s*level\.routeHint,\s*state\.failure,?\s*\)/,
  );
});

test("successful paused design edits flow into the restart-production action label", async () => {
  const [game, session] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/game-session.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(session, /markDesignEdited\(\s*session\.state\.mode,\s*session\.editedWhilePaused,\s*session\.design,\s*nextDesign,?\s*\)/);
  assert.match(game, /getProductionActionLabel\(state\.mode, editedWhilePaused\)/);
  assert.match(session, /startProduction\(session\.state, \{\s*edited: session\.editedWhilePaused,\s*design: session\.design,\s*level,?\s*\}\)/);
});

test("obstacles stay above overlapping adjacent machine footprints", async () => {
  const styles = await readFile(
    new URL("../app/game/game.css", import.meta.url),
    "utf8",
  );
  const obstacleRule = styles.match(/\.floor-obstacle\s*\{([^}]*)\}/)?.[1] ?? "";
  const machineRule = styles.match(/\.machine\s*\{([^}]*)\}/)?.[1] ?? "";
  const obstacleZ = Number(obstacleRule.match(/z-index:\s*(\d+)/)?.[1]);
  const machineZ = Number(machineRule.match(/z-index:\s*(\d+)/)?.[1]);

  assert.equal(Number.isFinite(obstacleZ), true);
  assert.equal(Number.isFinite(machineZ), true);
  assert.equal(obstacleZ > machineZ, true);
});

test("machine cards use snapped grid coordinates for their visual position", async () => {
  const machine = await readFile(
    new URL("../app/game/MachineCard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(machine, /left:\s*device\.gridX\s*\*\s*GRID\.cellSize/);
  assert.match(machine, /top:\s*device\.gridY\s*\*\s*GRID\.cellSize/);
  assert.doesNotMatch(machine, /left:\s*device\.x|top:\s*device\.y/);
});

test("connection ports and labels share the snapped machine geometry", async () => {
  const floor = await readFile(
    new URL("../app/game/FactoryFloor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(floor, /from\.gridX\s*\*\s*GRID\.cellSize/);
  assert.match(floor, /from\.gridY\s*\*\s*GRID\.cellSize/);
  assert.match(floor, /to\.gridX\s*\*\s*GRID\.cellSize/);
  assert.match(floor, /to\.gridY\s*\*\s*GRID\.cellSize/);
  assert.doesNotMatch(floor, /from\.x|from\.y|to\.x|to\.y/);
});

test("chapter two exposes a pure order panel with stable accessible queue controls", async () => {
  const [game, orderPanel] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/OrderPanel.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["待排订单", "生产队列", "当前投料", "已完成"]) {
    assert.match(orderPanel, new RegExp(label));
  }
  for (const testId of [
    "order-waiting-",
    "order-queue-",
    "queue-up-",
    "queue-down-",
    "order-current",
    "order-completed-count",
    "order-failure",
  ]) {
    assert.match(orderPanel, new RegExp(testId));
  }
  for (const buttonName of ["加入生产队列", "上移订单", "下移订单"]) {
    assert.match(orderPanel, new RegExp(`aria-label=.*${buttonName}`));
  }
  assert.match(orderPanel, /剩余不足 6 秒/);
  assert.doesNotMatch(orderPanel, /useGameSession|game-session|saveGameSession|enqueueProductionOrder|moveProductionOrder/);
  assert.match(game, /<OrderPanel/);
  assert.match(game, /actionsEnabled=\{state\.mode === "running"\}/);
});

test("chapter two uses scenario palette order and chapter-aware level copy", async () => {
  const [game, machine, levelSelect] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(game, /scenario\?\.paletteTypes \?\? level\.paletteTypes/);
  assert.match(game, /CHAPTER THREE/);
  assert.match(game, /level\.chapter === 1 \? "ONE" : "TWO"/);
  assert.match(game, /getSuccessSettlement\(level, maxLevelId\)/);
  assert.match(machine, /coater:\s*"◌"/);
  assert.match(machine, /镀层成为防锈螺栓/);
  assert.match(levelSelect, /第一章：产线基础/);
  assert.match(levelSelect, /第二章：订单调度/);
  assert.match(levelSelect, /level\.orderConfig\.orderCount/);
  assert.match(levelSelect, /交付窗口/);
});

test("level six includes one-time order scheduling guidance", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(game, /第 6 关怎么玩/);
  assert.match(game, /订单到达/);
  assert.match(game, /加入队列/);
  assert.match(game, /投料后锁定/);
  assert.match(game, /截止时间/);
  assert.match(game, /shownChapterTwoOnboarding/);
});

test("chapter three has its own map range and order-aware mission copy", async () => {
  const [game, levelSelect] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(levelSelect, /第三章：设备可靠性/);
  assert.match(levelSelect, /levelId >= 11 && levelId <= 15/);
  assert.match(levelSelect, /levelId >= 6 && levelId <= 10/);
  assert.match(levelSelect, /if \(level\.orderConfig\)/);
  assert.match(game, /isOrderSchedulingLevel\(level\)/);
  assert.doesNotMatch(game, /level\.chapter === 2/);
  assert.match(game, /CHAPTER THREE/);
});

test("level eleven offers one-time reliability guidance with the full maintenance rules", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(game, /activeLevelId === 1 \|\| activeLevelId === 6 \|\| activeLevelId === 11/);
  assert.match(game, /shownChapterThreeOnboarding/);
  assert.match(game, /levelId === 11 && !shownChapterThreeOnboarding\.current/);
  assert.doesNotMatch(game, /restored\.activeLevelId === 11/);
  assert.match(game, /第 11 关怎么玩/);
  assert.match(game, /每完成一次加工周期/);
  assert.match(game, /60%.*预警/);
  assert.match(game, /85%.*高危.*20%/);
  assert.match(game, /100%.*故障/);
  assert.match(game, /完成当前物料.*停止接料/);
  assert.match(game, /全厂只有一支维修队/);
});
