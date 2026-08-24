import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  advanceGameTime,
  connectProductRoutes,
  installDeterministicClock,
  paletteMachineLabels,
  placeMachine,
  placeMachines,
  seedChapterThreeLevel,
} from "./helpers";

test.setTimeout(60_000);

type MachineType = "source" | "cutter" | "lathe" | "drill" | "coater" | "heatTreater" | "exit";
type MachineRef = readonly [MachineType, number];

async function waitForLevel(page: Page, levelId: number, expectedPalette: string[]) {
  await expect(page.getByText(`章节关卡 ${String(levelId).padStart(2, "0")}`, { exact: true })).toBeVisible();
  await expect.poll(() => paletteMachineLabels(page)).toEqual(expectedPalette);
}

function machine(page: Page, [type, index]: MachineRef) {
  return page.locator(`.factory-floor .machine--${type}`).nth(index);
}

async function connectMachineInstances(page: Page, pairs: Array<readonly [MachineRef, MachineRef]>) {
  for (const [from, to] of pairs) {
    await machine(page, from).locator(".port--output").click();
    await machine(page, to).locator(".port--input").click();
  }
}

async function maintenanceMachineId(card: Locator) {
  const testId = await card.locator('[data-testid^="maintenance-request-"]').getAttribute("data-testid");
  if (!testId) throw new Error("Processing machine did not expose its maintenance request control.");
  return testId.replace("maintenance-request-", "");
}

async function advanceUntil(page: Page, predicate: () => Promise<boolean>, limitSeconds: number) {
  for (let elapsed = 0; elapsed < limitSeconds; elapsed += 0.5) {
    if (await predicate()) return;
    await advanceGameTime(page, 0.5);
  }
  if (!(await predicate())) throw new Error(`Expected browser state was not reached within ${limitSeconds} virtual seconds.`);
}

async function enqueueWaitingOrdersByDeadline(page: Page) {
  const waiting = page.locator('[data-testid^="order-waiting-"]');
  const entries = await waiting.evaluateAll((cards) => cards.flatMap((card) => {
    const testId = card.getAttribute("data-testid");
    const deadline = card.textContent?.match(/截止\s+(\d+(?:\.\d+)?)s/)?.[1];
    return testId && deadline
      ? [{ id: testId.replace("order-waiting-", ""), deadline: Number(deadline) }]
      : [];
  }));
  entries.sort((left, right) => left.deadline - right.deadline || left.id.localeCompare(right.id));
  for (const { id } of entries) {
    const button = page.getByTestId(`enqueue-order-${id}`);
    if (await button.isVisible()) await button.click();
  }

  const queue = page.locator('[data-testid^="order-queue-"]');
  const queued = await queue.evaluateAll((cards) => cards.flatMap((card) => {
    const testId = card.getAttribute("data-testid");
    const deadline = card.textContent?.match(/截止\s+(\d+(?:\.\d+)?)s/)?.[1];
    return testId && deadline
      ? [{ id: testId.replace("order-queue-", ""), deadline: Number(deadline) }]
      : [];
  }));
  const desired = [...queued]
    .sort((left, right) => left.deadline - right.deadline || left.id.localeCompare(right.id))
    .map(({ id }) => id);
  const current = queued.map(({ id }) => id);
  for (let targetIndex = 0; targetIndex < desired.length; targetIndex += 1) {
    let currentIndex = current.indexOf(desired[targetIndex]);
    while (currentIndex > targetIndex) {
      await page.getByTestId(`queue-up-${desired[targetIndex]}`).click();
      [current[currentIndex - 1], current[currentIndex]] = [current[currentIndex], current[currentIndex - 1]];
      currentIndex -= 1;
    }
  }
}

async function scheduleDueMaintenance(page: Page, remainingCycleLimit = 1) {
  const candidates = page.locator('.machine--reliability-warning [data-testid^="maintenance-request-"]');
  const due = await candidates.evaluateAll((buttons, cycleLimit) => buttons.flatMap((button) => {
    const testId = button.getAttribute("data-testid");
    const remainingCycles = Number(button.closest("article")?.textContent?.match(/约剩\s+(\d+)\s+次/)?.[1]);
    return testId && remainingCycles <= cycleLimit ? [testId] : [];
  }), remainingCycleLimit);
  let requested = 0;
  for (const testId of due) {
    const button = page.getByTestId(testId);
    if (await button.isVisible() && await button.isEnabled()) {
      await button.click();
      requested += 1;
    }
  }
  return requested;
}

async function runOrderLevelToSuccess(page: Page, levelId: 13 | 15) {
  let requestedMaintenance = 0;
  let activePlannedMaintenanceSeen = false;
  let heatTreaterWorkingSeen = false;
  let trackedPlannedMachineId: string | null = null;
  let trackedPlannedMaintenanceCompleted = false;
  for (let elapsed = 0; elapsed < 90; elapsed += 1) {
    await enqueueWaitingOrdersByDeadline(page);
    requestedMaintenance += await scheduleDueMaintenance(page);
    heatTreaterWorkingSeen ||= await page.locator(".factory-floor .machine--heatTreater").evaluate(
      (element) => element.classList.contains("machine--working"),
    );
    const activePlanned = page.locator(
      ".maintenance-job--active",
      { hasText: "计划维护" },
    );
    if (await activePlanned.isVisible()) {
      activePlannedMaintenanceSeen = true;
      const testId = await activePlanned.getAttribute("data-testid");
      trackedPlannedMachineId ??= testId?.replace("maintenance-active-", "") ?? null;
    }
    if (trackedPlannedMachineId
      && !await page.getByTestId(`maintenance-active-${trackedPlannedMachineId}`).isVisible()) {
      const availableRequest = page.getByTestId(`maintenance-request-${trackedPlannedMachineId}`);
      if (await availableRequest.isVisible()) {
        const machineCard = availableRequest.locator("xpath=ancestor::article[1]");
        const machineText = await machineCard.textContent();
        const wearLabel = await machineCard.locator(".machine__wear-track").getAttribute("aria-label");
        trackedPlannedMaintenanceCompleted = Boolean(
          machineText?.includes("正常") && wearLabel === "磨损 0%",
        );
      }
    }
    if (await page.getByRole("dialog", { name: `第 ${levelId} 关完成！` }).isVisible()) {
      if (levelId === 15 && !trackedPlannedMaintenanceCompleted) {
        throw new Error("Level 15 succeeded before the observed planned maintenance returned its machine to normal at 0% wear.");
      }
      return {
        requestedMaintenance,
        activePlannedMaintenanceSeen,
        heatTreaterWorkingSeen,
        trackedPlannedMachineId,
        trackedPlannedMaintenanceCompleted,
      };
    }
    const failure = page.getByRole("dialog", { name: `第 ${levelId} 关未完成` });
    if (await failure.isVisible()) throw new Error(await failure.textContent() ?? `Level ${levelId} failed.`);
    await advanceGameTime(page, 1);
  }
  throw new Error(`Level ${levelId} did not settle within 90 virtual seconds.`);
}

test("level eleven shows a warning without a dialog and completes after planned lathe maintenance", async ({ page }) => {
  await seedChapterThreeLevel(page, { activeLevelId: 10, unlockedLevel: 11 });
  await installDeterministicClock(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "第 10 关：总装排程" })).toBeVisible();
  await page.getByRole("button", { name: "打开关卡选择" }).click();
  await page.locator(".level-option", { hasText: "第 11 关" }).click();

  const guide = page.getByRole("dialog", { name: "第 11 关怎么玩" });
  await expect(guide).toBeVisible();
  await page.getByRole("button", { name: "我明白了，开始维护" }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await expect(guide).toBeHidden();
  await waitForLevel(page, 11, ["钢棒源", "切割机", "车削机", "成品出口"]);

  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 260, y: 150 },
    lathe: { x: 435, y: 150 },
    exit: { x: 610, y: 150 },
  });
  await connectProductRoutes(page, ["standard"]);
  const lathe = page.locator(".factory-floor .machine--lathe");
  const latheId = await maintenanceMachineId(lathe);

  await page.getByRole("button", { name: "开始生产" }).click();
  await advanceUntil(page, () => lathe.evaluate((element) => element.classList.contains("machine--reliability-warning")), 25);
  await expect(page.locator(".feedback-bar")).toContainText("车削机磨损达到 60%");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId(`maintenance-request-${latheId}`).click();
  await advanceUntil(page, () => page.getByTestId(`maintenance-active-${latheId}`).isVisible(), 5);
  await expect(page.getByTestId(`maintenance-active-${latheId}`)).toContainText("计划维护");

  await advanceUntil(page, () => page.getByRole("dialog", { name: "第 11 关完成！" }).isVisible(), 35);
});

test("level twelve reorders two queued maintenance jobs before completing production", async ({ page }) => {
  await seedChapterThreeLevel(page, { activeLevelId: 12 });
  await installDeterministicClock(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await waitForLevel(page, 12, ["钢棒源", "切割机", "车削机", "钻孔机", "成品出口"]);
  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 260, y: 150 },
    lathe: { x: 435, y: 150 },
    drill: { x: 260, y: 350 },
    exit: { x: 435, y: 350 },
  });
  await connectProductRoutes(page, ["precision"]);

  const lathe = page.locator(".factory-floor .machine--lathe");
  const drill = page.locator(".factory-floor .machine--drill");
  const latheId = await maintenanceMachineId(lathe);
  const drillId = await maintenanceMachineId(drill);
  await page.getByRole("button", { name: "开始生产" }).click();
  await advanceGameTime(page, 10);
  await expect(lathe).toHaveClass(/machine--working/);
  await expect(drill).toHaveClass(/machine--working/);
  await page.getByTestId(`maintenance-request-${latheId}`).click();
  await page.getByTestId(`maintenance-request-${drillId}`).click();
  await expect(page.getByTestId(`maintenance-queue-${latheId}`)).toContainText("#1");
  await expect(page.getByTestId(`maintenance-queue-${drillId}`)).toContainText("#2");
  await page.getByTestId(`maintenance-up-${drillId}`).click();
  await expect(page.getByTestId(`maintenance-queue-${drillId}`)).toContainText("#1");
  await expect(page.getByTestId(`maintenance-queue-${latheId}`)).toContainText("#2");

  await advanceUntil(page, async () => {
    await scheduleDueMaintenance(page, 3);
    return page.getByRole("dialog", { name: "第 12 关完成！" }).isVisible();
  }, 55);
});

test("level thirteen completes a hardened order through the heat treater without a wrong-route warning", async ({ page }) => {
  await seedChapterThreeLevel(page, { activeLevelId: 13 });
  await installDeterministicClock(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await waitForLevel(page, 13, ["钢棒源", "钻孔机", "车削机", "热处理炉", "成品出口", "切割机"]);
  await placeMachines(page, {
    source: { x: 85, y: 150 },
    cutter: { x: 300, y: 150 },
    lathe: { x: 515, y: 150 },
    drill: { x: 300, y: 350 },
    heatTreater: { x: 515, y: 350 },
    exit: { x: 730, y: 350 },
  });
  await connectProductRoutes(page, ["precision", "hardened", "standard"]);
  const heatTreater = page.locator(".factory-floor .machine--heatTreater");
  await expect(heatTreater).toHaveCount(1);
  await page.evaluate(() => {
    const feedback = document.querySelector(".feedback-bar");
    if (!feedback) throw new Error("Feedback bar is unavailable before production.");
    const feedbackWindow = window as typeof window & {
      __chapterThreeFeedbackHistory?: string[];
      __chapterThreeFeedbackObserver?: MutationObserver;
    };
    feedbackWindow.__chapterThreeFeedbackHistory = [];
    const record = () => feedbackWindow.__chapterThreeFeedbackHistory?.push(feedback.textContent ?? "");
    const observer = new MutationObserver(record);
    observer.observe(feedback, { childList: true, subtree: true, characterData: true });
    feedbackWindow.__chapterThreeFeedbackObserver = observer;
    record();
  });

  await page.getByRole("button", { name: "开始生产" }).click();
  const result = await runOrderLevelToSuccess(page, 13);
  expect(result.heatTreaterWorkingSeen).toBe(true);
  await expect(heatTreater).toHaveClass(/machine--heatTreater/);
  await expect(page.locator(".order-section--completed")).toContainText("L13-03");
  const feedbackHistory = await page.evaluate(() => {
    const feedbackWindow = window as typeof window & { __chapterThreeFeedbackHistory?: string[] };
    return feedbackWindow.__chapterThreeFeedbackHistory ?? [];
  });
  expect(feedbackHistory.join("\n")).not.toMatch(/工序不匹配|还需要热处理|下一工序应为|无法接收/);
  await expect(page.getByTestId("order-failure")).toHaveCount(0);
});

test("level fifteen completes the four-route audit with nine devices and planned maintenance", async ({ page }) => {
  await seedChapterThreeLevel(page, { activeLevelId: 15 });
  await installDeterministicClock(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await waitForLevel(page, 15, ["切割机", "热处理炉", "车削机", "钻孔机", "镀层机", "钢棒源", "成品出口"]);

  await placeMachine(page, "source", { x: 113, y: 282 });
  await placeMachine(page, "cutter", { x: 113, y: 138 });
  await placeMachine(page, "cutter", { x: 113, y: 426 });
  await placeMachine(page, "lathe", { x: 293, y: 138 });
  await placeMachine(page, "drill", { x: 293, y: 282 });
  await placeMachine(page, "lathe", { x: 293, y: 426 });
  await placeMachine(page, "coater", { x: 473, y: 138 });
  await placeMachine(page, "exit", { x: 473, y: 282 });
  await placeMachine(page, "heatTreater", { x: 473, y: 426 });
  await expect(page.locator(".factory-floor .machine")).toHaveCount(9);

  await connectMachineInstances(page, [
    [["source", 0], ["cutter", 0]],
    [["source", 0], ["cutter", 1]],
    [["cutter", 0], ["lathe", 0]],
    [["cutter", 1], ["lathe", 1]],
    [["lathe", 0], ["exit", 0]],
    [["lathe", 0], ["drill", 0]],
    [["lathe", 0], ["coater", 0]],
    [["lathe", 0], ["heatTreater", 0]],
    [["lathe", 1], ["exit", 0]],
    [["lathe", 1], ["drill", 0]],
    [["lathe", 1], ["coater", 0]],
    [["lathe", 1], ["heatTreater", 0]],
    [["drill", 0], ["exit", 0]],
    [["coater", 0], ["exit", 0]],
    [["heatTreater", 0], ["exit", 0]],
  ]);
  await expect(page.locator(".factory-floor .connection")).toHaveCount(15);

  await page.getByRole("button", { name: "开始生产" }).click();
  const maintenance = await runOrderLevelToSuccess(page, 15);
  expect(maintenance.requestedMaintenance).toBeGreaterThan(0);
  expect(maintenance.activePlannedMaintenanceSeen).toBe(true);
  expect(maintenance.trackedPlannedMachineId).not.toBeNull();
  expect(maintenance.trackedPlannedMaintenanceCompleted).toBe(true);
  await expect(page.getByRole("dialog", { name: "第 15 关完成！" })).toBeVisible();
});
