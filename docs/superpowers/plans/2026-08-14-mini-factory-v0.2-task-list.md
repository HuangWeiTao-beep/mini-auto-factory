# Mini Factory v0.2 开发任务清单

**目标：** 将当前五关自动化产线原型打磨成稳定、可保存进度、可回归验证的试玩版。

**不在本版本范围：** 账号、云同步、排行榜、随机故障、AGV、仓储、多产品、第二章节和移动端专门适配。

## 里程碑 A：规则与交互收口

- [x] A1. 对照五关设计规格，核对时限、目标、设备上限、障碍和运输规则。
  - 涉及：`game/app/game/factory-model.mjs`、`docs/superpowers/specs/2026-08-13-mini-automation-factory-chapter-one-design.md`
  - 验收：第 1～5 关的关卡参数与设计规格一致。

- [x] A2. 为每关补齐一条确定性通关模拟和一条代表性失败模拟。
  - 涉及：`game/tests/factory-model.test.mjs`
  - 验收：覆盖正确路径、错误工序、质检拒收、堵塞、距离运输和分支轮转；`npm.cmd test` 通过。

- [x] A3. 收口生产反馈文案与状态表现。
  - 涉及：`game/app/game/MiniFactoryGame.tsx`、`game/app/game/MachineCard.tsx`、`game/app/game/feedback-policy.mjs`
  - 验收：玩家能明确得到“问题位置、原因、可采取动作”三类信息。

- [x] A4. 校验关键交互可访问性。
  - 涉及：`game/app/game/LevelSelectModal.tsx`、`game/app/game/FactoryFloor.tsx`、`game/app/game/MiniFactoryGame.tsx`
  - 验收：Esc 取消连线；弹窗有可读标签和焦点入口；禁用状态不允许运行中编辑。

## 里程碑 B：本地进度与成绩

- [ ] B1. 建立版本化本地存档模块。
  - 新增：`game/app/game/game-save.mjs`、`game/app/game/game-save.d.mts`、`game/tests/game-save.test.mjs`
  - 数据：`version`、`unlockedLevel`、`bestResults`、`drafts`。
  - 验收：解析失败、版本不兼容或数据损坏时安全回退默认状态。

- [ ] B2. 将关卡解锁、最佳成绩和布局草稿接入游戏会话。
  - 涉及：`game/app/game/MiniFactoryGame.tsx`
  - 验收：刷新页面后恢复解锁进度、最佳成绩和未运行布局；生产中状态不保存为草稿。

- [ ] B3. 在关卡选择和结算页展示成绩。
  - 涉及：`game/app/game/LevelSelectModal.tsx`、`game/app/game/MiniFactoryGame.tsx`、`game/app/game/game.css`
  - 验收：已完成关卡展示最佳完成时间；刷新纪录时显示明确反馈。

- [ ] B4. 提供清除本地进度操作。
  - 涉及：`game/app/game/MiniFactoryGame.tsx`、`game/app/game/game-save.mjs`
  - 验收：二次确认后清除存档并重置到第 1 关；取消操作不改变存档。

## 里程碑 C：可维护性与浏览器回归

- [ ] C1. 从页面组件提取游戏会话控制逻辑。
  - 新增：`game/app/game/game-session.mjs`、`game/app/game/game-session.d.mts`、`game/app/game/useGameSession.ts`、`game/tests/game-session.test.mjs`
  - 修改：`game/app/game/MiniFactoryGame.tsx`
  - 验收：页面组件只负责渲染和交互绑定；关卡切换、结算、解锁和存档规则可以脱离 React 测试。

- [ ] C2. 增加浏览器端端到端回归测试。
  - 新增：Playwright 配置和 `game/e2e/` 用例。
  - 覆盖：新手引导、放置/连线、暂停编辑重开、成功解锁、刷新恢复进度、锁关拦截。
  - 验收：本地一条命令可运行端到端测试，主流程不依赖源码字符串断言。

- [ ] C3. 清理过度依赖文案的源码契约测试。
  - 涉及：`game/tests/game-source-contract.test.mjs`
  - 验收：保留必要静态检查，将关键用户流程迁移到行为测试；纯改文案不应导致业务测试误报。

## 里程碑 D：发布准备

- [ ] D1. 将 README 改为项目文档。
  - 涉及：`game/README.md`
  - 验收：包含环境要求、启动/构建/测试命令、玩法简介、存档行为及部署说明。

- [ ] D2. 执行发布验收。
  - 命令：`npm.cmd test`、`npm.cmd run lint`、`npm.cmd run build`。
  - 手动验证：依次试玩第 1～5 关、刷新恢复、清除进度、窄窗口关键操作。
  - 验收：命令全通过；无阻断性流程或视觉问题。

## 建议提交节奏

1. `test: lock down chapter one level behavior`
2. `fix: clarify production feedback and controls`
3. `feat: persist local game progress and drafts`
4. `feat: show level records and reset progress`
5. `refactor: extract game session controller`
6. `test: add browser gameplay regression coverage`
7. `docs: prepare v0.2 player and developer guide`
