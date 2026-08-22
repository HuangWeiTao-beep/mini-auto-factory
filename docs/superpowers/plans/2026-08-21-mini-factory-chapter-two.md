# Mini Factory 第二章「订单调度与多产品」实施计划

> **给执行者：** 实施本计划必须使用 `superpowers:executing-plans`，按任务顺序推进；每项任务先写会失败的测试，再实现最小代码使其通过。

**目标：** 在不改变第一章第 1～5 关规则的前提下，交付第 6～10 关：确定性随机到单、可编辑订单队列、独立截止时间、三种产品配方和镀层机，并让存档、界面、单元测试与 Playwright 覆盖完整闭环。

**架构：** 将订单定义、种子随机数和队列转换放进纯领域模块；让产线模拟只消费“已投料的、带配方进度的物料”；会话层拥有种子与持久化边界；React 层只渲染状态和调用显式动作。第二章状态由关卡 `id >= 6` 启用，第一章继续使用现有目标数量与全局倒计时流程。

**技术栈：** React + TypeScript UI、ESM `.mjs` 游戏模型、Node 内置测试、Playwright、Vinext。

**不变条件：**

- 不增加第三方依赖、账号、云服务或运行中存档。
- 设备库顺序可洗牌，画布上的设备位置、障碍和路线不随机预设。
- 运行中只能调整尚未投料的订单队列；设备与连线仍锁定。
- tick 顺序固定为：订单到达与物料交付 → 逾期检查；在截止时刻交付视为成功。
- 旧 v1 存档必须安全升级，且保留第 1～5 关解锁、记录和草稿。

---

## 任务 1：建立第二章关卡、配方与确定性订单领域模块

**文件：**

- 新建：`game/app/game/order-scheduling.mjs`
- 新建：`game/app/game/order-scheduling.d.mts`
- 修改：`game/app/game/factory-model.mjs`
- 修改：`game/app/game/factory-model.d.mts`
- 修改：`game/tests/factory-model.test.mjs`
- 新建：`game/tests/order-scheduling.test.mjs`

**步骤：**

1. 在 `order-scheduling.test.mjs` 先覆盖纯规则：同一 `levelId + seed` 产生逐字段一致的订单表和设备库排列；不同种子产生不同尝试；排列是允许设备类型的一个不重复置换；到达前为 `scheduled`、到达后为 `waiting`。
2. 在测试中固定第 6～10 关的种子，断言订单数量、到达窗口、产品集合和每单的截止窗口符合设计：6/7 只出现普通与精密，8～10 必须覆盖普通、精密、防锈；每张订单 `deadlineAt > arrivesAt`。
3. 新建 `order-scheduling.mjs`：导出 `PRODUCTS`、`getProduct`、`createSeededRandom`、`createOrderScenario`、`shufflePaletteTypes`、`activateArrivedOrders`、`enqueueWaitingOrder`、`moveQueuedOrder`。使用本地确定性 PRNG（例如无依赖 mulberry32/xorshift），不读取 `Math.random`；订单使用稳定 ID，例如 `L6-01`。
4. 在 `PRODUCTS` 中定义产品文字、无障碍文本、颜色语义、路线：`source → cutter → lathe → exit`、`source → cutter → lathe → drill → exit`、`source → cutter → lathe → coater → exit`。领域模块只处理数据和不可变转换，不能引用 React 或 localStorage。
5. 扩展 `factory-model.mjs` 的 `DEVICE_TYPES` 与类型声明，加入 `coater`（输入/输出、尺寸、显示所需元数据）；新增第 6～10 关配置，包括订单生成参数、设备上限、障碍/距离/分流规则，且第 8 关开始允许镀层机。将 `nextUnlockedLevel` 上限从 5 提升到 10。
6. 为章二区分新增显式帮助函数（如 `isOrderSchedulingLevel`、`getAllowedPaletteTypes`），让 UI 和会话层不再散落 `level.id >= 6` 魔法数字。
7. 更新 `factory-model.test.mjs`，断言 coater 限额、6～10 关配置、5→6、9→10 和 10→10 的解锁行为，同时保留第一章的现有断言。

**验收命令：**

```powershell
cd game
node --test tests/order-scheduling.test.mjs tests/factory-model.test.mjs
```

**提交：**

```text
feat: define chapter two orders and recipes
```

---

## 任务 2：让产线按订单配方投料、加工、交付和失败

**文件：**

- 修改：`game/app/game/factory-model.mjs`
- 修改：`game/app/game/factory-model.d.mts`
- 修改：`game/app/game/feedback-policy.mjs`
- 修改：`game/tests/factory-model.test.mjs`
- 新建：`game/tests/chapter-two-production.test.mjs`

**步骤：**

1. 在 `chapter-two-production.test.mjs` 先构建第 6、8 关的最小正确设计，测试钢棒源在队列为空时不投料；订单被加入队列后只投队首；投入中的订单从队列移除并变成 `inProduction`。
2. 为章二物料增加 `orderId`、`productId`、`recipeStepIndex`。物料通过机器时，只有当前配方所期待的设备类型才可推进；机器完成后更新步骤索引，而不是依赖“第几关车削输出什么物料”。第 1～5 关保留原 `rod/blank/bolt/undrilledBolt` 路径和既有输出逻辑。
3. 使 `createProductionState(design, level, scenario)` 在第 6～10 关初始化 `orders`、`queue`、`completedOrderIds`、`failure` 和种子关联数据；旧的 `createProductionState(design)` 调用仍产生与当前测试完全兼容的第一章状态。
4. 为订单队列动作提供模型级 API：只允许 `waiting → queued`；仅 `queued` 订单可用索引上下移动；`scheduled`、`inProduction`、`completed`、`overdue` 一律返回原状态。不要把这个规则藏在按钮 disabled 里，UI 会骗人，模型不会。
5. 在 `advanceProduction` 中，章二每个 tick 先激活到达订单，再推进运输和加工并结算出口；出口仅在完整配方已完成时标记其 `orderId` 为 `completed`。漏工序、错误机器和错误产品不得计数，并产生包含期待下一工序的诊断。
6. 所有订单完成立即进入 `success`；否则，在交付结算之后检查每个未完成订单的 `deadlineAt`，到期后进入 `failure`，填充 `{ orderId, productId, overdueSeconds }`。精确截止时交付必须成功。
7. 将 `feedback-policy.mjs` 扩展为优先把逾期订单转成清晰错误文案（订单号、产品、超时秒数）；非逾期时继续使用第一章现有诊断。
8. 补齐模型测试：普通、精密、防锈分别走出口/钻孔/镀层完成；防锈绕过镀层不结算；队列重排改变投料顺序；精确截止成功；任意逾期立刻失败；第 6～10 关固定种子、正确布局和合理队列都可完成，而错误优先级会超时。

**验收命令：**

```powershell
cd game
node --test tests/factory-model.test.mjs tests/chapter-two-production.test.mjs
```

**提交：**

```text
feat: run recipe-aware order production
```

---

## 任务 3：升级存档和会话层，保证刷新可复现、重试会换局

**文件：**

- 修改：`game/app/game/game-save.mjs`
- 修改：`game/app/game/game-session.mjs`
- 修改：`game/app/game/useGameSession.ts`
- 修改：`game/tests/game-save.test.mjs`
- 修改：`game/tests/game-session.test.mjs`

**步骤：**

1. 先为 `game-save.test.mjs` 写 v1 JSON 迁移测试：既有 `unlockedLevel`、`activeLevelId`、`bestResults` 和 `drafts` 原样保留，新增种子映射为空；损坏或非法种子数据安全回退。把 `SAVE_VERSION` 升级为 2，并限制解锁和活动关卡为 1～10。
2. 在存档格式新增 `chapterTwoSeeds: Record<number, number>`。种子是稳定布局状态的一部分；设备库排列从种子派生，不单独保存第二份容易打架的数据。
3. `restoreGameSession` 对第 6～10 关读取或首次生成种子，再以该种子创建场景和生产状态；恢复运行中的页面仍进入设计模式，订单计时、队列和物料均重新开始。
4. 将 `resetGameSession(session, keepDesign)` 的“重新尝试”定义为不论是否保留布局都生成新种子；选择其他关卡或刷新不换种子。保留第一章重试语义。
5. 添加会话级订单动作，如 `enqueueSessionOrder`、`moveSessionQueuedOrder`，在运行状态时调用领域模型并更新 `session.state`；设计态、暂停态或无效订单不产生伪更新。
6. 修改 `useGameSession.ts`：动画循环传入当前会话的 `level` 与订单场景；暴露入队、上移、下移动作；持久化时写入稳定草稿和种子，但绝不写入 `state.orders`、`queue`、计时或物料。
7. 扩充会话测试：第 5 关成功解锁第 6 关，10 关不会超过上限；刷新第 6 关保留草稿与种子/设备库顺序但重置生产；重试更换种子；运行中保存后刷新不恢复半截队列；旧第一章存档和所有现有断言继续通过。

**验收命令：**

```powershell
cd game
node --test tests/game-save.test.mjs tests/game-session.test.mjs
```

**提交：**

```text
feat: persist chapter two scenarios safely
```

---

## 任务 4：交付章节二界面、订单面板和关卡选择

**文件：**

- 新建：`game/app/game/OrderPanel.tsx`
- 修改：`game/app/game/MiniFactoryGame.tsx`
- 修改：`game/app/game/MachineCard.tsx`
- 修改：`game/app/game/LevelSelectModal.tsx`
- 修改：`game/app/game/game.css`
- 修改：`game/tests/game-source-contract.test.mjs`
- 修改：`game/tests/rendered-html.test.mjs`

**步骤：**

1. 先在来源契约测试中定义稳定的可访问入口和 `data-testid`：`order-waiting-*`、`order-queue-*`、`queue-up-*`、`queue-down-*`、`order-current`、`order-completed-count`、`order-failure`。按钮名称写入测试，避免 E2E 未来靠 CSS 猜命。
2. 新建纯展示组件 `OrderPanel.tsx`，接收订单状态、队列和回调，不直接调用存档或模型。它分为“待排订单”“生产队列”“当前投料”“已完成”四区；订单卡同时显示订单号、产品名、工序文字/图标、倒计时和紧急文本（少于 6 秒）。
3. 队列先以无障碍的“加入队列 / 上移 / 下移”按钮作为必备交互；可在同一组件补充鼠标拖拽，但拖拽只是锦上添花，不能成为唯一道路。运行中这些按钮保持可用，设计和暂停时显示不可操作说明。
4. 改造 `MiniFactoryGame.tsx`：第 6～10 关显示订单面板和无全局倒计时的任务条；第 1～5 关保留现有“秒内完成 X 个”的视觉和控制逻辑。把 `CHAPTER ONE`、结算“全部验收通过”和“下一关”判断改为根据关卡章节和最大关卡动态生成。
5. 设备库改为按会话场景的 `paletteOrder` 渲染；第 8 关开始显示 `镀层机`。在 `MachineCard.tsx` 增加镀层机图标、名称、端口标签和状态样式，确保卡片尺寸/拖放仍与已有画布布局兼容。
6. 改造 `LevelSelectModal.tsx`：按第 1～5、6～10 分成“第一章：产线基础”“第二章：订单调度”，第二章卡片显示订单总量/交付窗口而非不存在的 `duration/target`。锁定、记录、键盘焦点和按钮语义保持一致。
7. 在 `game.css` 增加订单面板的紧急、排队、投料、完成、逾期样式以及移动端布局；紧急状态必须有文本与图标/边框，不能只换红色。为第 6 关加入一次性教学说明，说明订单到达、入队、投料锁定和截止时间。
8. 更新 SSR/来源契约测试，断言第一章的原有 HTML 文案仍可渲染，第六关可渲染订单面板、镀层机及章节标题，且没有把队列编辑误锁死。

**验收命令：**

```powershell
cd game
npm.cmd run lint
npm.cmd test
```

**提交：**

```text
feat: add chapter two order scheduling UI
```

---

## 任务 5：为真实浏览器流程补齐端到端覆盖

**文件：**

- 修改：`game/e2e/helpers.ts`
- 新建：`game/e2e/chapter-two-orders.spec.ts`
- 修改：`game/e2e/persistence-and-access.spec.ts`
- 如页面可访问性名称调整：同步修改对应现有 E2E 文件

**步骤：**

1. 在 `helpers.ts` 增加章节二布局助手：支持 `coater`，按产品路线连接，使用固定 localStorage v2 存档直接解锁测试关卡及提供固定 `chapterTwoSeeds`。测试不依赖墙上时钟或偶然的随机数。
2. 编写“第 6 关订单调度成功”E2E：打开已解锁第 6 关，确认设备库顺序；放置并连好源/切割/车削/钻孔/出口；启动；等待订单到达；将两个订单入队并上移/下移；确认设备仍锁定、队列仍可编辑；完成后看到成功结算和第 7 关解锁。
3. 编写“第 8 关防锈螺栓经镀层交付”E2E：确认镀层机出现，建立三产品共用主线与钻孔/镀层分支，排入固定防锈订单，验证完成计数增加而未走错钻孔路径。
4. 编写“订单逾期给出明确错误”E2E：不将到达订单排入队列或故意排错优先级，等待固定截止时间；断言失败结算包含订单号、产品名及“超时”文字，且不能再继续生产。
5. 把现有持久化 E2E 扩展为第 6 关刷新：草稿和设备库顺序保持，运行状态回到设计态，订单队列/物料不恢复；同时保留现有第 2 关刷新不弹第 1 关教学的回归断言。

**验收命令：**

```powershell
cd game
npm.cmd run test:e2e
```

**提交：**

```text
test: cover chapter two order scheduling flows
```

---

## 任务 6：更新说明、完整回归和人工验收

**文件：**

- 修改：`README.md`
- 修改：`game/README.md`
- 如实际脚本或控制方式变化：修改 `game/package.json`

**步骤：**

1. 在两个 README 更新到“第二章：订单调度与多产品”，说明三种产品路线、订单到达、独立截止、队列重排、刷新/重试的种子规则，以及 Playwright 的运行方式。部署说明仍保持 ChatGPT Sites；不把已不存在的 Cloudflare 发布步骤重新招魂。
2. 清楚列出玩家人工验收流程：完成第 5 关解锁 6；第 6 关刷新保留设备库顺序；启动后可排队但不能改产线；第 8 关防锈订单必须经过镀层；任一订单逾期失败；第 10 关完成后不产生第 11 关。
3. 依次运行 lint、单测、生产构建、E2E；检查 `git diff --check` 无空白错误。若其中任何一步失败，先按 `superpowers:systematic-debugging` 定位并修复，再重新跑完整验证，不能用“我这里应该可以”糊弄编译器。

**验收命令：**

```powershell
cd game
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
cd ..
git diff --check
git status --short
```

**提交：**

```text
docs: document chapter two order scheduling
```

---

## 最终人工验收清单

1. 新存档先通关第 5 关，第 6 关确实解锁；已有第一章存档的进度、记录和草稿不丢。
2. 进入第 6 关两次刷新，设备库顺序一致；点击重新尝试后顺序和订单表变化，且画布布局按所选操作保留或清空。
3. 生产时，新增订单会进入待排区；只有进生产队列的订单会从钢棒源投料；队列可上下调整，已投料订单不能撤回。
4. 普通、精密、防锈订单分别只会在出口、钻孔、镀层路线完整时计数；防锈订单漏镀层不算完成。
5. 任一订单过期即显示订单号、产品和超时，并停止本局；恰在截止时刻完成不失败。
6. 第 1～5 关的布局、暂停、刷新、计时和关卡完成流程没有变化。
