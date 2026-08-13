import assert from "node:assert/strict";
import test from "node:test";

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  return response.text();
}

test("server-renders the mini factory game shell", async () => {
  const html = await renderHome();
  assert.match(html, /<title>迷你自动化工厂｜螺栓生产<\/title>/);
  assert.match(html, /第 1 关：螺栓生产/);
  assert.match(html, /60 秒内生产/);
  assert.match(html, /10<\/b> 个合格螺栓/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});
