# Mini Factory

Mini Factory 是一个浏览器端的自动化产线教学小游戏。玩家需要拖拽设备、连接工序，并在限定时间内让合格螺栓到达成品出口。

当前版本为 **v0.2**，包含两章共十关、本地进度与布局草稿保存、通关解锁、章节二固定种子刷新恢复，以及自动化回归测试。

线上试玩：<https://mini-automation-factory-bolt-v01.ond6468.chatgpt.site>

## 项目结构

| 路径 | 用途 |
| --- | --- |
| [`game/`](game/) | 游戏应用源码、构建配置、测试与详细开发手册。 |
| [`docs/`](docs/) | v0.2 与第二章扩展的设计、计划与任务记录。 |
| [`.openai/hosting.json`](.openai/hosting.json) | ChatGPT Sites 的项目绑定配置。 |

## 快速开始

需要 Node.js `>=22.13.0` 和 npm。

```powershell
cd game
npm install
npm run dev
```

开发服务器启动后，按终端显示的本地地址访问游戏。Windows PowerShell 中也可以使用 `npm.cmd run dev`。

## 常用命令

以下命令都在 `game/` 目录执行：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器。 |
| `npm run build` | 构建生产产物。 |
| `npm test` | 构建并运行 Node 单元测试。 |
| `npm run lint` | 运行 ESLint 静态检查。 |
| `npm run install:e2e` | 安装 Playwright Chromium（首次一次）。 |
| `npm run test:e2e` | 运行 Playwright 浏览器端到端回归测试。 |

完整验收顺序：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

如果本机 4175 端口已被占用，改用独立端口运行 E2E：

```powershell
$env:E2E_PORT = "4176"
npm.cmd run test:e2e
```

## 已完成内容

- 十关自动化产线玩法：第一章第 1～5 关讲基础产线，第二章第 6～10 关讲订单调度；
- 第一章包含障碍、运输距离、分流/汇流、产能和质量要求；
- 第二章包含订单到达、待排区、生产队列、独立截止时间、固定种子设备库顺序与重试换局；
- 三种产品路线：普通螺栓走出口，精密螺栓经钻孔交付，防锈螺栓经镀层交付；
- 设备卡片不可重叠，连接时间标签保持可读；
- 已解锁关卡、最佳时间和稳定布局草稿的本地保存与刷新恢复；
- 第 6～10 关刷新保留布局、章节二种子和设备库顺序，但不保留运行中的队列、物料和计时；
- 清除进度的二次确认；
- 单元测试和 Playwright E2E 回归覆盖核心流程。

详细规则、存档行为、排错和测试说明见 [`game/README.md`](game/README.md)。

## 人工验收

自动化通过后，建议再手动过一遍这些关键点：

- 完成第 5 关后会解锁第 6 关，而不是卡在第一章不放人。
- 第 6 关刷新页面后，设备库顺序与布局草稿保持一致；点击“重新挑战”后，章节二种子与订单表会变化。
- 第二章开始生产后，设备和连线仍锁定，但新到订单依然可以加入队列并上下调整。
- 第 8 关的防锈订单必须经过镀层机；漏镀层不算完成。
- 任一订单逾期会立刻失败，并明确显示订单号、产品名和超时信息。
- 第 10 关完成后不会凭空冒出第 11 关，结算停在第二章收尾。

## 发布方式

本项目当前发布到 **ChatGPT Sites**，线上站点与 [`.openai/hosting.json`](.openai/hosting.json) 中的项目绑定关联。

发布流程是：验证当前代码 → 保存站点版本 → 部署该版本到生产地址。它不依赖 GitHub 自动发布，也不需要执行 `wrangler deploy`。项目中保留的 Cloudflare/Vinext 相关配置主要用于兼容运行环境和本地构建。

## 当前状态

v0.2 已合并到 `master` 并发布为线上站点 v4。后续开发请从当前 `master` 创建独立分支；设计和实施记录可从 [`docs/`](docs/) 查阅。
