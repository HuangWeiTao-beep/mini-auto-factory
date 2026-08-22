import { expect, test } from "@playwright/test";
import {
  advanceGameTime,
  connectMachines,
  connectProductRoutes,
  dismissChapterTwoOnboarding,
  installDeterministicClock,
  paletteMachineLabels,
  placeMachine,
  placeMachines,
  seedChapterTwoLevel,
} from "./helpers";

test("locked levels cannot be selected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "我明白了，开始设计" }).click();
  await page.getByRole("button", { name: "打开关卡选择" }).click();

  const levelTwo = page.locator(".level-option", { hasText: "第 2 关" });
  await expect(levelTwo).toBeDisabled();
  await expect(page.getByRole("heading", { name: "第 1 关：螺栓生产" })).toBeVisible();
});

test("refresh restores a level-two draft saved through the UI without reopening level-one onboarding", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-level-two-unlocked")) return;
    localStorage.setItem("mini-factory-save", JSON.stringify({
      version: 2,
      unlockedLevel: 2,
      activeLevelId: 1,
      bestResults: {},
      drafts: {},
      chapterTwoSeeds: {},
    }));
    sessionStorage.setItem("e2e-level-two-unlocked", "true");
  });

  await page.goto("/");
  await page.getByRole("button", { name: "我明白了，开始设计" }).click();
  await page.getByRole("button", { name: "打开关卡选择" }).click();
  await page.locator(".level-option", { hasText: "第 2 关" }).click();
  await expect(page.getByRole("heading", { name: "第 2 关：钻孔定位" })).toBeVisible();

  await placeMachine(page, "source", { x: 85, y: 150 });
  await placeMachine(page, "cutter", { x: 270, y: 150 });
  await placeMachine(page, "lathe", { x: 455, y: 150 });
  await placeMachine(page, "drill", { x: 640, y: 150 });
  await placeMachine(page, "exit", { x: 455, y: 360 });
  await connectMachines(page, [
    ["钢棒源", "切割机"],
    ["切割机", "车削机"],
    ["车削机", "钻孔机"],
    ["钻孔机", "成品出口"],
  ]);

  const sourceStyle = await page.locator(".factory-floor .machine--source").getAttribute("style");
  await expect.poll(() => page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("mini-factory-save") ?? "{}");
    return [save.activeLevelId, save.drafts?.[2]?.connections?.length ?? 0];
  })).toEqual([2, 4]);

  await expect(page.locator(".factory-floor .machine")).toHaveCount(5);
  await expect(page.getByRole("dialog", { name: "第 1 关怎么玩" })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "第 2 关：钻孔定位" })).toBeVisible();
  await expect(page.locator(".factory-floor .machine")).toHaveCount(5);
  await expect(page.locator(".factory-floor .connection")).toHaveCount(4);
  await expect(page.locator(".factory-floor .machine--source")).toHaveAttribute("style", sourceStyle ?? "");
  await expect(page.getByRole("dialog", { name: "第 1 关怎么玩" })).toBeHidden();
});

test("refresh keeps a level-six draft and palette seed but resets live order state", async ({ page }) => {
  await seedChapterTwoLevel(page, { activeLevelId: 6 });
  await installDeterministicClock(page);
  await page.goto("/");
  await dismissChapterTwoOnboarding(page);

  const expectedPalette = ["车削机", "钢棒源", "切割机", "钻孔机", "成品出口"];
  await expect.poll(() => paletteMachineLabels(page)).toEqual(expectedPalette);

  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 270, y: 150 },
    lathe: { x: 455, y: 150 },
    drill: { x: 270, y: 350 },
    exit: { x: 455, y: 350 },
  });
  await connectProductRoutes(page, ["standard", "precision"]);

  const sourceStyle = await page.locator(".factory-floor .machine--source").getAttribute("style");
  await expect.poll(() => page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("mini-factory-save") ?? "{}");
    return [save.version, save.activeLevelId, save.drafts?.[6]?.connections?.length ?? 0, save.chapterTwoSeeds?.[6]];
  })).toEqual([2, 6, 5, 1606]);

  await page.getByRole("button", { name: "开始生产" }).click();
  await advanceGameTime(page, 11);
  await page.getByTestId("enqueue-order-L6-01").click();
  await page.getByTestId("enqueue-order-L6-02").click();
  await advanceGameTime(page, 2);
  await expect(page.getByTestId("order-current")).toContainText("L6-01");
  await expect(page.getByTestId("order-queue-L6-02")).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "第 6 关：订单看板" })).toBeVisible();
  await expect(page.getByText("设计模式", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始生产" })).toBeVisible();
  await expect(page.locator(".factory-floor")).not.toHaveClass(/factory-floor--locked/);
  await expect(page.locator(".factory-floor .machine")).toHaveCount(5);
  await expect(page.locator(".factory-floor .connection")).toHaveCount(5);
  await expect(page.locator(".factory-floor .machine--source")).toHaveAttribute("style", sourceStyle ?? "");
  await expect.poll(() => paletteMachineLabels(page)).toEqual(expectedPalette);
  await expect(page.locator('[data-testid^="order-queue-"]')).toHaveCount(0);
  await expect(page.getByTestId("order-current").locator(".order-card")).toHaveCount(0);
  await expect(page.locator(".material-dot")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "第 1 关怎么玩" })).toBeHidden();
});
