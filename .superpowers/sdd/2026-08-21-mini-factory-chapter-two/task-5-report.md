# Task 5 实现报告

## 改动

- 扩展 `game/e2e/helpers.ts`：支持镀层机、普通/精密/防锈产品路线去重连线、固定 localStorage v2 存档、固定第 6–10 关 `chapterTwoSeeds`、章节二教学关闭、设备库顺序读取，以及 Playwright 虚拟时钟推进。
- 新增 `game/e2e/chapter-two-orders.spec.ts`：
  - 第 6 关验证固定设备库顺序、真实拖放/连线、两单入队和上下调序、运行中布局锁定而队列可编辑、成功结算与第 7 关解锁。
  - 第 8 关验证镀层机出现、三产品路线分支、固定防锈订单 `L8-05` 实际进入镀层机并完成。
  - 逾期验证固定订单 `L6-01` 未入队后失败，结算包含订单号、产品名和“超时”，生产时间不再推进。
- 扩展 `game/e2e/persistence-and-access.spec.ts`：保留第 2 关刷新及不重开第 1 关教学回归；新增第 6 关刷新，验证草稿、连接、位置、设备库种子保持，运行态恢复设计态，订单队列、当前投料和物料不恢复。
- `playwright.config.ts` 与 `e2e/global-setup.ts` 共用可选 `E2E_PORT`，默认仍为 4175；本工作树验收使用独立 4176，避免复用未知旧服务。
- E2E RED 暴露结算 UI 绕过已有订单诊断策略；`MiniFactoryGame.tsx` 改为把 `state.failure` 传给 `getFailureDiagnostic`，因此逾期结算会显示产品名与“超时”。

## 测试

- 初始基线：`npm.cmd run test:e2e` 两次均在 global setup 前退出，因为未知 Node/Vinext 服务占用 IPv6 `::1:4175`；按父任务裁决未停止或复用该服务。
- 环境准备：`npm.cmd run install:e2e` 成功安装项目锁定的 Chromium、Headless Shell、FFmpeg 和 Winldd。
- RED 1：章节二定向 E2E 3/3 失败；两个设备库断言因测试选择器误用 `strong`，逾期结算真实缺少产品名和“超时”。
- GREEN 1：修正设备库选择器并接通已有订单失败诊断策略后，逾期用例通过；第 6/8 关暴露三栏布局下的真实拖放/端口坐标问题。
- GREEN 2：使用画布可见区内且端口可点击的网格布局后，第 8 关定向 E2E 1/1 通过；第 6 关与逾期此前已分别通过。
- `$env:E2E_PORT='4176'; npx.cmd playwright test e2e/persistence-and-access.spec.ts`：3/3 通过。
- `$env:E2E_PORT='4176'; npm.cmd run test:e2e`：9/9 通过，包含全部旧 E2E 与新增章节二流程，总耗时 1.9 分钟。
- `npx.cmd tsc --noEmit`：通过。
- `npm.cmd run lint`：通过。
- `node --test tests/feedback-policy.test.mjs`：2/2 通过。
- `git diff --check`：通过；仅有仓库既有 LF/CRLF 转换提示，无空白错误。

## Commit

- 提交信息：`test: cover chapter two order scheduling flows`
- 报告与实现同属该提交；最终哈希以提交后的 `git rev-parse HEAD` 为准。

## Concerns

- 本机 4175 被 PID 6532 的未知 Node/Vinext 服务占用。遵照父任务裁决，没有停止该进程，也没有把它当作测试服务器；完整 E2E 使用 `E2E_PORT=4176` 启动当前工作树自己的服务。
- `E2E_PORT` 默认仍是 4175，正常环境下原验收命令不变；端口冲突环境需显式指定空闲端口。
- Playwright 输出一条 `NO_COLOR` 被 `FORCE_COLOR` 忽略的环境警告，不影响测试结果。
