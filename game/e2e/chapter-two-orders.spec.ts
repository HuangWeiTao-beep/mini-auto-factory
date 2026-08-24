import { expect, test } from "@playwright/test";
import {
  advanceGameTime,
  connectProductRoutes,
  dismissChapterTwoOnboarding,
  installDeterministicClock,
  paletteMachineLabels,
  placeMachine,
  placeMachines,
  seedChapterTwoLevel,
} from "./helpers";

test("level six schedules fixed orders, keeps the line locked, and unlocks level seven", async ({ page }) => {
  await seedChapterTwoLevel(page, { activeLevelId: 6 });
  await installDeterministicClock(page);
  await page.goto("/");
  await dismissChapterTwoOnboarding(page);

  await expect.poll(() => paletteMachineLabels(page)).toEqual([
    "车削机",
    "钢棒源",
    "切割机",
    "钻孔机",
    "成品出口",
  ]);
  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 270, y: 150 },
    lathe: { x: 455, y: 150 },
    drill: { x: 270, y: 350 },
    exit: { x: 455, y: 350 },
  });
  await connectProductRoutes(page, ["standard", "precision"]);

  await page.getByRole("button", { name: "开始生产" }).click();
  await expect(page.locator(".factory-floor")).toHaveClass(/factory-floor--locked/);
  await expect(page.locator(".palette-card", { hasText: "钢棒源" })).toHaveAttribute("draggable", "false");

  await advanceGameTime(page, 11);
  await expect(page.getByTestId("order-waiting-L6-01")).toBeVisible();
  await expect(page.getByTestId("order-waiting-L6-02")).toBeVisible();
  await page.getByTestId("enqueue-order-L6-01").click();
  await page.getByTestId("enqueue-order-L6-02").click();
  await expect(page.getByTestId("order-queue-L6-01")).toContainText("#1");
  await expect(page.getByTestId("order-queue-L6-02")).toContainText("#2");

  await page.getByTestId("queue-down-L6-01").click();
  await expect(page.getByTestId("order-queue-L6-01")).toContainText("#2");
  await page.getByTestId("queue-up-L6-01").click();
  await expect(page.getByTestId("order-queue-L6-01")).toContainText("#1");
  await expect(page.getByTestId("queue-down-L6-01")).toBeEnabled();
  await page.getByTestId("enqueue-order-L6-03").click();

  await advanceGameTime(page, 6);
  await page.getByTestId("enqueue-order-L6-04").click();
  await advanceGameTime(page, 4);
  await page.getByTestId("enqueue-order-L6-05").click();
  await page.getByTestId("enqueue-order-L6-06").click();
  await advanceGameTime(page, 30);

  const successDialog = page.getByRole("dialog", { name: "第 6 关完成！" });
  await expect(successDialog).toBeVisible();
  await expect(successDialog).toContainText("全部订单按时完成");
  await expect.poll(() => page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("mini-factory-save") ?? "{}");
    return [save.version, save.unlockedLevel, save.orderScenarioSeeds?.[6]];
  })).toEqual([3, 7, 1606]);
  await page.getByRole("button", { name: "下一关" }).click();
  await expect(page.getByRole("heading", { name: "第 7 关：双线调度" })).toBeVisible();
});

test("level eight routes a fixed rustproof order through the coater branch", async ({ page }) => {
  await seedChapterTwoLevel(page, { activeLevelId: 8 });
  await installDeterministicClock(page);
  await page.goto("/");

  await expect(page.locator(".palette-card", { hasText: "镀层机" })).toBeVisible();
  await expect.poll(() => paletteMachineLabels(page)).toEqual([
    "钢棒源",
    "钻孔机",
    "成品出口",
    "切割机",
    "车削机",
    "镀层机",
  ]);
  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 270, y: 150 },
    lathe: { x: 455, y: 150 },
    drill: { x: 120, y: 350 },
    coater: { x: 300, y: 350 },
    exit: { x: 480, y: 350 },
  });
  await connectProductRoutes(page, ["standard", "precision", "rustproof"]);
  await expect(page.locator(".factory-floor .connection")).toHaveCount(7);

  await page.getByRole("button", { name: "开始生产" }).click();
  await advanceGameTime(page, 8);
  await expect(page.getByTestId("order-waiting-L8-01")).toHaveCSS(
    "border-left-color",
    "rgb(52, 115, 74)",
  );
  await page.getByTestId("enqueue-order-L8-01").click();
  await page.getByTestId("enqueue-order-L8-02").click();
  await advanceGameTime(page, 11);
  await page.getByTestId("enqueue-order-L8-03").click();
  await page.getByTestId("enqueue-order-L8-04").click();
  await advanceGameTime(page, 9);

  await expect(page.getByTestId("order-waiting-L8-05")).toContainText("防锈螺栓");
  await page.getByTestId("enqueue-order-L8-05").click();
  await advanceGameTime(page, 9);
  await expect(page.locator(".factory-floor .machine--coater")).toHaveClass(/machine--working/);
  await advanceGameTime(page, 5);

  await expect(page.getByTestId("order-completed-count")).toHaveText("5/8");
  await expect(page.locator(".order-section--completed")).toContainText("L8-05");
  await expect(page.getByTestId("order-failure")).toHaveCount(0);
});

test("an overdue fixed order names the order and product and stops production", async ({ page }) => {
  await seedChapterTwoLevel(page, { activeLevelId: 6 });
  await installDeterministicClock(page);
  await page.goto("/");
  await dismissChapterTwoOnboarding(page);

  await placeMachine(page, "source", { x: 85, y: 150 });
  await page.getByRole("button", { name: "开始生产" }).click();
  await advanceGameTime(page, 30);

  const dialog = page.getByRole("dialog", { name: "第 6 关未完成" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("订单 L6-01");
  await expect(dialog).toContainText("普通螺栓");
  await expect(dialog).toContainText("超时");
  await expect(page.getByRole("button", { name: "暂停生产" })).toHaveCount(0);

  const completionTime = await dialog.locator(".settlement-stats").getByText("完成时间").locator("..").textContent();
  await advanceGameTime(page, 5);
  await expect(dialog.locator(".settlement-stats").getByText("完成时间").locator("..")).toHaveText(completionTime ?? "");
});
