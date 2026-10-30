export type { GridCell, PixelBuffer, SpriteDetectOptions } from "./types.ts";
export {
  buildDetectedCells,
  computeWorkSize,
  detectGridFromBuffer,
  findSegments,
  getEnergyProfile,
  type DetectedGridBands,
  type WorkSize,
} from "./detectGrid.ts";
export { buildManualGrid } from "./grid.ts";
export {
  DEFAULT_SPRITE_DETECT,
  detectSprites,
  type DetectedSprites,
  type SpriteFlag,
  type StrayFragment,
} from "./detectSprites.ts";
