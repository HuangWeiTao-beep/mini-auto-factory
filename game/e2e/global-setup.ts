import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

const baseUrl = "http://localhost:4175";
const port = 4175;

async function assertPortAvailable() {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`E2E port ${port} is already in use.`)));
    probe.listen(port, "localhost", () => probe.close((error) => error ? reject(error) : resolve()));
  });
}

async function waitForServer(server: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`E2E development server exited with code ${server.exitCode}.`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The development server has not opened its listening socket yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("E2E development server did not become available within 120 seconds.");
}

async function stopServer(server: ReturnType<typeof spawn>) {
  if (!server.pid || server.exitCode !== null) return;

  server.kill("SIGKILL");
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

export default async function globalSetup() {
  await assertPortAvailable();
  const server = spawn(
    process.execPath,
    ["./node_modules/vinext/dist/cli.js", "dev", "--port", String(port)],
    { cwd: process.cwd(), stdio: "ignore", windowsHide: true },
  );

  try {
    await waitForServer(server);
  } catch (error) {
    await stopServer(server);
    throw error;
  }

  return () => stopServer(server);
}
