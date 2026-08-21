import { expect, test } from "@playwright/test";
import { connectLevelOneMachines, dismissOnboarding, placeLevelOneMachines } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("a player can place, connect, pause, edit, and restart a level-one line", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await placeLevelOneMachines(page);
  await connectLevelOneMachines(page);

  await page.getByRole("button", { name: "开始生产" }).click();
  await expect(page.getByRole("button", { name: "暂停生产" })).toBeVisible();
  await expect(page.locator(".factory-floor")).toHaveClass(/factory-floor--locked/);

  await page.getByRole("button", { name: "暂停生产" }).click();
  const source = page.locator(".machine--source");
  const previousStyle = await source.getAttribute("style");
  await source.dragTo(page.locator(".factory-floor"), {
    targetPosition: { x: 90, y: 410 },
  });

  await expect(source).not.toHaveAttribute("style", previousStyle ?? "");
  await expect(page.getByRole("button", { name: "重新开始生产" })).toBeVisible();
  await page.getByRole("button", { name: "重新开始生产" }).click();
  await expect(page.getByRole("button", { name: "暂停生产" })).toBeVisible();
});
