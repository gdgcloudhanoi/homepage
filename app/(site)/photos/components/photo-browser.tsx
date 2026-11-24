"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FaceResults } from "@/lib/faces/search";
import type { PhotoPage, PhotoSlice, PublicPhoto } from "@/lib/photos/gallery";
import { loadMyPhotos } from "../actions";
import { FaceSearch } from "./face-search";
import { Mosaic } from "./mosaic";
import { Viewer } from "./viewer";

const PHOTO_PATH =
  /^\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const number = new Intl.NumberFormat("vi-VN");
// Thumbs fetched right away: about the first screen.
const EAGER = 8;

type Open = { id: string; fromResults: boolean };
type Results = Omit<FaceResults, keyof PhotoSlice> & { pages: PhotoSlice[]; query: Float32Array };

// Tile index of every photo, group members included.
function tileIndex(tiles: PublicPhoto[]) {
  const index = new Map<string, number>();
  tiles.forEach((tile, i) => {
    index.set(tile.id, i);
    for (const member of tile.group ?? []) index.set(member.id, i);
  });
  return index;
}

const holds = (tile: PublicPhoto, id: string) =>
  tile.id === id || !!tile.group?.some((member) => member.id === id);

export function PhotoBrowser({
  intro,
  initial,
  total,
  photo,
}: {
  intro: ReactNode;
  initial: PhotoPage;
  total: number;
  // Opened by the URL (/photos/<id>); may not be among the loaded photos.
  photo: PublicPhoto | null;
}) {
  const [feed, setFeed] = useState(() => ({ pages: [initial as PhotoSlice], next: initial.next }));
  const [failed, setFailed] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  // Clearing results remounts the search.
  const [searchKey, setSearchKey] = useState(0);
  const [open, setOpen] = useState<Open | null>(photo && { id: photo.id, fromResults: false });
  // Whether the viewer's history entry is ours, so closing can go back instead of adding one.
  const pushed = useRef(false);
  const loading = useRef(false);
  const lastViewed = useRef<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  // A reload starts at the top: the feed is back to its first page, and after pull-to-refresh
  // mobile browsers restore a stale offset (a bit below the top).
  useEffect(() => {
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navigation?.type !== "reload") return;
    history.scrollRestoration = "manual";
    scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const all = useMemo(() => feed.pages.flatMap((page) => page.photos), [feed.pages]);
  const found = useMemo(() => results?.pages.flatMap((page) => page.photos) ?? [], [results]);
  const allIndex = useMemo(() => tileIndex(all), [all]);
  const foundIndex = useMemo(() => tileIndex(found), [found]);
  const next = feed.next;

  const showResults = useCallback((first: FaceResults | null, query?: Float32Array) => {
    setFailed(false);
    setResults(
      first && query
        ? {
            search: first.search,
            total: first.total,
            complete: first.complete,
            next: first.next,
            pages: [first],
            query,
          }
        : null,
    );
  }, []);

  const loadMore = useCallback(async () => {
    if (!next || loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      const response = await fetch(`/photos/feed?after=${next}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const page = (await response.json()) as PhotoPage;
      setFeed((current) =>
        current.next === next ? { pages: [...current.pages, page], next: page.next } : current,
      );
    } catch (error) {
      console.error("[photos] loading more failed:", error);
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [next]);

  const search = results?.search;
  const query = results?.query;
  const resultsNext = results?.next ?? null;
  const loadMoreResults = useCallback(async () => {
    if (!search || !query || resultsNext === null || loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      const response = await loadMyPhotos(search, resultsNext, query);
      if ("error" in response) throw new Error(response.error);
      const page = response.result;
      setResults((current) =>
        current?.search === search && current.next === resultsNext
          ? {
              ...current,
              pages: [...current.pages, page],
              next: page.next,
              total: page.total,
              complete: page.complete,
            }
          : current,
      );
    } catch (error) {
      console.error("[photos] loading more results failed:", error);
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [search, query, resultsNext]);

  const hasMore = results ? resultsNext !== null : !!next;
  const more = results ? loadMoreResults : loadMore;
  // A results page can come back empty with the same `next` while the search goes on, so the
  // observer is renewed per page to check the sentinel again.
  const loadedPages = results ? results.pages.length : feed.pages.length;

  // Starts well before the end, so scrolling rarely meets empty space.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void more();
      },
      { rootMargin: "0px 0px 1600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, failed, more, loadedPages]);

  // The URL follows the viewer (/photos/<id>), so a photo can be shared and Back closes it.
  const show = useCallback((photo: PublicPhoto, fromResults: boolean) => {
    setOpen({ id: photo.id, fromResults });
    history.pushState(null, "", `/photos/${photo.id}`);
    pushed.current = true;
  }, []);
  const showFromFeed = useCallback((photo: PublicPhoto) => show(photo, false), [show]);
  const showFromResults = useCallback((photo: PublicPhoto) => show(photo, true), [show]);

  const navigate = useCallback((photo: PublicPhoto) => {
    setOpen((current) => current && { ...current, id: photo.id });
    history.replaceState(null, "", `/photos/${photo.id}`);
  }, []);

  // Back on the grid, focus the tile last viewed and bring it into view.
  const returnToTile = useCallback(() => {
    const id = lastViewed.current;
    lastViewed.current = null;
    const tile = id && document.querySelector<HTMLElement>(`a[data-photo="${id}"]`);
    if (!tile) return;
    tile.scrollIntoView({ block: "nearest" });
    tile.focus({ preventScroll: true });
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    if (pushed.current) {
      pushed.current = false;
      // popstate returns to the tile once the browser has restored the entry's scroll.
      history.back();
    } else {
      history.replaceState(null, "", "/photos");
      requestAnimationFrame(returnToTile);
    }
  }, [returnToTile]);

  useEffect(() => {
    const onPopState = () => {
      pushed.current = false;
      const id = PHOTO_PATH.exec(location.pathname)?.[1];
      setOpen((current) => (id ? { id, fromResults: current?.fromResults ?? false } : null));
      // The browser restores the scroll saved by pushState after this handler; go after it.
      if (!id) requestAnimationFrame(returnToTile);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [returnToTile]);

  useEffect(() => {
    if (search) resultsHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [search]);

  // Paging moves between tiles; a group's photos are picked in the viewer.
  const viewing = useMemo(() => {
    if (!open) return null;
    if (open.fromResults && results) {
      const index = foundIndex.get(open.id);
      if (index !== undefined) {
        const total = results.next === null ? found.length : results.total;
        return { list: found, index, total, more: loadMoreResults };
      }
    }
    const index = allIndex.get(open.id);
    if (index !== undefined) {
      return { list: all, index, total: next ? Math.max(total, all.length) : all.length, more: loadMore };
    }
    if (photo && holds(photo, open.id)) return { list: [photo], index: 0, total: null, more: null };
    return null;
  }, [open, results, found, foundIndex, all, allIndex, next, total, photo, loadMore, loadMoreResults]);

  const tile = viewing && viewing.list[viewing.index];
  const group = useMemo(() => (tile?.group ? [tile, ...tile.group] : null), [tile]);
  const shown = (open && group?.find((member) => member.id === open.id)) ?? tile;

  // Swipes and arrows go through a group's photos, then on to the next tile (backwards: its last).
  const step = (direction: 1 | -1) => {
    if (!viewing || !shown) return null;
    const at = group ? group.indexOf(shown) : -1;
    if (group?.[at + direction]) return group[at + direction];
    const neighbour = viewing.list[viewing.index + direction];
    if (!neighbour) return null;
    return direction < 0 ? (neighbour.group?.at(-1) ?? neighbour) : neighbour;
  };

  useEffect(() => {
    if (tile) lastViewed.current = tile.id;
  }, [tile]);

  // Paging the viewer to the end of the loaded photos loads the next page.
  const nearEnd = !!viewing?.more && viewing.index >= viewing.list.length - 4;
  const loadNear = viewing?.more;
  useEffect(() => {
    if (nearEnd) void loadNear?.();
  }, [nearEnd, loadNear]);

  return (
    <>
      <Section className="grid gap-x-12 gap-y-8 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:py-10 lg:py-14">
        <div>{intro}</div>
        <FaceSearch key={searchKey} onResults={showResults} />
      </Section>

      {results ? (
        <section aria-labelledby="results-heading" className="border-t border-hairline">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4 lg:px-20">
            <h2 id="results-heading" ref={resultsHeading} className="scroll-mt-24 font-bold">
              Ảnh có bạn{" "}
              <span className="font-normal text-mute">
                [{number.format(results.total)}
                {results.complete ? "" : "+"}]
              </span>
            </h2>
            <Button
              variant="outline"
              onClick={() => {
                showResults(null);
                setSearchKey((key) => key + 1);
              }}
            >
              Xem tất cả ảnh
            </Button>
          </div>
          <Mosaic slices={results.pages} onOpen={showFromResults} />
          {hasMore && (
            <div ref={sentinel} className="flex justify-center py-8">
              {failed ? (
                <Button variant="outline" onClick={() => void more()}>
                  Tải thêm ảnh
                </Button>
              ) : (
                <Spinner aria-label="Đang tải thêm ảnh" className="size-5 text-mute" />
              )}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Tất cả ảnh" className="border-t border-hairline">
          {all.length ? (
            <Mosaic slices={feed.pages} eager={EAGER} onOpen={showFromFeed} />
          ) : (
            <p className="px-6 py-12 text-mute lg:px-20">Chưa có ảnh.</p>
          )}
          {next && (
            <div ref={sentinel} className="flex justify-center py-8">
              {failed ? (
                <Button variant="outline" onClick={() => void loadMore()}>
                  Tải thêm ảnh
                </Button>
              ) : (
                <Spinner aria-label="Đang tải thêm ảnh" className="size-5 text-mute" />
              )}
            </div>
          )}
        </section>
      )}

      {viewing && shown && (
        <Viewer
          photo={shown}
          group={group}
          position={
            viewing.total
              ? `${number.format(viewing.index + 1)} / ${number.format(viewing.total)}`
              : null
          }
          prev={step(-1)}
          next={step(1)}
          onNavigate={navigate}
          onClose={close}
        />
      )}
    </>
  );
}
