# Task B3 Report — 关卡成绩展示与破纪录反馈

## 交付内容

- `LevelSelectModal` 接收 B2 持久化的 `bestResults`，已完成关卡显示最佳完成时间（精确到 0.1 秒）。
- 成功结算页显示该关的最佳纪录。
- 当本次成功用时严格快于此前最佳纪录（包括该关首次通关）时，结算页显示“🏆 本次刷新纪录”。同纪录或更慢成绩不会误报。
- 未修改清除画布控制、存档重置或任何 B4 范围内的 UI 行为。

## 测试先行记录

1. 新增 `completed levels expose their best time and success settlement calls out a new record` 源码契约测试。
2. 先运行 `node --test tests/game-source-contract.test.mjs`：15 项中 1 项失败，缺失 `bestResults` 数据流，符合预期红灯。
3. 最小实现关卡选择成绩显示、结算最佳纪录与破纪录状态后，同一聚焦测试 15/15 通过。

## 验证

- `node --test tests/game-source-contract.test.mjs`：15/15 通过。
- `npm test`：构建成功，63/63 通过。
- `npm run lint`：通过。
- `git diff --check`：通过。

## 范围与注意事项

- UI 测试沿用本项目既有的 Node 源码契约测试策略；`recordBestResult` 的更快替换/更慢保留行为由现有 `game-session.test.mjs` 覆盖。
- 工作树原有未追踪文件 `.superpowers/sdd/.gitignore` 未纳入本任务提交。
