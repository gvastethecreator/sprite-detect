/** Row-major RGBA bytes. `ImageData` fits, so does any `{ data, width, height }` in Node. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Source-space rectangle in whole pixels. */
export interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteDetectOptions {
  /** Alpha at or above this value seeds a sprite (strong pixel). */
  alphaHigh: number;
  /** Alpha at or above this value may join a sprite through the halo (weak pixel). */
  alphaLow: number;
  /** Maximum distance in pixels a sprite grows through weak pixels. */
  haloRadius: number;
  /** Strong components smaller than this stay pending and merge into the nearest sprite. */
  minStrongPixels: number;
}
