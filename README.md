# Mini Factory

Mini Factory 是一个浏览器端的自动化产线教学小游戏。玩家需要拖拽设备、连接工序，并在限定时间内让合格螺栓到达成品出口。

当前版本为 **v0.2**，包含五个递进关卡、本地进度与布局草稿保存、通关解锁，以及自动化回归测试。

线上试玩：<https://mini-automation-factory-bolt-v01.ond6468.chatgpt.site>

## 项目结构

| 路径 | 用途 |
| --- | --- |
| [`game/`](game/) | 游戏应用源码、构建配置、测试与详细开发手册。 |
| [`docs/`](docs/) | v0.2 的设计、计划与任务记录。 |
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

## 已完成内容

- 五关自动化产线玩法：放置设备、连接端口、生产、暂停、调整与重开；
- 障碍、运输距离、分流/汇流、产能和质量要求；
- 设备卡片不可重叠，连接时间标签保持可读；
- 已解锁关卡、最佳时间和稳定布局草稿的本地保存与刷新恢复；
- 清除进度的二次确认；
- 单元测试和 Playwright E2E 回归覆盖核心流程。

详细规则、存档行为、排错和测试说明见 [`game/README.md`](game/README.md)。

## 发布方式

本项目当前发布到 **ChatGPT Sites**，线上站点与 [`.openai/hosting.json`](.openai/hosting.json) 中的项目绑定关联。

发布流程是：验证当前代码 → 保存站点版本 → 部署该版本到生产地址。它不依赖 GitHub 自动发布，也不需要执行 `wrangler deploy`。项目中保留的 Cloudflare/Vinext 相关配置主要用于兼容运行环境和本地构建。

## 当前状态

v0.2 已合并到 `master` 并发布为线上站点 v4。后续开发请从当前 `master` 创建独立分支；设计和实施记录可从 [`docs/`](docs/) 查阅。
