import { expect, type Page } from "@playwright/test";

const placementPoints = {
  source: { x: 90, y: 150 },
  cutter: { x: 300, y: 150 },
  lathe: { x: 510, y: 150 },
  drill: { x: 640, y: 150 },
  exit: { x: 730, y: 150 },
} as const;

const machineLabels = {
  source: "钢棒源",
  cutter: "切割机",
  lathe: "车削机",
  drill: "钻孔机",
  exit: "成品出口",
} as const;

type MachineType = keyof typeof machineLabels;

type PlacementPoint = { x: number; y: number };

export async function dismissOnboarding(page: Page) {
  const dialog = page.getByRole("dialog", { name: "第 1 关怎么玩" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "我明白了，开始设计" }).click();
  await expect(dialog).toBeHidden();
}

export async function placeLevelOneMachines(page: Page) {
  for (const type of ["source", "cutter", "lathe", "exit"] as const) {
    await placeMachine(page, type, placementPoints[type]);
  }
}

export async function placeMachine(page: Page, type: MachineType, targetPosition: PlacementPoint) {
  const floor = page.locator(".factory-floor");
  await page.locator(".palette-card", { hasText: machineLabels[type] }).dragTo(floor, { targetPosition });
  await expect(floor.locator(`.machine--${type}`)).toHaveCount(1);
}

export async function connectLevelOneMachines(page: Page) {
  await connectMachines(page, [
    ["钢棒源", "切割机"],
    ["切割机", "车削机"],
    ["车削机", "成品出口"],
  ]);
}

export async function connectMachines(page: Page, pairs: Array<[string, string]>) {
  for (const [from, to] of pairs) {
    await page.getByRole("button", { name: `${from}输出端口` }).click();
    await page.getByRole("button", { name: `${to}输入端口` }).click();
  }

  await expect(page.locator(".factory-floor .connection")).toHaveCount(pairs.length);
}
