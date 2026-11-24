// Square grid. Every tile is a centre-cropped square; in bands of two rows, the photos with the
// most faces become 2×2 tiles, the rest fill the band in feed order. A page that more photos
// follow always ends on a full row, so pages stack without holes. Pure and deterministic: the
// server lays out each page once for both densities. A first page with pinned photos opens with a
// fixed hero block: photo 1 as a 3×2 tile, photo 2 as 2×2, then 6 small ones.

export type Density = "compact" | "regular";

// Every density's column count divides it: this many 1×1 tiles end on a full row in both.
export const FULL_ROW = 8;

type Spec = {
  columns: number;
  // slots[f - 1]: columns of a band's f large tiles, cycled band by band.
  slots: number[][][];
  // About one large tile per this many photos.
  every: number;
  // [x, y, w, h] of the first photos, in feed order; fills `rows` whole rows.
  hero: { rows: number; tiles: [number, number, MosaicTile["w"], MosaicTile["h"]][] };
};

const specs: Record<Density, Spec> = {
  // Phones, below Tailwind's `sm`.
  compact: {
    columns: 4,
    slots: [[[2], [0]]],
    every: 6,
    hero: {
      rows: 4,
      tiles: [
        [0, 0, 3, 2], [2, 2, 2, 2], [3, 0, 1, 1], [3, 1, 1, 1],
        [0, 2, 1, 1], [1, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1],
      ],
    },
  },
  regular: {
    columns: 8,
    slots: [
      [[3], [0], [6], [2]],
      [[2, 6], [0, 4], [1, 5], [0, 6]],
    ],
    every: 6,
    hero: {
      rows: 2,
      tiles: [
        [0, 0, 3, 2], [3, 0, 2, 2], [5, 0, 1, 1], [6, 0, 1, 1],
        [7, 0, 1, 1], [5, 1, 1, 1], [6, 1, 1, 1], [7, 1, 1, 1],
      ],
    },
  },
};

export type MosaicPhoto = {
  // Higher weight = better large tile (e.g. faces in the photo).
  weight: number;
  // Stable value in [0, 1) that breaks ties, e.g. seedOf(id).
  seed: number;
};

// Grid cell of photos[index]: column x, row y, `w` cells wide, `h` tall.
export type MosaicTile = { index: number; x: number; y: number; w: 1 | 2 | 3; h: 1 | 2 };
// Tiles in reading order.
export type MosaicGrid = { columns: number; tiles: MosaicTile[] };
export type Mosaic = Record<Density, MosaicGrid>;

// FNV-1a, mapped to [0, 1).
export function seedOf(id: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return (hash >>> 0) / 2 ** 32;
}

// Large tiles closest to n / every that fit in the bands and, unless final, fill whole rows.
function largeCount(n: number, { columns, slots, every }: Spec, final: boolean) {
  let best = 0;
  let found = false;
  for (let large = 0; large <= n; large++) {
    const cells = n + 3 * large;
    if (!final && cells % columns) continue;
    if (large > slots.length * Math.floor(cells / (2 * columns))) continue;
    if (!found || Math.abs(large - n / every) < Math.abs(best - n / every)) best = large;
    found = true;
  }
  return best;
}

function layout(photos: MosaicPhoto[], spec: Spec, final: boolean, hero: boolean): MosaicGrid {
  const { columns } = spec;
  const tiles: MosaicTile[] = [];
  let next = 0;
  let top = 0;
  if (hero && photos.length >= spec.hero.tiles.length) {
    spec.hero.tiles.forEach(([x, y, w, h], index) => tiles.push({ index, x, y, w, h }));
    next = tiles.length;
    top = spec.hero.rows;
  }
  const n = photos.length - next;
  const large = largeCount(n, spec, final);
  const bands = large ? Math.floor((n + 3 * large) / (2 * columns)) : 0;
  const score = (i: number) => photos[i].weight + photos[i].seed;
  const used = spec.slots.map(() => 0);

  for (let band = 0; band < bands; band++) {
    // Large tiles spread evenly over the bands.
    const count = Math.ceil(((band + 1) * large) / bands) - Math.ceil((band * large) / bands);
    const group = Array.from({ length: 2 * columns - 3 * count }, (_, i) => next + i);
    next += group.length;
    const picks = new Set([...group].sort((a, b) => score(b) - score(a)).slice(0, count));
    const slots = count ? spec.slots[count - 1][used[count - 1]++ % spec.slots[count - 1].length] : [];
    const taken = new Set<number>();
    [...picks]
      .sort((a, b) => a - b)
      .forEach((index, i) => {
        const x = slots[i];
        tiles.push({ index, x, y: top + 2 * band, w: 2, h: 2 });
        for (const cell of [x, x + 1, columns + x, columns + x + 1]) taken.add(cell);
      });
    let cell = 0;
    for (const index of group) {
      if (picks.has(index)) continue;
      while (taken.has(cell)) cell++;
      tiles.push({ index, x: cell % columns, y: top + 2 * band + Math.floor(cell / columns), w: 1, h: 1 });
      cell++;
    }
  }
  for (let index = next; index < photos.length; index++) {
    const cell = index - next;
    tiles.push({ index, x: cell % columns, y: top + 2 * bands + Math.floor(cell / columns), w: 1, h: 1 });
  }
  return { columns, tiles: tiles.sort((a, b) => a.y - b.y || a.x - b.x) };
}

// `final`: no more photos follow, so the last row may be left short. `hero`: open with the hero block.
export function mosaic(photos: MosaicPhoto[], final: boolean, hero = false): Mosaic {
  return {
    compact: layout(photos, specs.compact, final, hero),
    regular: layout(photos, specs.regular, final, hero),
  };
}
