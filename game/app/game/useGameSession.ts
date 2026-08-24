import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEVICE_TYPES, LEVELS, advanceProduction, pauseProduction } from "./factory-model.mjs";
import type { FactoryDesign } from "./factory-model.mjs";
import {
  applyProductionState,
  cancelSessionMaintenance,
  clearGameSession,
  enqueueSessionOrder,
  moveSessionQueuedOrder,
  moveSessionMaintenance,
  prioritizeSessionMaintenance,
  prioritizeSessionOrder,
  requestSessionMaintenance,
  resetGameSession,
  restoreGameSession,
  saveGameSession,
  selectGameLevel,
  startGameSession,
  toPersistedGameSession,
  updateGameDesign,
} from "./game-session.mjs";

const emptyStorage = { getItem: () => null };

function createSession(restored: ReturnType<typeof restoreGameSession>) {
  return {
    ...restored,
    editedWhilePaused: false,
    recordBroken: false,
  };
}

export function useGameSession(options: {
  onRestored?: (session: ReturnType<typeof createSession>) => void;
} = {}) {
  const { onRestored } = options;
  const [initialSession] = useState(() => createSession(restoreGameSession(emptyStorage)));
  const [session, setSession] = useState(initialSession);
  const [maintenanceAlert, setMaintenanceAlert] = useState<{ message: string; at: number } | null>(null);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const frameRef = useRef<number | null>(null);
  const previousTime = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const onRestoredRef = useRef(onRestored);
  const notifiedMaintenanceEvents = useRef(new Set<string>());
  const level = LEVELS[session.activeLevelId];
  const {
    activeLevelId: persistedActiveLevelId,
    unlockedLevel: persistedUnlockedLevel,
    bestResults: persistedBestResults,
    drafts: persistedDrafts,
    orderScenarioSeeds: persistedOrderScenarioSeeds,
    design: persistedDesign,
  } = session;
  const persistedStateMode = session.state.mode;

  useEffect(() => {
    onRestoredRef.current = onRestored;
  }, [onRestored]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const restored = createSession(restoreGameSession(undefined));
      sessionRef.current = restored;
      setSession(restored);
      onRestoredRef.current?.(restored);
      setHasRestoredSession(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const persistedSession = useMemo(
    () => toPersistedGameSession({
      activeLevelId: persistedActiveLevelId,
      unlockedLevel: persistedUnlockedLevel,
      bestResults: persistedBestResults,
      drafts: persistedDrafts,
      orderScenarioSeeds: persistedOrderScenarioSeeds,
      design: persistedDesign,
      state: { mode: persistedStateMode },
    }),
    [
      persistedActiveLevelId,
      persistedUnlockedLevel,
      persistedBestResults,
      persistedDrafts,
      persistedOrderScenarioSeeds,
      persistedDesign,
      persistedStateMode,
    ],
  );

  useEffect(() => {
    if (!hasRestoredSession) return;
    saveGameSession(undefined, persistedSession);
  }, [hasRestoredSession, persistedSession]);

  useEffect(() => {
    if (session.state.mode !== "running") {
      previousTime.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    const loop = (time: number) => {
      const previous = previousTime.current ?? time;
      previousTime.current = time;
      const delta = Math.min(0.1, (time - previous) / 1000);
      const current = sessionRef.current;
      const currentLevel = LEVELS[current.activeLevelId];
      const nextState = advanceProduction(current.state, current.design, currentLevel, delta);
      let nextMaintenanceMessage: string | null = null;
      for (const [machineId, machine] of Object.entries(nextState.machines)) {
        const previousMachine = current.state.machines[machineId];
        const previousWear = previousMachine?.reliability?.wear ?? 0;
        const wear = machine.reliability?.wear ?? 0;
        const label = current.design.devices[machineId]
          ? DEVICE_TYPES[current.design.devices[machineId].type].label
          : machineId;
        const warningKey = `${machineId}:60`;
        const dangerKey = `${machineId}:85`;
        const breakdownKey = `${machineId}:broken`;
        if (previousWear < 60 && wear >= 60 && !notifiedMaintenanceEvents.current.has(warningKey)) {
          notifiedMaintenanceEvents.current.add(warningKey);
          nextMaintenanceMessage = `${label}磨损达到 60%，建议尽快安排计划维护。`;
        }
        if (previousWear < 85 && wear >= 85 && !notifiedMaintenanceEvents.current.has(dangerKey)) {
          notifiedMaintenanceEvents.current.add(dangerKey);
          nextMaintenanceMessage = `${label}进入高危状态，加工时间已增加 20%。`;
        }
        if (machine.reliability?.status === "broken"
          && previousMachine?.reliability?.status !== "broken"
          && !notifiedMaintenanceEvents.current.has(breakdownKey)) {
          notifiedMaintenanceEvents.current.add(breakdownKey);
          nextMaintenanceMessage = `${label}发生故障，已加入故障抢修队列。`;
        }
      }
      if (nextMaintenanceMessage) {
        setMaintenanceAlert({ message: nextMaintenanceMessage, at: nextState.elapsed });
      }
      const next = applyProductionState(current, nextState, currentLevel);
      sessionRef.current = next;
      setSession(next);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [level, session.state.mode]);

  const mutateDesign = useCallback((mutation: (design: FactoryDesign) => FactoryDesign) => {
    const next = updateGameDesign(session, mutation(session.design));
    if (next === session) return;
    sessionRef.current = next;
    setSession(next);
  }, [session]);

  const start = useCallback(() => {
    const next = startGameSession(session, level);
    if (session.editedWhilePaused) {
      notifiedMaintenanceEvents.current.clear();
      setMaintenanceAlert(null);
    }
    sessionRef.current = next;
    setSession(next);
  }, [level, session]);

  const pause = useCallback(() => {
    const next = { ...session, state: pauseProduction(session.state), recordBroken: false };
    sessionRef.current = next;
    setSession(next);
  }, [session]);

  const reset = useCallback((keepDesign: boolean) => {
    const next = resetGameSession(session, keepDesign);
    notifiedMaintenanceEvents.current.clear();
    setMaintenanceAlert(null);
    sessionRef.current = next;
    setSession(next);
  }, [session]);

  const enqueueOrder = useCallback((orderId: string) => {
    const current = sessionRef.current;
    const next = enqueueSessionOrder(current, orderId);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const moveOrder = useCallback((orderId: string, offset: number) => {
    const current = sessionRef.current;
    const currentIndex = current.state.queue?.indexOf(orderId) ?? -1;
    if (currentIndex < 0) return false;
    const next = moveSessionQueuedOrder(current, orderId, currentIndex + offset);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const moveOrderUp = useCallback(
    (orderId: string) => moveOrder(orderId, -1),
    [moveOrder],
  );

  const moveOrderDown = useCallback(
    (orderId: string) => moveOrder(orderId, 1),
    [moveOrder],
  );

  const prioritizeOrder = useCallback((orderId: string) => {
    const current = sessionRef.current;
    const next = prioritizeSessionOrder(current, orderId);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const requestMaintenance = useCallback((machineId: string) => {
    const current = sessionRef.current;
    const next = requestSessionMaintenance(current, machineId);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const cancelMaintenance = useCallback((machineId: string) => {
    const current = sessionRef.current;
    const next = cancelSessionMaintenance(current, machineId);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const moveMaintenance = useCallback((machineId: string, offset: number) => {
    const current = sessionRef.current;
    const currentIndex = current.state.maintenance?.queue.findIndex(
      (job) => job.machineId === machineId,
    ) ?? -1;
    if (currentIndex < 0) return false;
    const next = moveSessionMaintenance(current, machineId, currentIndex + offset);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const moveMaintenanceUp = useCallback(
    (machineId: string) => moveMaintenance(machineId, -1),
    [moveMaintenance],
  );

  const moveMaintenanceDown = useCallback(
    (machineId: string) => moveMaintenance(machineId, 1),
    [moveMaintenance],
  );

  const prioritizeMaintenance = useCallback((machineId: string) => {
    const current = sessionRef.current;
    const next = prioritizeSessionMaintenance(current, machineId);
    if (next === current) return false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, []);

  const selectLevel = useCallback((levelId: number) => {
    const selected = selectGameLevel(undefined, session, levelId);
    if (!selected.accepted) return false;
    notifiedMaintenanceEvents.current.clear();
    setMaintenanceAlert(null);
    sessionRef.current = selected.session;
    setSession(selected.session);
    return true;
  }, [session]);

  const clearProgress = useCallback(() => {
    const cleared = createSession(clearGameSession(undefined));
    notifiedMaintenanceEvents.current.clear();
    setMaintenanceAlert(null);
    sessionRef.current = cleared;
    setSession(cleared);
  }, []);

  return {
    ...session,
    level,
    hasRestoredSession,
    maintenanceAlert,
    mutateDesign,
    start,
    pause,
    reset,
    enqueueOrder,
    moveOrderUp,
    moveOrderDown,
    prioritizeOrder,
    requestMaintenance,
    cancelMaintenance,
    moveMaintenanceUp,
    moveMaintenanceDown,
    prioritizeMaintenance,
    selectLevel,
    clearProgress,
  };
}
