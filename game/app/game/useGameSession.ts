import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVELS, advanceProduction, pauseProduction } from "./factory-model.mjs";
import type { FactoryDesign } from "./factory-model.mjs";
import {
  applyProductionState,
  clearGameSession,
  enqueueSessionOrder,
  moveSessionQueuedOrder,
  prioritizeSessionOrder,
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
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const frameRef = useRef<number | null>(null);
  const previousTime = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const onRestoredRef = useRef(onRestored);
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

  const selectLevel = useCallback((levelId: number) => {
    const selected = selectGameLevel(undefined, session, levelId);
    if (!selected.accepted) return false;
    sessionRef.current = selected.session;
    setSession(selected.session);
    return true;
  }, [session]);

  const clearProgress = useCallback(() => {
    const cleared = createSession(clearGameSession(undefined));
    sessionRef.current = cleared;
    setSession(cleared);
  }, []);

  return {
    ...session,
    level,
    hasRestoredSession,
    mutateDesign,
    start,
    pause,
    reset,
    enqueueOrder,
    moveOrderUp,
    moveOrderDown,
    prioritizeOrder,
    selectLevel,
    clearProgress,
  };
}
