# 新手引导弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为第 1 关加入默认开启、可关闭且可通过顶部按钮重新打开的新手引导弹窗。

**Architecture:** 在 `MiniFactoryGame` 中新增仅负责弹窗可见性的本地 React 状态；它不读取或写入生产状态。弹窗作为现有结算层旁的独立覆盖层渲染，样式沿用现有工业纸张视觉；顶部 `？玩法` 按钮调用同一状态重新打开说明。

**Tech Stack:** React 19、TypeScript、CSS、Node 内置测试运行器、Vinext。

## Global Constraints

- 仅覆盖第 1 关的新手引导；不增加第二关、存档、分步强制教学或生产规则。
- 首次加载默认显示弹窗；关闭或重新打开不改变设备、连线、倒计时或生产状态。
- 弹窗必须明确显示正确工序、60 秒限制和 10 个螺栓目标。
- 关闭控件的可访问名称为「关闭玩法说明」；重新打开控件的可访问名称为「打开玩法说明」。

---

### Task 1: 为引导弹窗补齐服务端呈现契约

**Files:**
- Modify: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: 主页服务端渲染的 HTML。
- Produces: 保护弹窗标题、工序、目标和可访问控件名称的渲染契约。

- [ ] **Step 1: 写入失败测试**

在 `server-renders the mini factory game shell` 测试内加入以下断言：

```js
  assert.match(html, /第 1 关怎么玩/);
  assert.match(html, /钢棒源.*切割机.*车削机.*成品出口/);
  assert.match(html, /60 秒内完成 10 个螺栓/);
  assert.match(html, /aria-label="关闭玩法说明"/);
  assert.match(html, /aria-label="打开玩法说明"/);
```

- [ ] **Step 2: 运行测试，确认因缺少引导弹窗而失败**

运行：`pnpm exec vinext build && node --test tests/rendered-html.test.mjs`  
预期：失败信息指出 HTML 中找不到「第 1 关怎么玩」。

- [ ] **Step 3: 不改生产代码，仅保留失败状态**

此任务只建立可观察的用户界面契约，生产代码在下一任务添加。

- [ ] **Step 4: 提交测试红灯状态不进入 Git**

不提交刻意失败的工作树；直接进入 Task 2 完成绿灯实现。

### Task 2: 实现可关闭、可重新打开的引导弹窗

**Files:**
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Modify: `game/app/game/game.css`
- Test: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `showOnboarding: boolean` 组件内部状态。
- Produces: `closeOnboarding(): void` 和 `openOnboarding(): void` 事件处理器；两个处理器只能更新 `showOnboarding`。

- [ ] **Step 1: 保留 Task 1 的失败测试，并确认它仍失败**

运行：`pnpm exec vinext build && node --test tests/rendered-html.test.mjs`  
预期：同样因缺少「第 1 关怎么玩」而失败。

- [ ] **Step 2: 在组件中添加最小状态与处理器**

在其他 `useState` 调用附近新增：

```tsx
  const [showOnboarding, setShowOnboarding] = useState(true);
  const closeOnboarding = () => setShowOnboarding(false);
  const openOnboarding = () => setShowOnboarding(true);
```

不要在这两个处理器中调用 `setDesign`、`setState`、`resetAttempt` 或生产控制函数。

- [ ] **Step 3: 在顶部状态区加入重新打开控件**

在 `header-status` 容器内加入：

```tsx
<button className="help-control" type="button" aria-label="打开玩法说明" onClick={openOnboarding}>
  <span aria-hidden="true">?</span>玩法
</button>
```

- [ ] **Step 4: 在结算弹窗之前渲染引导覆盖层**

在现有结算覆盖层条件块之前加入：

```tsx
{showOnboarding && (
  <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <section className="onboarding-card">
      <button className="onboarding-close" type="button" aria-label="关闭玩法说明" onClick={closeOnboarding}>×</button>
      <span className="onboarding-kicker">START HERE</span>
      <h2 id="onboarding-title">第 1 关怎么玩</h2>
      <p>把设备摆好、接好工序，再启动这条小小的螺栓产线。</p>
      <ol className="onboarding-steps">
        <li>从左侧设备栏拖入四台设备。</li>
        <li>从输出端口拖到下一台设备的输入端口。</li>
        <li className="onboarding-route">钢棒源 <span>→</span> 切割机 <span>→</span> 车削机 <span>→</span> 成品出口</li>
        <li>点击「开始生产」，在 60 秒内完成 10 个螺栓。</li>
      </ol>
      <button className="onboarding-primary" type="button" onClick={closeOnboarding}>我明白了，开始设计</button>
    </section>
  </div>
)}
```

- [ ] **Step 5: 添加覆盖层与按钮样式**

在 `game.css` 的结算层样式前新增以下规则，颜色复用现有 CSS 变量：

```css
.help-control { justify-self: end; display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; color: #e7ece9; border: 1px solid #4c5754; background: transparent; cursor: pointer; font: 800 10px var(--font-geist-mono); letter-spacing: .08em; }
.help-control span { display: grid; width: 16px; height: 16px; place-items: center; color: var(--ink); border-radius: 50%; background: var(--cyan); }
.onboarding-backdrop { position: fixed; z-index: 45; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(11,14,14,.62); backdrop-filter: blur(3px); }
.onboarding-card { position: relative; width: min(620px, 100%); padding: 34px 38px 32px; border: 2px solid #26302e; border-top: 8px solid var(--orange); background: var(--paper); box-shadow: 12px 14px 0 rgba(0,0,0,.3); }
.onboarding-close { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; color: #4e5855; border: 1px solid rgba(0,0,0,.18); background: transparent; cursor: pointer; font-size: 22px; line-height: 1; }
.onboarding-kicker { color: var(--orange-dark); font: 9px var(--font-geist-mono); letter-spacing: .2em; }
.onboarding-card h2 { margin: 12px 0 7px; font-size: 29px; }
.onboarding-card > p { margin: 0 0 22px; color: #68706d; font-size: 13px; }
.onboarding-steps { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; counter-reset: onboarding; }
.onboarding-steps li { position: relative; min-height: 42px; padding: 12px 14px 12px 48px; border: 1px solid rgba(0,0,0,.14); background: rgba(255,255,255,.38); font-size: 13px; }
.onboarding-steps li::before { counter-increment: onboarding; content: counter(onboarding); position: absolute; left: 12px; top: 10px; display: grid; width: 24px; height: 24px; place-items: center; color: white; background: var(--steel); font: 800 11px var(--font-geist-mono); }
.onboarding-steps .onboarding-route { padding-left: 48px; color: #27302f; border-left: 4px solid var(--green); font-weight: 800; }
.onboarding-route span { color: var(--orange); font-size: 18px; }
.onboarding-primary { width: 100%; height: 44px; margin-top: 22px; color: white; border: 0; background: var(--orange); box-shadow: inset 0 -4px 0 var(--orange-dark); cursor: pointer; font-weight: 900; letter-spacing: .05em; }
```

- [ ] **Step 6: 运行引导渲染测试，确认转绿**

运行：`pnpm exec vinext build && node --test tests/rendered-html.test.mjs`  
预期：通过，且输出 `1..1`、`pass 1`、`fail 0`。

- [ ] **Step 7: 运行完整验证**

运行：`pnpm test && pnpm lint`  
预期：所有测试通过，ESLint 退出码为 0。

- [ ] **Step 8: 提交功能与测试**

```bash
git add app/game/MiniFactoryGame.tsx app/game/game.css tests/rendered-html.test.mjs
git commit -m "feat: add onboarding modal"
```

### Task 3: 进行浏览器级视觉与状态隔离检查

**Files:**
- Modify: 无

**Interfaces:**
- Consumes: Task 2 构建完成的本地应用。
- Produces: 手动验证记录，确认引导状态与生产状态相互独立。

- [ ] **Step 1: 启动本地预览**

运行：`pnpm dev`  
预期：终端显示本地预览地址。

- [ ] **Step 2: 验证首次显示与关闭**

打开本地预览，确认页面出现「第 1 关怎么玩」、四步说明、关闭按钮和「我明白了，开始设计」。点击任一关闭控件后，确认画布仍为空、剩余时间为 60.0、合格产出为 0/10。

- [ ] **Step 3: 验证再次打开不重置状态**

关闭弹窗后在画布放置至少一台设备，点击顶部 `？玩法`。关闭再次出现的弹窗，确认已放置的设备仍在画布中。

- [ ] **Step 4: 验证运行中说明层不暂停生产**

完成一条合法连线并点击「开始生产」，待剩余时间发生变化后点击顶部 `？玩法`。保持弹窗打开约两秒，关闭后确认剩余时间继续下降且设备布局仍锁定。

- [ ] **Step 5: 停止本地预览并确认工作树状态**

停止本地预览，运行：`git status --short --branch`  
预期：除已提交的功能外没有未跟踪或未提交文件。

## Plan Self-Review

- 规格覆盖：Task 1 覆盖可见文案与可访问名称；Task 2 覆盖默认显示、关闭、复开、状态隔离与视觉；Task 3 覆盖设备、连线与生产状态不被弹窗重置。
- 占位扫描：本计划不含待定实现或未定义接口。
- 类型一致性：引导状态只在 `MiniFactoryGame` 内部以 `boolean` 管理；事件处理器均为无参数、无返回值函数。
