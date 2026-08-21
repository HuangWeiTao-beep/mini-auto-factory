export const GRID = Object.freeze({ cellSize: 36, columns: 24, rows: 14 });
export const MACHINE = Object.freeze({ width: 154, height: 132, portY: 67 });

export function snapToGrid(x, y) {
  return {
    gridX: Math.round(x / GRID.cellSize),
    gridY: Math.round(y / GRID.cellSize),
  };
}

export function isObstaclePlacement(level, cell) {
  return level.obstacles.some(
    (obstacle) =>
      obstacle.gridX === cell.gridX && obstacle.gridY === cell.gridY,
  );
}

export function manhattanDistance(from, to) {
  return Math.abs(from.gridX - to.gridX) + Math.abs(from.gridY - to.gridY);
}
