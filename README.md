# sprite-detect

Pure sprite-sheet detection shared by `grid-splitter` and `sprite-boy`. It has no DOM dependency. The input is any `{ data, width, height }` RGBA buffer, so `ImageData` works in a worker, and a plain object works in Node.

## API

| Export | Purpose |
| --- | --- |
| `detectSprites(buffer, count = 0, options?)` | Splits a sheet into sprites by alpha. Returns `cells`, per-pixel `labels`, per-sprite `flags`, and `strays`. |
| `DEFAULT_SPRITE_DETECT` | `{ alphaHigh: 64, alphaLow: 2, haloRadius: 6, minStrongPixels: 12 }` |
| `detectGridFromBuffer(buffer, scale = 1)` | Finds row and column bands from RGB energy. Returns `null` when there is no grid. |
| `buildDetectedCells(bands)` | Turns detected bands into row-major cells. |
| `computeWorkSize(width, height, maxSide = 600)` | Work size and scale for grid detection. The image is never upscaled. |
| `getEnergyProfile`, `findSegments` | The energy steps behind grid detection. |
| `buildManualGrid(width, height, rows, cols)` | Equal cells. The last row and column take the remainder. |

Types: `PixelBuffer`, `GridCell` (`{ x, y, w, h }`), `SpriteDetectOptions`, `DetectedSprites`, `StrayFragment`, `SpriteFlag`, `DetectedGridBands`, `WorkSize`.

## Sprite rules

These rules come from the `spritesheet-expert` skill (deterministic item atlas):

- Strong pixels (alpha at or above `alphaHigh`) form 8-connected seeds.
- Weak pixels (alpha at or above `alphaLow`) join a seed within `haloRadius` steps. When two fronts meet on the same step, the lower sprite number wins, and both sprites get `neighbor_alpha_conflict`.
- A strong component under `minStrongPixels` stays pending. A pending group within `2 × haloRadius` of a sprite merges into it (`fragments_merged`). A farther group becomes a stray with the `stray_fragment` flag. It is not part of `cells`.
- No visible pixel is dropped. Every pixel with alpha above 0 has one label. Sprites use `1..cells.length`, and strays continue after that.
- `count > 0` keeps the largest `count` seeds and merges the rest. Errors are thrown for an opaque sheet, an empty sheet, or more sprites requested than found.

## Use

Consumers link a sibling checkout:

```json
"dependencies": { "sprite-detect": "link:../sprite-detect" }
```

The package ships TypeScript source (`exports` points to `src/index.ts`). Vite, Vitest, Bun, and Node 24 or newer load it directly.

```sh
pnpm install
pnpm test
pnpm typecheck
```
