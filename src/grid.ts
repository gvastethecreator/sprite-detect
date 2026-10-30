import type { GridCell } from "./types.ts";

/** Equal cells in row-major order. The last column and row absorb the remainder. */
export const buildManualGrid = (
  totalWidth: number,
  totalHeight: number,
  rows: number,
  cols: number,
): GridCell[] => {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const cellWidth = Math.floor(totalWidth / safeCols);
  const cellHeight = Math.floor(totalHeight / safeRows);
  const cells: GridCell[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      cells.push({
        x: col * cellWidth,
        y: row * cellHeight,
        w: col === safeCols - 1 ? totalWidth - col * cellWidth : cellWidth,
        h: row === safeRows - 1 ? totalHeight - row * cellHeight : cellHeight,
      });
    }
  }

  return cells;
};
