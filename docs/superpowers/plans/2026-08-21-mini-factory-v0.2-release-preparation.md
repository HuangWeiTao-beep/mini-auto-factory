# Mini Factory v0.2 发布准备 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Mini Factory v0.2 交付为有准确项目文档、已完成自动发布验收、且附带手动验收清单的试玩版本。

**Architecture:** 只改写 `game/README.md`，使其成为玩家和开发者共享的单一事实来源；不新增部署配置或外部账号资源。发布验收只运行本地已有脚本和浏览器回归套件，并将未自动化的游戏流程明确交给用户手动确认。

**Tech Stack:** Node.js 22.13+、npm、Vinext、React、Cloudflare Vite 插件、Wrangler、Playwright Chromium。

**Spec:** `docs/superpowers/specs/2026-08-21-mini-factory-v0.2-release-design.md`

## Global Constraints

- 不创建或修改 Cloudflare 账号、Worker 名称、域名、路由、密钥或环境变量。
- 不执行 `wrangler deploy`，不产生外部部署。
- 不改变游戏规则、关卡参数、生产模型或 UI 行为。
- README 只引用 `game/package.json` 中已有脚本和当前 Cloudflare/Vinext 部署结构。
- E2E 首次运行前必须执行 `npm.cmd run install:e2e`；完整 E2E 正常约需 45 秒。

---

### Task 1: 将 Starter README 替换为 Mini Factory v0.2 项目文档

**Files:**
- Modify: `game/README.md`
- Reference: `game/package.json`
- Reference: `game/vite.config.ts`
- Reference: `game/worker/index.ts`

**Interfaces:**
- Consumes: `package.json` 中的 `dev`、`build`、`start`、`test`、`lint`、`install:e2e`、`test:e2e` 脚本；`vite.config.ts` 的 Vinext/Cloudflare Vite 配置；`worker/index.ts` 的 Worker 入口。
- Produces: 面向玩家和开发者的准确 `game/README.md`，供发布验收和后续维护直接引用。

- [x] **Step 1: 记录当前 README 与脚本契约**

运行：

```powershell
Get-Content README.md
Get-Content package.json
```

确认 README 仍是 `vinext-starter` 模板，且命令表将仅使用以下现有脚本：

```json
{
  "dev": "vinext dev",
  "build": "vinext build",
  "start": "vinext start",
  "test": "vinext build && node --test tests/*.test.mjs",
  "install:e2e": "playwright install chromium",
  "test:e2e": "playwright test",
  "lint": "eslint . --ignore-pattern dist --ignore-pattern .next"
}
```

- [x] **Step 2: 重写 README 为中文项目指南**

将模板内容替换为下列固定章节，避免在 README 留下 starter、D1、D2 或计划过程文案：

```markdown
# Mini Factory v0.2

## 项目简介
## 环境要求
## 安装与本地启动
## 常用命令
## 玩法与关卡
## 本地进度与清除
## Cloudflare Workers 部署
## 发布验收与常见问题
```

内容要求：

- 环境要求明确 Node.js `>=22.13.0` 与 `npm install`。
- 常用命令表包含每个脚本的用途；E2E 说明首次先执行 `npm.cmd run install:e2e`，再执行 `npm.cmd run test:e2e`。
- 玩法说明包含“拖入设备、输出端口连输入端口、运行时锁定、暂停修改后重新开始”，并概括五关从基础直线到障碍/分支/紧凑工坊的递进。
- 存档说明限定浏览器 `localStorage`，保存解锁、最佳成绩和非运行布局；运行中的生产状态不保存；清除进度二次确认后回到第 1 关。
- 部署说明仅写：在拥有 Cloudflare 账号并完成登录后，于 `game/` 中先 `npm run build`，再 `npx wrangler deploy`；项目使用 `worker/index.ts` 和 Cloudflare Vite 插件；Worker 名称、域名和权限由发布者配置。明确本文档不会替用户创建外部资源。
- 常见问题包含 Chromium 缺失、E2E 占用 4175 端口、完整 E2E 约 45 秒这三项。

- [x] **Step 3: 校验 README 与真实项目一致**

运行：

```powershell
Select-String -Path README.md -Pattern 'vinext-starter|D1|D2|TODO|TBD'
Select-String -Path README.md -Pattern 'npm.cmd run install:e2e|npm.cmd run test:e2e|npx wrangler deploy|localStorage'
```

预期：第一条没有匹配；第二条能定位到 E2E、部署和存档说明。逐条核对 README 中的命令均存在于 `package.json`。

- [x] **Step 4: 检查文档变更并提交**

运行：

```powershell
git diff --check
git diff -- game/README.md
```

预期：没有空白错误；差异只替换 starter 文档为 Mini Factory 项目指南。

提交：

```powershell
git add -- game/README.md
git commit -m "docs: prepare v0.2 player and developer guide"
```

### Task 2: 执行 v0.2 自动发布验收并交付手动清单

**Files:**
- Reference: `game/package.json`
- Reference: `game/playwright.config.ts`
- Reference: `game/e2e/`
- No source files modified unless验收发现真实阻断问题。

**Interfaces:**
- Consumes: Task 1 的 README 命令说明，以及现有单元测试、lint、构建与 Playwright 配置。
- Produces: 本轮中可追溯的自动验收结果，以及交给用户的五关、刷新、清除进度与窄窗口手动验收清单。

- [x] **Step 1: 运行单元测试与构建验证**

在 `game/` 目录依次运行：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

预期：三条命令均以退出码 0 结束。构建可能输出 Vinext 的动态路由静态分析提示；这不是失败，只要退出码为 0 且构建完成即可。

- [x] **Step 2: 运行完整浏览器回归**

运行：

```powershell
npm.cmd run test:e2e
```

预期：5 条用例通过，覆盖新手引导、放置/连线/暂停编辑重开、锁关、刷新恢复和通关解锁。完整运行约 45 秒；测试自行启动并回收本地服务器。

- [x] **Step 3: 分类验收结果**

将每个结果按以下规则记录到最终交付说明：

```text
阻断流程：任一自动命令失败，或无法进入/完成关卡、刷新恢复、清除进度。
视觉可用性：窄窗口下关键控制、设备卡片、连接时间无法点击或阅读。
非阻断：文案瑕疵、不会影响完成流程的轻微视觉问题。
```

若存在阻断流程或关键视觉可用性问题，停止发布验收结论，先报告证据并进入单独修复任务；不通过修改 README 掩盖失败。

- [x] **Step 4: 交付用户手动验收清单**

在最终说明中给出以下逐项清单：

```text
1. 依次试玩第 1～5 关，检查进入、生产、结算和解锁。
2. 在已解锁关卡摆放并连接设备，刷新，检查草稿恢复且无异常弹窗。
3. 点击“清除进度”：先取消，确认数据保留；再确认清除，检查回到第 1 关。
4. 缩窄浏览器窗口，检查关卡、控制栏、设备卡片和连线时间标签均能阅读和操作。
```

- [x] **Step 5: 复核工作树与提交边界**

运行：

```powershell
git status --short
git log -1 --oneline
```

预期：Task 1 的 README 提交存在；未追踪的 `.superpowers/sdd/.gitignore` 保持未纳入提交；Task 2 不因“验收执行”产生无关源码变更。
