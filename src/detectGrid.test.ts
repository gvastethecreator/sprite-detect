import { describe, expect, it } from "vitest";

import {
  buildDetectedCells,
  computeWorkSize,
  detectGridFromBuffer,
  findSegments,
  getEnergyProfile,
} from "./detectGrid.ts";

const checkerRect = (
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const on = (x + y) % 2 === 0;
      const offset = (y * width + x) * 4;
      const value = on ? 255 : 0;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
};

describe("detectGrid", () => {
  it("keeps small images at native work size instead of stretching to 600", () => {
    expect(computeWorkSize(96, 64)).toEqual({ workWidth: 96, workHeight: 64, scale: 1 });
  });

  it("scales wide images down to the max side", () => {
    const size = computeWorkSize(1200, 600);
    expect(size.workWidth).toBe(600);
    expect(size.workHeight).toBe(300);
    expect(size.scale).toBe(0.5);
  });

  it("finds two high-energy bands separated by a quiet gap", () => {
    const profile = new Float32Array(40);
    profile.fill(0);
    profile.fill(100, 2, 14);
    profile.fill(100, 26, 38);

    const segments = findSegments(profile, 40);
    expect(segments).toHaveLength(2);
    expect(segments?.[0]?.start).toBe(2);
    expect(segments?.[1]?.start).toBe(26);
  });

  it("detects a 2×2 block layout from an energy-separated buffer", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    data.fill(128);
    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255;
    }

    checkerRect(data, width, 0, 0, 16, 16);
    checkerRect(data, width, 24, 0, 40, 16);
    checkerRect(data, width, 0, 24, 16, 40);
    checkerRect(data, width, 24, 24, 40, 40);

    const energyY = getEnergyProfile(data, width, height, "y");
    expect(energyY[8]).toBeGreaterThan(energyY[20] ?? 0);

    const detected = detectGridFromBuffer({ data, width, height }, 1);
    expect(detected?.rows).toHaveLength(2);
    expect(detected?.cols).toHaveLength(2);

    const cells = buildDetectedCells(detected!);
    expect(cells).toHaveLength(4);
    expect(cells[0]?.w).toBeGreaterThan(0);
    expect(cells[0]?.h).toBeGreaterThan(0);
  });
});
