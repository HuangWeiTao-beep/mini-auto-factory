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
  assert.match(html, /第 1 关怎么玩/);
  assert.match(html, /钢棒源.*切割机.*车削机.*成品出口/);
  assert.match(html, /60 秒内完成 10 个螺栓/);
  assert.doesNotMatch(html, /未钻孔螺栓|两条紧凑支路/);
  assert.match(html, /aria-label="关闭玩法说明"/);
  assert.match(html, /aria-label="打开玩法说明"/);
  assert.match(html, /章节关卡/);
  assert.match(html, /aria-label="打开关卡选择"/);
  assert.match(html, /aria-label="清除本地进度"/);
  assert.equal(html.match(/aria-modal="true"/g)?.length, 1);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});
