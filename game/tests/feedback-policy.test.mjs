import assert from "node:assert/strict";
import test from "node:test";

test("invalid placement feedback replaces a stale warning after pause", async () => {
  const policy = await import("../app/game/feedback-policy.mjs").catch(() => ({}));
  assert.equal(
    typeof policy.getPlayerFeedback,
    "function",
    "the interaction layer must expose a feedback priority policy",
  );

  const warning = "车削机不能加工长钢棒，需要先完成切割工序。";
  assert.equal(
    policy.getPlayerFeedback("running", warning, "产线启动，布局已锁定。"),
    warning,
  );

  const pausedFeedback = "生产已暂停。现在可以调整设备和连线。";
  assert.equal(
    policy.getPlayerFeedback("paused", warning, pausedFeedback),
    pausedFeedback,
  );

  const invalidPlacement = "这个网格被障碍或其他设备占用，请换一格。";
  assert.equal(
    policy.getPlayerFeedback("paused", warning, invalidPlacement),
    invalidPlacement,
  );
});

test("failure diagnostics prefer contextual runtime feedback, then warning, then the route hint", async () => {
  const policy = await import("../app/game/feedback-policy.mjs");

  assert.equal(
    policy.getFailureDiagnostic(
      "缺少孔位",
      "质量拒收：螺栓缺少孔位，已在出口丢弃；请接入钻孔机。",
      "钢棒源 → 切割机 → 车削机 → 钻孔机 → 成品出口",
    ),
    "质量拒收：螺栓缺少孔位，已在出口丢弃；请接入钻孔机。",
  );
  assert.equal(
    policy.getFailureDiagnostic("车削机不能接收长钢棒", null, "正确路线"),
    "车削机不能接收长钢棒",
  );
  assert.equal(policy.getFailureDiagnostic(null, null, "正确路线"), "正确路线");
});
