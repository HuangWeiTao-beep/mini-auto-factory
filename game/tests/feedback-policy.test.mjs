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
