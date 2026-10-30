import { describe, expect, it } from "vitest";
import { detectSprites } from "./detectSprites.ts";

const W = 40;
const H = 24;

const sheet = (
  paint: (put: (x: number, y: number, a: number) => void) => void,
  width = W,
  height = H,
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  paint((x, y, a) => {
    data[(y * width + x) * 4 + 3] = a;
  });
  return { data, width, height };
};

const rect = (
  put: (x: number, y: number, a: number) => void,
  [left, top, right, bottom]: number[],
  alpha = 255,
) => {
  for (let y = top!; y <= bottom!; y += 1) {
    for (let x = left!; x <= right!; x += 1) put(x, y, alpha);
  }
};

const expectEveryVisiblePixelOwned = (buffer: { data: Uint8ClampedArray }, labels: Uint32Array) => {
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    expect(labels[pixel] !== 0).toBe(buffer.data[pixel * 4 + 3] !== 0);
  }
};

describe("detectSprites (alpha hysteresis)", () => {
  it("keeps the antialiased edge with its sprite, and still owns it when the halo is off", () => {
    const buffer = sheet((put) => {
      rect(put, [3, 4, 10, 18]);
      rect(put, [2, 4, 2, 18], 30); // weak edge column left of sprite 1
      rect(put, [11, 4, 11, 18], 30); // weak edge column right of sprite 1
      rect(put, [24, 2, 37, 19]);
      rect(put, [24, 20, 37, 20], 1); // below alpha_low: only the pending rule keeps it
    });
    const { cells, labels, flags } = detectSprites(buffer);
    expect(cells).toEqual([
      { x: 2, y: 4, w: 10, h: 15 },
      { x: 24, y: 2, w: 14, h: 19 },
    ]);
    expect(labels[10 * W + 2]).toBe(1);
    expect(labels[20 * W + 30]).toBe(2);
    expect(flags).toEqual([[], ["fragments_merged"]]);
    expectEveryVisiblePixelOwned(buffer, labels);

    const noHalo = detectSprites(buffer, 0, { haloRadius: 0 });
    expect(noHalo.cells).toEqual(cells);
    expect(noHalo.flags[0]).toEqual(["fragments_merged"]);
    expectEveryVisiblePixelOwned(buffer, noHalo.labels);
  });

  it("merges a tiny fragment near a sprite (within twice the halo) instead of dropping or splitting it", () => {
    const buffer = sheet((put) => {
      rect(put, [1, 6, 9, 17]);
      rect(put, [22, 4, 33, 19]);
      rect(put, [37, 1, 38, 2]); // 4 strong pixels, below min_strong_pixels
    });
    const { cells, labels, flags, strays } = detectSprites(buffer);
    expect(cells).toHaveLength(2);
    expect(cells[1]).toEqual({ x: 22, y: 1, w: 17, h: 19 });
    expect(labels[1 * W + 37]).toBe(2);
    expect(flags).toEqual([[], ["fragments_merged"]]);
    expect(strays).toEqual([]);
    expectEveryVisiblePixelOwned(buffer, labels);

    const strict = detectSprites(buffer, 0, { minStrongPixels: 4 });
    expect(strict.cells).toHaveLength(3);
  });

  it("keeps a far speck out of the cuts as a flagged stray with its pixels", () => {
    const buffer = sheet(
      (put) => {
        rect(put, [1, 4, 9, 19]);
        rect(put, [12, 4, 20, 19]);
        rect(put, [50, 20, 51, 21]); // 29 px from the nearest sprite, limit is 12
      },
      60,
      24,
    );
    const { cells, labels, flags, strays } = detectSprites(buffer);
    expect(cells).toEqual([
      { x: 1, y: 4, w: 9, h: 16 },
      { x: 12, y: 4, w: 9, h: 16 },
    ]);
    expect(flags).toEqual([[], []]);
    expect(strays).toEqual([
      { cell: { x: 50, y: 20, w: 2, h: 2 }, pixelCount: 4, flags: ["stray_fragment"] },
    ]);
    expect(labels[20 * 60 + 50]).toBe(cells.length + 1); // pixels stay in the result
    expectEveryVisiblePixelOwned(buffer, labels);

    // The limit follows the halo: with a wider halo the same speck is near enough to merge.
    const wide = detectSprites(buffer, 0, { haloRadius: 16 });
    expect(wide.strays).toEqual([]);
    expect(wide.cells[1]).toEqual({ x: 12, y: 4, w: 40, h: 18 });
  });

  it("splits touching halos deterministically and flags the conflict", () => {
    const buffer = sheet((put) => {
      rect(put, [2, 4, 9, 18]);
      rect(put, [15, 4, 22, 18]);
      rect(put, [10, 10, 14, 10], 20); // weak bridge, 5 px: both fronts meet at x=12
      rect(put, [10, 11, 14, 11], 20);
    });
    const { cells, labels, flags } = detectSprites(buffer);
    expect(labels[10 * W + 11]).toBe(1);
    expect(labels[10 * W + 12]).toBe(1); // tie goes to the lower sprite number
    expect(labels[10 * W + 13]).toBe(2);
    expect(cells.map((cell) => cell.w)).toEqual([11, 10]);
    expect(flags).toEqual([["neighbor_alpha_conflict"], ["neighbor_alpha_conflict"]]);
    expectEveryVisiblePixelOwned(buffer, labels);

    const short = detectSprites(buffer, 0, { haloRadius: 2 });
    expect(short.flags.flat()).toEqual(["fragments_merged"]); // the unreached middle column
    expectEveryVisiblePixelOwned(buffer, short.labels);
  });

  it("keeps the N largest as sprites when a count is set and reports impossible input", () => {
    const buffer = sheet((put) => {
      rect(put, [1, 2, 8, 12]);
      rect(put, [14, 2, 20, 12]);
      rect(put, [28, 14, 33, 20]);
    });
    const two = detectSprites(buffer, 2);
    expect(two.cells).toHaveLength(2);
    expect(two.cells[1]).toEqual({ x: 14, y: 2, w: 20, h: 19 });
    expect(() => detectSprites(buffer, 4)).toThrow(/Found 3 separate shapes for 4 sprites/);
    expect(() => detectSprites(sheet(() => {}))).toThrow(/No sprites found/);
    const opaque = { data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H };
    expect(() => detectSprites(opaque)).toThrow(/transparency/);
  });
});
