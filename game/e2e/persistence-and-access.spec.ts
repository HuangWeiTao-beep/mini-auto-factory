import { expect, test } from "@playwright/test";
import { connectMachines, placeMachine } from "./helpers";

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
      version: 1,
      unlockedLevel: 2,
      activeLevelId: 1,
      bestResults: {},
      drafts: {},
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
