import { describe, expect, it } from "vitest";

import { buildManualGrid } from "./grid.ts";

describe("buildManualGrid", () => {
  it("creates a full manual grid preserving the last column and row remainder", () => {
    const cells = buildManualGrid(100, 80, 3, 3);

    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 33, h: 26 });
    expect(cells[8]).toEqual({ x: 66, y: 52, w: 34, h: 28 });
  });

  it("clamps rows/cols to at least 1 in buildManualGrid", () => {
    const cells = buildManualGrid(100, 100, 0, 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
