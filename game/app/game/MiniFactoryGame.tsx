"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  DEVICE_TYPES,
  addDevice,
  canPlaceDevice,
  connectDevices,
  getDeviceLimit,
  moveDevice,
  outgoing,
  removeConnection,
} from "./factory-model.mjs";
import type { DeviceType } from "./factory-model.mjs";
import { MACHINE, snapToGrid } from "./factory-grid.mjs";
import { getFailureDiagnostic, getPlayerFeedback } from "./feedback-policy.mjs";
import { getProductionActionLabel } from "./production-controls.mjs";
import { FactoryFloor } from "./FactoryFloor";
import { LevelSelectModal } from "./LevelSelectModal";
import { useGameSession } from "./useGameSession";
import "./game.css";

const paletteDefinitions: Array<{ type: DeviceType; icon: string; eyebrow: string }> = [
  { type: "source", icon: "▰", eyebrow: "RAW 01 · 钢棒源" },
  { type: "cutter", icon: "✂", eyebrow: "CUT 02 · 切割机" },
  { type: "lathe", icon: "⚙", eyebrow: "TURN 03 · 车削机" },
  { type: "drill", icon: "◉", eyebrow: "DRILL 04 · 钻孔机" },
  { type: "exit", icon: "✓", eyebrow: "QC 05 · 成品出口" },
];

export function MiniFactoryGame() {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showClearProgressConfirm, setShowClearProgressConfirm] = useState(false);
  const [toast, setToast] = useState("把设备拖进画布，按关卡工序连接起来。");
  const floorRef = useRef<HTMLDivElement>(null);
  const handleSessionRestore = useCallback((restored: { activeLevelId: number }) => {
    setShowOnboarding(restored.activeLevelId === 1);
  }, []);
  const {
    activeLevelId,
    unlockedLevel,
    bestResults,
    recordBroken,
    design,
    state,
    editedWhilePaused,
    level,
    mutateDesign,
    start,
    pause,
    reset,
    selectLevel: selectSessionLevel,
    clearProgress,
  } = useGameSession({ onRestored: handleSessionRestore });

  const palette = paletteDefinitions
    .filter((item) => getDeviceLimit(level, item.type) > 0)
    .map((item) => ({ ...item, limit: getDeviceLimit(level, item.type) }));
  const requiredDeviceCount = palette.reduce((total, item) => total + item.limit, 0);
  const locked = state.mode === "running";
  const remaining = Math.max(0, level.duration - state.elapsed);
  const completion = (state.completed / level.target) * 100;
  const hasNextLevel = activeLevelId < 5;
  const activeBestResult = bestResults[activeLevelId];
  const settlementOpen = state.mode === "success" || state.mode === "failure";
  const overlayOpen = showLevelSelect || showOnboarding || settlementOpen || showClearProgressConfirm;
  const blockedLine = Object.values(state.lines).find(
    (line) => line.item?.status === "blocked" || line.item?.status === "waiting",
  );
  const blockedTarget = blockedLine ? design.devices[blockedLine.to] : undefined;
  const routingWaitDevice = level.id === 3 || level.id === 5
    ? Object.values(design.devices).find((device) => {
        const heldOutput = state.sources[device.id]?.output ?? state.machines[device.id]?.output;
        const branches = outgoing(design, device.id);
        if (!heldOutput || branches.length < 2) return false;
        const selected = branches[(state.routingCursor[device.id] ?? 0) % branches.length];
        return Boolean(state.lines[selected.id]?.item);
      })
    : undefined;
  const routingBranches = routingWaitDevice ? outgoing(design, routingWaitDevice.id) : [];
  const routingWaitConnection = routingWaitDevice
    ? routingBranches[(state.routingCursor[routingWaitDevice.id] ?? 0) % routingBranches.length]
    : undefined;
  const contextualFeedback = state.warning === "缺少孔位"
    ? { tone: "warning", message: "质量拒收：螺栓缺少孔位，已在出口丢弃；请接入钻孔机。" }
    : blockedLine
      ? {
          tone: blockedLine.item?.status === "blocked" ? "warning" : "wait",
          message: blockedLine.item?.status === "blocked"
            ? `目标设备阻塞：${blockedTarget ? DEVICE_TYPES[blockedTarget.type].label : "下游设备"} 无法接收当前物料。${state.warning ?? "请检查前置工序。"}`
            : `目标设备阻塞：${blockedTarget ? DEVICE_TYPES[blockedTarget.type].label : "下游设备"} 的加工位与等待位已满，物料停在线上。请暂停后检查下游节拍或调整布局。`,
        }
      : state.warning
        ? { tone: "warning", message: `目标设备阻塞：${state.warning}` }
        : routingWaitConnection
          ? {
              tone: "wait",
              message: `分支 ${String.fromCharCode(65 + routingWaitConnection.branchIndex)} 正在等待：轮到的线路被占用，物料保留且不会跳过。请等待支路清空，或暂停后调整支路负载。`,
            }
          : null;
  const visibleFeedback = state.mode === "running" ? contextualFeedback : null;
  const visibleWarning = visibleFeedback?.tone === "warning";
  const visibleWait = visibleFeedback?.tone === "wait";
  const playerFeedback = getPlayerFeedback(
    state.mode,
    contextualFeedback?.message ?? state.warning,
    toast,
  );
  const failureDiagnostic = getFailureDiagnostic(
    state.warning,
    contextualFeedback?.message,
    level.routeHint,
  );
  const productionActionLabel = getProductionActionLabel(state.mode, editedWhilePaused);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConnectingFrom(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  const beginPaletteDrag = (event: DragEvent<HTMLElement>, type: DeviceType) => {
    event.dataTransfer.setData("application/x-factory-palette", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  const beginMove = (event: DragEvent<HTMLElement>, id: string) => {
    event.dataTransfer.setData("application/x-factory-device", id);
    event.dataTransfer.effectAllowed = "move";
  };

  const dropOnFloor = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (locked || !floorRef.current) return;
    const bounds = floorRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(bounds.width - (MACHINE.width + 10), event.clientX - bounds.left - MACHINE.width / 2));
    const y = Math.max(54, Math.min(bounds.height - (MACHINE.height + 12), event.clientY - bounds.top - MACHINE.height / 2));
    const cell = snapToGrid(x, y);
    const type = event.dataTransfer.getData("application/x-factory-palette") as DeviceType;
    const id = event.dataTransfer.getData("application/x-factory-device");
    if (type && DEVICE_TYPES[type]) {
      const placedCount = Object.values(design.devices).filter((device) => device.type === type).length;
      if (placedCount >= getDeviceLimit(level, type)) {
        setToast(`${DEVICE_TYPES[type].label}已达到本关上限。设备不是从空气里变出来的。`);
        return;
      }
      if (!canPlaceDevice(design, level, cell)) {
        setToast("这个位置会与障碍或其他设备重叠，请换一格。 ");
        return;
      }
      mutateDesign((current) => addDevice(current, type, x, y));
      setToast(`${DEVICE_TYPES[type].label}已放置。`);
    } else if (id) {
      if (!canPlaceDevice(design, level, cell, id)) {
        setToast("这个位置会与障碍或其他设备重叠，设备拒绝叠罗汉。 ");
        return;
      }
      mutateDesign((current) => moveDevice(current, id, x, y));
      setToast("设备位置已更新。 ");
    }
  };

  const finishConnection = (to: string) => {
    if (!connectingFrom || locked) return;
    const before = design;
    const next = connectDevices(before, connectingFrom, to, level);
    setConnectingFrom(null);
    if (next === before) {
      setToast("端口已经占用，或这个连接方向不成立。机器也有底线。 ");
      return;
    }
    mutateDesign(() => next);
    setToast("连线完成。运行前再检查一下工序顺序。 ");
  };

  const handleStart = () => {
    if (Object.keys(design.devices).length === 0) {
      setToast("画布还是空的。机器不会靠意念开工。 ");
      return;
    }
    setConnectingFrom(null);
    start();
    setToast(editedWhilePaused ? "设计已更新，本轮生产从零开始。" : "产线启动，布局已锁定。");
  };

  const handlePause = () => {
    pause();
    setToast("生产已暂停。现在可以调整设备和连线。 ");
  };

  const resetAttempt = (keepDesign: boolean) => {
    reset(keepDesign);
    setConnectingFrom(null);
    setToast(keepDesign ? "生产状态已清空，设备和连线为你保留。" : "画布已清空，重新设计吧。 ");
  };

  const averageOutput = useMemo(
    () => state.elapsed > 0 ? ((state.completed / state.elapsed) * 60).toFixed(1) : "0.0",
    [state.completed, state.elapsed],
  );

  const allMachinesPlaced = Object.keys(design.devices).length === requiredDeviceCount;
  const remainingDevices = Math.max(0, requiredDeviceCount - Object.keys(design.devices).length);
  const closeOnboarding = () => setShowOnboarding(false);
  const openOnboarding = () => {
    setShowLevelSelect(false);
    setShowOnboarding(true);
  };

  const openLevelSelect = () => {
    if (locked) return;
    setShowOnboarding(false);
    setShowLevelSelect(true);
  };

  const handleClearProgressDecision = (confirmed: boolean) => {
    setShowClearProgressConfirm(false);
    if (!confirmed) return;

    clearProgress();
    setConnectingFrom(null);
    setShowLevelSelect(false);
    setShowOnboarding(true);
    setToast("本地进度已清除，已回到第 1 关。");
  };

  const paletteDetail = (type: DeviceType) => {
    if (type === "source") return `每 ${level.sourceInterval} 秒生成长钢棒`;
    if (type === "cutter") return `${level.machineDurations.cutter} 秒 · 钢棒变短料`;
    if (type === "lathe") return `${level.machineDurations.lathe} 秒 · 短料变${level.id === 1 ? "螺栓" : "未钻孔螺栓"}`;
    if (type === "drill") return `${level.machineDurations.drill} 秒 · 钻孔成为合格螺栓`;
    return "即时接收合格螺栓";
  };

  const selectLevel = (levelId: number) => {
    if (!selectSessionLevel(levelId)) {
      setToast("这一关还锁着。先把前一关收拾明白。 ");
      return;
    }
    setConnectingFrom(null);
    setShowLevelSelect(false);
    setShowOnboarding(levelId === 1);
    setToast(`第 ${levelId} 关已载入。先摆设备，再连产线。`);
  };

  return (
    <main className="factory-app">
      <header className="app-header" inert={overlayOpen ? true : undefined}>
        <div className="brand-lockup">
          <span className="brand-mark">M<span>F</span></span>
          <div><b>迷你自动化工厂</b><small>MINI AUTOMATION FACTORY · CHAPTER ONE</small></div>
        </div>
        <div className="level-title">
          <span>章节关卡 {String(activeLevelId).padStart(2, "0")}</span>
          <h1>{`第 ${activeLevelId} 关：${level.name}`}</h1>
        </div>
        <div className="header-status">
          <span className={`status-light status-light--${state.mode}`} />
          <div><small>系统状态</small><b>{state.mode === "running" ? "生产中" : state.mode === "paused" ? "已暂停" : "设计模式"}</b></div>
          <button className="chapter-control" type="button" aria-label="打开关卡选择" onClick={openLevelSelect} disabled={locked}>
            <span aria-hidden="true">⌘</span>关卡
          </button>
          {activeLevelId === 1 && (
            <button className="help-control" type="button" aria-label="打开玩法说明" onClick={openOnboarding}>
              <span aria-hidden="true">?</span>玩法
            </button>
          )}
          <button className="clear-progress-control" type="button" aria-label="清除本地进度" onClick={() => setShowClearProgressConfirm(true)}>
            <span aria-hidden="true">×</span>清除进度
          </button>
        </div>
      </header>

      <section className="mission-strip" aria-label="关卡目标" inert={overlayOpen ? true : undefined}>
        <div><span className="mission-tag">MISSION</span><p>{`${level.duration} 秒内生产 `}<b>{level.target}</b> 个合格螺栓</p></div>
        <div className="route-hint"><span>{level.routeHint}</span></div>
        <div className="mission-metrics">
          <div><small>剩余时间</small><strong className={remaining <= 10 ? "urgent" : ""}>{remaining.toFixed(1)}<em>s</em></strong></div>
          <div><small>合格产出</small><strong>{state.completed}<em>/{level.target}</em></strong></div>
        </div>
      </section>

      <div className="workspace" inert={overlayOpen ? true : undefined}>
        <aside className="equipment-panel">
          <div className="panel-heading"><span>设备库</span><small>拖入画布</small></div>
          <div className="equipment-list">
            {palette.map((item) => {
              const placedCount = Object.values(design.devices).filter((device) => device.type === item.type).length;
              const atLimit = placedCount >= item.limit;
              return (
                <article
                  key={item.type}
                  className={`palette-card ${atLimit ? "palette-card--placed" : ""}`}
                  draggable={!locked && !atLimit}
                  onDragStart={(event) => beginPaletteDrag(event, item.type)}
                >
                  <span className="palette-card__icon">{item.icon}</span>
                  <div><small>{item.eyebrow}</small><b>{DEVICE_TYPES[item.type].label}</b><p>{paletteDetail(item.type)}</p></div>
                  <span className="palette-card__state">{atLimit ? "已放齐" : `${placedCount}/${item.limit}`}</span>
                </article>
              );
            })}
          </div>
          <div className="capacity-note"><b>容量规则</b><p>每台机器：1 个加工位 + 1 个等待位</p><p>每条连线：同时运输 1 件物料</p></div>
        </aside>

        <section className="floor-section">
          <FactoryFloor
            design={design}
            state={state}
            level={level}
            locked={locked}
            connectingFrom={connectingFrom}
            floorRef={floorRef}
            onDrop={dropOnFloor}
            onMoveStart={beginMove}
            onStartConnection={setConnectingFrom}
            onConnect={finishConnection}
            onRemoveConnection={(id) => mutateDesign((current) => removeConnection(current, id))}
          />
          <div className={`feedback-bar ${visibleWarning ? "feedback-bar--warning" : visibleWait ? "feedback-bar--wait" : ""}`} role="status" aria-live="polite">
            <span>{visibleWarning ? "!" : visibleWait ? "Ⅱ" : state.mode === "running" ? "▶" : "i"}</span>
            <p>{playerFeedback}</p>
            <small>{visibleWait ? "线路等待" : locked ? "布局锁定" : allMachinesPlaced ? "设备齐全" : `还需放置 ${remainingDevices} 台设备`}</small>
          </div>
        </section>
      </div>

      <footer className="control-deck" inert={overlayOpen ? true : undefined}>
        <div className="progress-cluster"><span>任务进度</span><div className="task-progress"><i style={{ width: `${completion}%` }} /></div><b>{Math.round(completion)}%</b></div>
        <div className="control-buttons">
          {state.mode !== "running" ? (
            <button className="primary-control" onClick={handleStart}>
              <span>▶</span>{productionActionLabel}
            </button>
          ) : (
            <button className="pause-control" onClick={handlePause}><span>Ⅱ</span>暂停生产</button>
          )}
          <button className="ghost-control" onClick={() => resetAttempt(true)} disabled={state.mode === "running"}>↻ 重置本轮</button>
          <button className="ghost-control" onClick={() => resetAttempt(false)} disabled={state.mode === "running"}>× 清空画布</button>
        </div>
        <div className="legend"><span><i className="legend-working" />加工中</span><span><i className="legend-wait" />等待</span><span><i className="legend-error" />错误</span></div>
      </footer>

      {showOnboarding && !showLevelSelect && state.mode !== "success" && state.mode !== "failure" && (
        <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <section className="onboarding-card">
            <button className="onboarding-close" type="button" aria-label="关闭玩法说明" onClick={closeOnboarding} autoFocus>×</button>
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

      {(state.mode === "success" || state.mode === "failure") && !showLevelSelect && (
        <div className="settlement-backdrop" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
          <section className={`settlement-card settlement-card--${state.mode}`}>
            <span className="settlement-kicker">PRODUCTION REPORT</span>
            <div className="settlement-icon">{state.mode === "success" ? "✓" : "!"}</div>
            <h2 id="settlement-title">{state.mode === "success" ? `第 ${activeLevelId} 关完成！` : `第 ${activeLevelId} 关未完成`}</h2>
            <p>{state.mode === "success"
              ? hasNextLevel
                ? `${level.name}稳定运行，第 ${activeLevelId + 1} 关已解锁。`
                : `${level.name}稳定运行，第一章全部验收通过。`
              : failureDiagnostic}</p>
            <div className="settlement-stats">
              <div><small>合格螺栓</small><strong>{state.completed} / {level.target}</strong></div>
              <div><small>完成时间</small><strong>{state.elapsed.toFixed(1)} 秒</strong></div>
              <div><small>平均产量</small><strong>{averageOutput} 件/分钟</strong></div>
            </div>
            {state.mode === "success" && recordBroken && (
              <p className="settlement-record-feedback" role="status" aria-live="polite">🏆 本次刷新纪录</p>
            )}
            {state.mode === "success" && activeBestResult && (
              <p className="settlement-best-result">最佳纪录 <strong>{activeBestResult.elapsed.toFixed(1)} 秒</strong></p>
            )}
            <div className="settlement-actions">
              <button className="settlement-primary" onClick={() => resetAttempt(true)} autoFocus>重新挑战</button>
              {state.mode === "success" && hasNextLevel && (
                <button onClick={() => selectLevel(activeLevelId + 1)}>下一关</button>
              )}
              <button onClick={openLevelSelect}>返回关卡选择</button>
            </div>
          </section>
        </div>
      )}

      {showLevelSelect && (
        <LevelSelectModal
          unlockedLevel={unlockedLevel}
          activeLevel={activeLevelId}
          bestResults={bestResults}
          onSelect={selectLevel}
          onClose={() => setShowLevelSelect(false)}
        />
      )}

      {showClearProgressConfirm && (
        <div className="settlement-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-progress-title">
          <section className="settlement-card settlement-card--failure clear-progress-card">
            <span className="settlement-kicker">LOCAL PROGRESS</span>
            <div className="settlement-icon">!</div>
            <h2 id="clear-progress-title">清除本地进度？</h2>
            <p>关卡解锁、最佳纪录和当前布局都会删除，并回到第 1 关。这个按钮不负责后悔药。</p>
            <div className="settlement-actions">
              <button type="button" onClick={() => handleClearProgressDecision(false)} autoFocus>取消</button>
              <button className="clear-progress-confirm" type="button" onClick={() => handleClearProgressDecision(true)}>确认清除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
