import type { GridCell, PixelBuffer } from "./types.ts";

interface GridBand {
  start: number;
  size: number;
}

export interface DetectedGridBands {
  rows: GridBand[];
  cols: GridBand[];
}

export interface WorkSize {
  workWidth: number;
  workHeight: number;
  scale: number;
}

export const computeWorkSize = (width: number, height: number, maxSide = 600): WorkSize => {
  if (width <= 0 || height <= 0) {
    return { workWidth: 1, workHeight: 1, scale: 1 };
  }

  const scale = Math.min(1, maxSide / width);
  return {
    workWidth: Math.max(1, Math.round(width * scale)),
    workHeight: Math.max(1, Math.round(height * scale)),
    scale,
  };
};

export const getEnergyProfile = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: "x" | "y",
): Float32Array => {
  const length = axis === "x" ? width : height;
  const profile = new Float32Array(length);

  if (axis === "y") {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let x = 1; x < width; x += 1) {
        const current = (y * width + x) * 4;
        const previous = (y * width + x - 1) * 4;
        sum +=
          Math.abs((data[current] ?? 0) - (data[previous] ?? 0)) +
          Math.abs((data[current + 1] ?? 0) - (data[previous + 1] ?? 0)) +
          Math.abs((data[current + 2] ?? 0) - (data[previous + 2] ?? 0));
      }
      profile[y] = sum;
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let y = 1; y < height; y += 1) {
        const current = (y * width + x) * 4;
        const previous = ((y - 1) * width + x) * 4;
        sum +=
          Math.abs((data[current] ?? 0) - (data[previous] ?? 0)) +
          Math.abs((data[current + 1] ?? 0) - (data[previous + 1] ?? 0)) +
          Math.abs((data[current + 2] ?? 0) - (data[previous + 2] ?? 0));
      }
      profile[x] = sum;
    }
  }

  return profile;
};

export const findSegments = (
  profile: Float32Array,
  length: number,
): Array<{ start: number; end: number; size: number }> | null => {
  const maxValue = profile.reduce((max, value) => Math.max(max, value), 0);
  const threshold = maxValue * 0.05;
  const segments: Array<{ start: number; end: number; size: number }> = [];

  let start = 0;
  let inSegment = false;
  for (let index = 0; index < length; index += 1) {
    if ((profile[index] ?? 0) > threshold) {
      if (!inSegment) {
        start = index;
        inSegment = true;
      }
    } else if (inSegment) {
      inSegment = false;
      segments.push({ start, end: index, size: index - start });
    }
  }

  if (inSegment) {
    segments.push({ start, end: length, size: length - start });
  }

  const minSize = length * 0.05;
  const validSegments = segments.filter((segment) => segment.size > minSize);
  return validSegments.length > 0 ? validSegments : null;
};

export const detectGridFromBuffer = (buffer: PixelBuffer, scale = 1): DetectedGridBands | null => {
  const safeScale = scale === 0 ? 1 : scale;
  const rowProfile = getEnergyProfile(buffer.data, buffer.width, buffer.height, "y");
  const colProfile = getEnergyProfile(buffer.data, buffer.width, buffer.height, "x");
  const rowSegments = findSegments(rowProfile, buffer.height);
  const colSegments = findSegments(colProfile, buffer.width);

  if (!rowSegments || !colSegments) {
    return null;
  }

  return {
    rows: rowSegments.map((segment) => ({
      start: segment.start / safeScale,
      size: segment.size / safeScale,
    })),
    cols: colSegments.map((segment) => ({
      start: segment.start / safeScale,
      size: segment.size / safeScale,
    })),
  };
};

export const buildDetectedCells = (detected: DetectedGridBands): GridCell[] => {
  const cells: GridCell[] = [];

  for (let row = 0; row < detected.rows.length; row += 1) {
    for (let col = 0; col < detected.cols.length; col += 1) {
      const detectedCol = detected.cols[col];
      const detectedRow = detected.rows[row];
      if (!detectedCol || !detectedRow) {
        continue;
      }

      cells.push({
        x: detectedCol.start,
        y: detectedRow.start,
        w: detectedCol.size,
        h: detectedRow.size,
      });
    }
  }

  return cells;
};
