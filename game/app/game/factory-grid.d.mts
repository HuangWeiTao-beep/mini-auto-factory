export interface GridCell {
  gridX: number;
  gridY: number;
}

export const GRID: Readonly<{ cellSize: 36; columns: 24; rows: 14 }>;
export function snapToGrid(x: number, y: number): GridCell;
export function isObstaclePlacement(level: { obstacles: readonly GridCell[] }, cell: GridCell): boolean;
export function manhattanDistance(from: GridCell, to: GridCell): number;
