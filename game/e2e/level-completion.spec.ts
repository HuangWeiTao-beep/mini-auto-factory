import { expect, test } from "@playwright/test";
import { connectLevelOneMachines, dismissOnboarding, placeLevelOneMachines } from "./helpers";

test.setTimeout(60_000);

test("completing level one unlocks and enters level two", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await placeLevelOneMachines(page);
  await connectLevelOneMachines(page);

  await page.getByRole("button", { name: "开始生产" }).click();

  await expect(page.getByRole("dialog", { name: "第 1 关完成！" })).toBeVisible({ timeout: 50_000 });
  await page.getByRole("button", { name: "下一关" }).click();
  await expect(page.getByRole("heading", { name: "第 2 关：钻孔定位" })).toBeVisible();
});
