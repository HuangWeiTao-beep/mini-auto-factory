import { defineConfig } from "@playwright/test";

const e2ePort = process.env.E2E_PORT ?? "4175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${e2ePort}`,
    browserName: "chromium",
    trace: "on-first-retry",
  },
});
