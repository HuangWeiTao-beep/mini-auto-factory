# Mini Factory v0.2

Mini Factory 是一个五关自动化产线试玩版。玩家把设备拖入画布、连接工序，并在时间限制内让合格螺栓通过成品出口。

v0.2 的目标是提供稳定、可保存进度、可回归验证的试玩体验。本版本不包含账号、云同步、排行榜、随机故障、AGV、仓储、多产品、第二章节或移动端专门适配。

## 环境要求

- Node.js `>=22.13.0`
- npm

在本目录安装依赖：

```powershell
npm install
```

## 安装与本地启动

启动开发服务器：

```powershell
npm run dev
```

终端会显示本地访问地址。停止服务时按 `Ctrl+C`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器。 |
| `npm run build` | 构建生产产物，并生成 Cloudflare/Wrangler 部署描述。 |
| `npm run start` | 启动已构建的生产服务器。 |
| `npm test` | 构建项目并运行 Node 单元测试。 |
| `npm run lint` | 运行 ESLint 静态检查。 |
| `npm run install:e2e` | 下载 Playwright Chromium；首次运行浏览器测试时执行一次。 |
| `npm run test:e2e` | 启动临时本地服务器并运行完整 Playwright 浏览器回归。 |

Windows PowerShell 下也可以写成 `npm.cmd run test`、`npm.cmd run lint` 或 `npm.cmd run test:e2e`。

完整浏览器回归包含一条真实通关流程，通常需要约 45 秒。若 Playwright 提示找不到 Chromium，先运行：

```powershell
npm.cmd run install:e2e
```

若 E2E 提示 4175 端口正在使用，先关闭占用该端口的本地开发服务器，再重试。测试不会复用未知服务，避免把旧页面误当成测试目标。

## 玩法与关卡

1. 从左侧设备库把设备拖到画布；设备不能与障碍或其他设备重叠。
2. 点击一台设备的橙色输出端口，再点击下一台设备的蓝色输入端口完成连线。
3. 点击“开始生产”后，布局会锁定；此时不能拖动设备或修改连线。
4. 点击“暂停生产”后可以调整布局。只要改动过布局，下一次启动会从零开始生产。

五关按以下节奏递进：

- 第 1 关：基础直线产线，学习放置、连接和生产。
- 第 2 关：加入钻孔机与质检要求。
- 第 3 关：两条支路分流，处理产能压力。
- 第 4 关：避开障碍，连接距离会影响运输时间。
- 第 5 关：在障碍与双支路压力下完成工坊验收。

## 本地进度与清除

游戏使用当前浏览器的 `localStorage` 保存以下本地数据：

- 已解锁关卡；
- 各关最佳完成时间；
- 当前关卡在非运行状态下的设备布局和连线草稿。

生产运行中的瞬时物料、进度和计时不会保存；刷新后会恢复最近一次稳定布局，而不是中途生产现场。数据只保存在当前浏览器和设备中，不会云同步或跨浏览器迁移。

右上角“清除进度”会先弹出二次确认。取消不会改动任何进度；确认后会删除本地存档并回到第 1 关。

## Cloudflare Workers 部署

项目使用 Vinext、Cloudflare Vite 插件和 [`worker/index.ts`](worker/index.ts) 作为 Worker 入口。发布前请确保你拥有自己的 Cloudflare 账号及该账号的发布权限。

在 `game/` 目录中执行：

```powershell
npx wrangler login
npm run build
npx wrangler deploy
```

构建会生成 Wrangler 所需的部署描述；`wrangler deploy` 会使用你的 Cloudflare 登录状态发布 Worker 与构建产物。Worker 名称、域名、路由和账号权限均由发布者配置与承担；本项目不会替你创建外部资源或替你发布。

Cloudflare 的配置字段和部署行为会更新，遇到账号或路由问题时以 [Cloudflare Workers 配置文档](https://developers.cloudflare.com/workers/wrangler/configuration/) 为准。

## 发布验收与常见问题

自动验收顺序：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

自动测试通过后，仍建议人工检查：依次试玩第 1～5 关、刷新恢复已解锁关卡草稿、取消与确认清除进度，以及窄窗口下关卡按钮、控制栏、设备卡片和连接时间标签是否仍可阅读和操作。

如果任一自动命令失败，请保留完整输出后定位失败项。不要靠“再运行一次看看”把问题赶出门——它通常会从窗户爬回来。
