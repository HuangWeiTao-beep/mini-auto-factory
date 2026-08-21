import { expect, test } from "@playwright/test";

test("a new player can dismiss the level-one onboarding before designing", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "第 1 关怎么玩" })).toBeVisible();
  await page.getByRole("button", { name: "我明白了，开始设计" }).click();

  await expect(page.getByRole("dialog", { name: "第 1 关怎么玩" })).toBeHidden();
  await expect(page.getByText("把设备拖到这里")).toBeVisible();
});
