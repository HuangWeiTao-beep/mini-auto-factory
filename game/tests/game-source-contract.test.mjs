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
  const [source, levelSelect] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/LevelSelectModal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /LevelSelectModal/);
  assert.match(source, /钻孔机/);
  assert.match(source, /unlockedLevel/);
  assert.match(source, /LEVELS/);
  assert.match(source, /disabled=\{locked\}/);
  assert.match(levelSelect, /尚未解锁/);
});

test("the interaction layer includes drag, connection, warning and settlement flows", async () => {
  const [game, floor, machine] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/MachineCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(game, /requestAnimationFrame/);
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

test("settlement copy follows the active level and level five has no next-level action", async () => {
  const game = await readFile(
    new URL("../app/game/MiniFactoryGame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(game, /level\.routeHint/);
  assert.match(game, /state\.completed\} \/ \{level\.target/);
  assert.match(game, /第 \$\{activeLevelId \+ 1\} 关已解锁/);
  assert.match(game, /第一章全部验收通过/);
  assert.match(game, /const hasNextLevel = activeLevelId < 5/);
  assert.match(game, /state\.mode === "success" && hasNextLevel/);
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
