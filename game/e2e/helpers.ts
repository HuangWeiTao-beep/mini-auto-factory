import { expect, type Page } from "@playwright/test";

const placementPoints = {
  source: { x: 90, y: 150 },
  cutter: { x: 300, y: 150 },
  lathe: { x: 510, y: 150 },
  drill: { x: 640, y: 150 },
  coater: { x: 640, y: 330 },
  exit: { x: 730, y: 150 },
} as const;

const machineLabels = {
  source: "钢棒源",
  cutter: "切割机",
  lathe: "车削机",
  drill: "钻孔机",
  coater: "镀层机",
  exit: "成品出口",
} as const;

const productRoutes = {
  standard: ["source", "cutter", "lathe", "exit"],
  precision: ["source", "cutter", "lathe", "drill", "exit"],
  rustproof: ["source", "cutter", "lathe", "coater", "exit"],
} as const;

export const FIXED_CHAPTER_TWO_SEEDS = {
  6: 1606,
  7: 1707,
  8: 1808,
  9: 1909,
  10: 2010,
} as const;

type MachineType = keyof typeof machineLabels;
type ProductType = keyof typeof productRoutes;

type PlacementPoint = { x: number; y: number };

type ChapterTwoSaveOptions = {
  activeLevelId: 6 | 7 | 8 | 9 | 10;
  unlockedLevel?: 6 | 7 | 8 | 9 | 10;
};

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

export async function placeMachines(
  page: Page,
  placements: Partial<Record<MachineType, PlacementPoint>>,
) {
  for (const [type, point] of Object.entries(placements) as Array<[MachineType, PlacementPoint]>) {
    await placeMachine(page, type, point);
  }
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

export async function connectProductRoutes(page: Page, products: readonly ProductType[]) {
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];

  for (const product of products) {
    const route = productRoutes[product];
    for (let index = 0; index < route.length - 1; index += 1) {
      const from = machineLabels[route[index]];
      const to = machineLabels[route[index + 1]];
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([from, to]);
    }
  }

  await connectMachines(page, pairs);
}

export async function seedChapterTwoLevel(page: Page, options: ChapterTwoSaveOptions) {
  const unlockedLevel = options.unlockedLevel ?? options.activeLevelId;
  const marker = `e2e-chapter-two-save-v2-${options.activeLevelId}-${unlockedLevel}`;

  await page.addInitScript(({ activeLevelId, unlockedLevel, marker, chapterTwoSeeds }) => {
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem("mini-factory-save", JSON.stringify({
      version: 2,
      unlockedLevel,
      activeLevelId,
      bestResults: {},
      drafts: {},
      chapterTwoSeeds,
    }));
    sessionStorage.setItem(marker, "true");
  }, {
    activeLevelId: options.activeLevelId,
    unlockedLevel,
    marker,
    chapterTwoSeeds: FIXED_CHAPTER_TWO_SEEDS,
  });
}

export async function installDeterministicClock(page: Page) {
  await page.clock.install({ time: new Date("2026-08-21T12:00:00Z") });
}

export async function advanceGameTime(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1_000);
}

export async function dismissChapterTwoOnboarding(page: Page) {
  const dialog = page.getByRole("dialog", { name: "第 6 关怎么玩" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "我明白了，开始调度" }).click();
  await expect(dialog).toBeHidden();
}

export async function paletteMachineLabels(page: Page) {
  return page.locator(".equipment-list .palette-card b").allTextContents();
}
