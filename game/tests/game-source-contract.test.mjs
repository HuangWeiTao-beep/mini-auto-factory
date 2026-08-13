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

test("the interaction layer includes drag, connection, warning and settlement flows", async () => {
  const [game, floor, machine] = await Promise.all([
    readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/MachineCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(game, /requestAnimationFrame/);
  assert.match(game, /平均产量/);
  assert.match(game, /下一关（V0\.1 未开放）/);
  assert.match(floor, /onDrop/);
  assert.match(floor, /connectDevices|onConnect/);
  assert.match(machine, /draggable/);
  assert.match(machine, /输入端口/);
  assert.match(machine, /输出端口/);
});
