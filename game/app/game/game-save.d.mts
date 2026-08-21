export interface BestResult {
  elapsed: number;
  completed: number;
}

export interface FactoryDraft {
  devices: Record<string, unknown>;
  connections: unknown[];
}

export interface GameSaveState {
  version: 1;
  unlockedLevel: number;
  bestResults: Record<string, BestResult>;
  drafts: Record<string, FactoryDraft>;
}

export const SAVE_VERSION: 1;
export const SAVE_STORAGE_KEY: string;
export const DEFAULT_SAVE_STATE: Readonly<GameSaveState>;
export function createDefaultSaveState(): GameSaveState;
export function parseGameSave(raw: string | null): GameSaveState;
export function serializeGameSave(state: GameSaveState): string;
export function loadGameSave(storage?: Storage, key?: string): GameSaveState;
export function saveGameSave(storage: Storage | undefined, state: GameSaveState, key?: string): GameSaveState;
export function clearGameSave(storage?: Storage, key?: string): GameSaveState;
export const loadSave: typeof loadGameSave;
export const saveSave: typeof saveGameSave;
export const clearSave: typeof clearGameSave;
