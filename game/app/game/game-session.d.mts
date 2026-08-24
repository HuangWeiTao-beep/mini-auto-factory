import type {
  FactoryDesign,
  LevelConfig,
  ProductionScenario,
  ProductionState,
} from "./factory-model.mjs";
import type { GameSaveState } from "./game-save.mjs";

export interface BestResult {
  elapsed: number;
  completed: number;
}

export interface RestoredGameSession {
  activeLevelId: number;
  unlockedLevel: number;
  bestResults: Record<number, BestResult>;
  drafts: Record<number, FactoryDesign>;
  orderScenarioSeeds: Record<number, number>;
  scenario: ProductionScenario | null;
  design: FactoryDesign;
  state: ProductionState;
}

export interface GameSession extends RestoredGameSession {
  editedWhilePaused: boolean;
  recordBroken: boolean;
}

export interface PersistedGameSession {
  activeLevelId: number;
  unlockedLevel: number;
  bestResults: Record<number, BestResult>;
  drafts: Record<number, FactoryDesign>;
  orderScenarioSeeds: Record<number, number>;
  design: FactoryDesign;
  state: Pick<ProductionState, "mode">;
}

export interface PersistableGameSession {
  activeLevelId: number;
  unlockedLevel: number;
  bestResults: Record<number, BestResult>;
  drafts?: Record<number, FactoryDesign>;
  orderScenarioSeeds: Record<number, number>;
  design: FactoryDesign;
  state: Pick<ProductionState, "mode">;
}

type GameSaveStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>;
type GameSaveStore = GameSaveStorage & Partial<Pick<Storage, "removeItem">>;

export function recordBestResult(bestResults: Record<number, BestResult>, levelId: number, result: BestResult): Record<number, BestResult>;
export function generateOrderScenarioSeed(
  previousSeed?: number,
  cryptoSource?: Pick<Crypto, "getRandomValues">,
): number;
export function restoreGameSession(storage?: GameSaveStorage, selectedLevelId?: number): RestoredGameSession;
export function shouldShowOnboardingAfterRestore(session: RestoredGameSession): boolean;
export function applyProductionState(session: GameSession, nextState: ProductionState, level: LevelConfig): GameSession;
export function selectGameLevel(storage: GameSaveStorage | undefined, session: GameSession, levelId: number): { accepted: boolean; session: GameSession };
export function updateGameDesign(session: GameSession, nextDesign: FactoryDesign): GameSession;
export function startGameSession(session: GameSession, level: LevelConfig): GameSession;
export function resetGameSession(session: GameSession, keepDesign: boolean): GameSession;
export function enqueueSessionOrder(session: GameSession, orderId: string): GameSession;
export function moveSessionQueuedOrder(
  session: GameSession,
  orderId: string,
  nextIndex: number,
): GameSession;
export function prioritizeSessionOrder(session: GameSession, orderId: string): GameSession;
export function requestSessionMaintenance(session: GameSession, machineId: string): GameSession;
export function cancelSessionMaintenance(session: GameSession, machineId: string): GameSession;
export function moveSessionMaintenance(session: GameSession, machineId: string, nextIndex: number): GameSession;
export function prioritizeSessionMaintenance(session: GameSession, machineId: string): GameSession;
export function toPersistedGameSession(session: PersistableGameSession): PersistedGameSession;
export function saveGameSession(storage: GameSaveStorage | undefined, session: PersistableGameSession): GameSaveState;
export function clearGameSession(storage?: GameSaveStore): RestoredGameSession;
export function resolveClearProgressDecision<T>(confirmed: boolean, currentSession: T, clearSession: () => T): T;
