"use client";

import { memo, useSyncExternalStore, type CSSProperties } from "react";
import { Layers2Icon } from "lucide-react";
import type { PhotoSlice, PublicPhoto } from "@/lib/photos/gallery";
import type { Density, MosaicGrid } from "@/lib/photos/mosaic";
import { cn } from "@/lib/utils";

type Open = (photo: PublicPhoto) => void;

// Tailwind's `sm`: the regular layout from here up.
const REGULAR = "(min-width: 40rem)";

function subscribe(onChange: () => void) {
  const query = matchMedia(REGULAR);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// null on the server and during hydration: both layouts are then in the HTML and CSS shows the
// right one, so the first paint never waits for JavaScript. Afterwards only one stays mounted.
function useDensity() {
  return useSyncExternalStore<Density | null>(
    subscribe,
    () => (matchMedia(REGULAR).matches ? "regular" : "compact"),
    () => null,
  );
}

export const photoLabel = (photo: PublicPhoto) =>
  photo.capturedAt ? `Ảnh chụp lúc ${photo.capturedAt}` : "Ảnh sự kiện";

function Tile({
  photo,
  eager,
  onOpen,
  style,
}: {
  photo: PublicPhoto;
  eager: boolean;
  onOpen: Open;
  style: CSSProperties;
}) {
  const size = photo.group ? photo.group.length + 1 : 0;
  return (
    <a
      href={`/photos/${photo.id}`}
      data-photo={photo.id}
      style={style}
      onClick={(event) => {
        // New tab / window keeps the link's default.
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpen(photo);
      }}
      className="relative block min-h-0 min-w-0 scroll-mt-24 overflow-hidden bg-surface-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {/* Already-resized WebP from Storage: next/image would only re-encode it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumb}
        alt={size ? `${photoLabel(photo)} · nhóm ${size} ảnh` : photoLabel(photo)}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-cover transition-opacity duration-150 hover:opacity-90"
      />
      {size > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 right-1 flex items-center gap-0.5 rounded-sm bg-ink-deep/60 px-1 text-[11px] leading-4 font-medium text-on-dark tabular-nums sm:top-1.5 sm:right-1.5 sm:gap-1 sm:px-1.5 sm:py-0.5 sm:text-xs"
        >
          <Layers2Icon className="size-3" />
          {size}
        </span>
      )}
    </a>
  );
}

const Grid = memo(function Grid({
  slice,
  grid,
  eager,
  onOpen,
}: {
  slice: PhotoSlice;
  grid: MosaicGrid;
  eager: number;
  onOpen: Open;
}) {
  return (
    <div
      className="grid gap-(--gap)"
      style={{
        gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
        // Square cells, in container units like the columns.
        gridAutoRows: `calc((100cqw - ${grid.columns - 1} * var(--gap)) / ${grid.columns})`,
      }}
    >
      {grid.tiles.map((tile) => (
        <Tile
          key={tile.index}
          photo={slice.photos[tile.index]}
          eager={tile.index < eager}
          onOpen={onOpen}
          style={{
            gridColumn: `${tile.x + 1} / span ${tile.w}`,
            gridRow: `${tile.y + 1} / span ${tile.h}`,
          }}
        />
      ))}
    </div>
  );
});

const Layout = memo(function Layout({
  slices,
  density,
  eager,
  onOpen,
  className,
}: {
  slices: PhotoSlice[];
  density: Density;
  eager: number;
  onOpen: Open;
  className: string;
}) {
  return (
    <div className={cn("flex flex-col gap-(--gap)", className)}>
      {slices.map(
        (slice, s) =>
          // Search pages can be empty while the search goes on; an empty grid would add a gap.
          slice.photos.length > 0 && (
            <Grid
              key={s}
              slice={slice}
              grid={slice.mosaic[density]}
              eager={s ? 0 : eager}
              onOpen={onOpen}
            />
          ),
      )}
    </div>
  );
});

// `eager`: how many photos of the first slice load right away (the first screen).
export function Mosaic({
  slices,
  eager = 0,
  onOpen,
}: {
  slices: PhotoSlice[];
  eager?: number;
  onOpen: Open;
}) {
  const density = useDensity();
  return (
    <div className="@container [--gap:2px] sm:[--gap:4px]">
      {density !== "regular" && (
        <Layout slices={slices} density="compact" eager={eager} onOpen={onOpen} className="sm:hidden" />
      )}
      {density !== "compact" && (
        <Layout slices={slices} density="regular" eager={eager} onOpen={onOpen} className="max-sm:hidden" />
      )}
    </div>
  );
}
