import type { GridCell, PixelBuffer, SpriteDetectOptions } from "./types.ts";

// Alpha-first hysteresis from spritesheet-expert (deterministic-item-atlas):
//   strong pixels (alpha >= alphaHigh) form 8-connected seed components,
//   weak pixels (alpha >= alphaLow) join a seed only within haloRadius,
//   strong components under minStrongPixels stay pending.
// The skill keeps pending pixels visible. Here each pending group either merges into the nearest
// sprite (box gap within 2 x haloRadius) or becomes a stray fragment. Every visible pixel keeps
// exactly one label, so nothing is dropped from the data.

export const DEFAULT_SPRITE_DETECT: SpriteDetectOptions = {
  alphaHigh: 64,
  alphaLow: 2,
  haloRadius: 6,
  minStrongPixels: 12,
};

export type SpriteFlag = "neighbor_alpha_conflict" | "fragments_merged";

export interface StrayFragment {
  cell: GridCell;
  pixelCount: number;
  /** Always set: a stray needs review before it is cut or discarded. */
  flags: ["stray_fragment"];
}

export interface DetectedSprites {
  cells: GridCell[];
  /**
   * Per pixel: 1-based sprite number in reading order, 0 for fully transparent. Stray pixels
   * carry `cells.length + 1 + index` of their entry in `strays`.
   */
  labels: Uint32Array;
  /** Review hints per sprite, same order as `cells`. */
  flags: SpriteFlag[][];
  /** Pending fragments farther than 2 x haloRadius from every sprite. Not part of `cells`. */
  strays: StrayFragment[];
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const MAX_HALO = 64;
const PENDING_VISITED = 255;

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));

const normalizeOptions = (options: Partial<SpriteDetectOptions>): SpriteDetectOptions => {
  const merged = { ...DEFAULT_SPRITE_DETECT, ...options };
  const alphaHigh = clampInt(merged.alphaHigh, 1, 255);
  return {
    alphaHigh,
    alphaLow: clampInt(merged.alphaLow, 1, alphaHigh),
    haloRadius: clampInt(merged.haloRadius, 0, MAX_HALO),
    minStrongPixels: clampInt(merged.minStrongPixels, 1, Number.MAX_SAFE_INTEGER),
  };
};

const gapSquared = (a: Box, b: Box) => {
  // Empty pixels between the boxes, so touching boxes are 0 apart.
  const dx = Math.max(a.left - b.right - 1, b.left - a.right - 1, 0);
  const dy = Math.max(a.top - b.bottom - 1, b.top - a.bottom - 1, 0);
  return dx * dx + dy * dy;
};

const centerDistanceSquared = (a: Box, b: Box) =>
  (a.left + a.right - b.left - b.right) ** 2 + (a.top + a.bottom - b.top - b.bottom) ** 2;

/** Rows by vertical overlap with the first sprite of the row, then left to right. */
const readingOrder = <T extends Box>(items: T[]): T[] => {
  const byCenterY = [...items].sort(
    (a, b) => a.top + a.bottom - (b.top + b.bottom) || a.left - b.left,
  );
  const rows: { top: number; bottom: number; items: T[] }[] = [];
  for (const item of byCenterY) {
    const centerY = (item.top + item.bottom) / 2;
    const row = rows.at(-1);
    if (row && centerY <= row.bottom) {
      row.items.push(item);
    } else {
      rows.push({ top: item.top, bottom: item.bottom, items: [item] });
    }
  }
  return rows.flatMap((row) =>
    row.items.sort((a, b) => a.left + a.right - (b.left + b.right) || a.top - b.top),
  );
};

/**
 * Split an RGBA sheet into sprites by alpha. `count` 0 finds every solid component;
 * a positive count keeps the largest ones as sprites and merges the rest into them.
 */
export const detectSprites = (
  buffer: PixelBuffer,
  count = 0,
  options: Partial<SpriteDetectOptions> = {},
): DetectedSprites => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Set the sprite count to 0 (auto) or a positive whole number.");
  }
  const { alphaHigh, alphaLow, haloRadius, minStrongPixels } = normalizeOptions(options);
  const { data, width, height } = buffer;
  const total = width * height;
  const alpha = new Uint8Array(total);
  let hasTransparency = false;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const value = data[pixel * 4 + 3]!;
    alpha[pixel] = value;
    if (value < alphaHigh) hasTransparency = true;
  }
  if (!hasTransparency) {
    throw new Error(
      "Dynamic split needs transparency. Enable Chroma Key to remove a flat background.",
    );
  }

  const queue = new Uint32Array(total);
  const owner = new Uint32Array(total);
  const distance = new Uint8Array(total);
  const forEachNeighbor = (pixel: number, visit: (neighbor: number) => void) => {
    const x = pixel % width;
    const y = (pixel - x) / width;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
        visit(ny * width + nx);
      }
    }
  };

  // 1. Strong components (8-connected, alpha >= alphaHigh). `owner` holds component ids here.
  const strongBoxes: (Box & { id: number; area: number })[] = [];
  for (let start = 0; start < total; start += 1) {
    if (owner[start] || alpha[start]! < alphaHigh) continue;
    const id = strongBoxes.length + 1;
    const box = { id, area: 0, left: width, top: height, right: -1, bottom: -1 };
    let head = 0;
    let tail = 1;
    queue[0] = start;
    owner[start] = id;
    while (head < tail) {
      const pixel = queue[head++]!;
      const x = pixel % width;
      const y = (pixel - x) / width;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
      forEachNeighbor(pixel, (neighbor) => {
        if (!owner[neighbor] && alpha[neighbor]! >= alphaHigh) {
          owner[neighbor] = id;
          queue[tail++] = neighbor;
        }
      });
    }
    box.area = tail;
    strongBoxes.push(box);
  }

  // 2. Seeds: components with enough strong pixels, largest first when a count is set.
  const eligible = strongBoxes
    .filter((box) => box.area >= minStrongPixels)
    .sort((a, b) => b.area - a.area || a.id - b.id);
  if (!eligible.length) {
    throw new Error("No sprites found. Check the transparency or lower the solid alpha.");
  }
  if (count > eligible.length) {
    throw new Error(
      `Found ${eligible.length} separate shapes for ${count} sprites. Lower the sprite count, or separate touching sprites.`,
    );
  }
  const seeds = readingOrder(count ? eligible.slice(0, count) : eligible);
  const spriteOfComponent = new Uint32Array(strongBoxes.length + 1);
  seeds.forEach((seed, index) => {
    spriteOfComponent[seed.id] = index + 1;
  });

  // 3. Grow every seed through weak alpha, at most haloRadius steps (multi-source BFS).
  let tail = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const sprite = spriteOfComponent[owner[pixel]!]!;
    if (sprite) queue[tail++] = pixel;
    owner[pixel] = sprite;
  }
  const conflicted = new Set<number>();
  for (let head = 0; head < tail; head += 1) {
    const pixel = queue[head]!;
    const step = distance[pixel]!;
    if (step >= haloRadius) continue;
    const sprite = owner[pixel]!;
    forEachNeighbor(pixel, (neighbor) => {
      if (alpha[neighbor]! < alphaLow) return;
      const current = owner[neighbor]!;
      if (!current) {
        owner[neighbor] = sprite;
        distance[neighbor] = step + 1;
        queue[tail++] = neighbor;
      } else if (current !== sprite && distance[neighbor] === step + 1) {
        // Competing fronts reach the pixel on the same step: the lower sprite number wins.
        conflicted.add(sprite).add(current);
        if (sprite < current) owner[neighbor] = sprite;
      }
    });
  }

  // 4. Pending visible pixels (small strong components, weak pixels past the halo) merge by group.
  const base: Box[] = seeds.map(() => ({ left: width, top: height, right: -1, bottom: -1 }));
  for (let pixel = 0; pixel < total; pixel += 1) {
    const sprite = owner[pixel]!;
    if (!sprite) continue;
    const box = base[sprite - 1]!;
    const x = pixel % width;
    const y = (pixel - x) / width;
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }
  const cells = base.map((box) => ({ ...box }));
  const merged = new Set<number>();
  const strays: StrayFragment[] = [];
  const maxMergeGap = (2 * haloRadius) ** 2;
  for (let start = 0; start < total; start += 1) {
    if (owner[start] || !alpha[start] || distance[start] === PENDING_VISITED) continue;
    const group: Box = { left: width, top: height, right: -1, bottom: -1 };
    let head = 0;
    let groupTail = 1;
    queue[0] = start;
    distance[start] = PENDING_VISITED;
    while (head < groupTail) {
      const pixel = queue[head++]!;
      const x = pixel % width;
      const y = (pixel - x) / width;
      group.left = Math.min(group.left, x);
      group.right = Math.max(group.right, x);
      group.top = Math.min(group.top, y);
      group.bottom = Math.max(group.bottom, y);
      forEachNeighbor(pixel, (neighbor) => {
        if (!owner[neighbor] && alpha[neighbor] && distance[neighbor] !== PENDING_VISITED) {
          distance[neighbor] = PENDING_VISITED;
          queue[groupTail++] = neighbor;
        }
      });
    }
    let nearest = 0;
    let bestGap = Infinity;
    let bestCenter = Infinity;
    base.forEach((box, index) => {
      const gap = gapSquared(group, box);
      const center = centerDistanceSquared(group, box);
      if (gap < bestGap || (gap === bestGap && center < bestCenter)) {
        nearest = index;
        bestGap = gap;
        bestCenter = center;
      }
    });
    if (bestGap > maxMergeGap) {
      const label = seeds.length + 1 + strays.length;
      for (let index = 0; index < groupTail; index += 1) owner[queue[index]!] = label;
      strays.push({
        cell: {
          x: group.left,
          y: group.top,
          w: group.right - group.left + 1,
          h: group.bottom - group.top + 1,
        },
        pixelCount: groupTail,
        flags: ["stray_fragment"],
      });
      continue;
    }
    for (let index = 0; index < groupTail; index += 1) owner[queue[index]!] = nearest + 1;
    const cell = cells[nearest]!;
    cell.left = Math.min(cell.left, group.left);
    cell.top = Math.min(cell.top, group.top);
    cell.right = Math.max(cell.right, group.right);
    cell.bottom = Math.max(cell.bottom, group.bottom);
    merged.add(nearest + 1);
  }

  return {
    cells: cells.map((box) => ({
      x: box.left,
      y: box.top,
      w: box.right - box.left + 1,
      h: box.bottom - box.top + 1,
    })),
    labels: owner,
    strays,
    flags: seeds.map((_, index) => {
      const flags: SpriteFlag[] = [];
      if (conflicted.has(index + 1)) flags.push("neighbor_alpha_conflict");
      if (merged.has(index + 1)) flags.push("fragments_merged");
      return flags;
    }),
  };
};
