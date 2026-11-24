"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { track } from "@/lib/firebase/analytics";
import type { PublicPhoto } from "@/lib/photos/gallery";
import { cn } from "@/lib/utils";
import { photoLabel } from "./mosaic";
// TODO: re-enable photo sharing.
// import { ShareButton } from "./share-button";

const darkButton =
  "text-on-dark hover:bg-surface-dark-elevated hover:text-on-dark focus-visible:ring-offset-ink-deep aria-expanded:bg-surface-dark-elevated aria-expanded:text-on-dark";
const arrowButton = cn(
  darkButton,
  "pointer-events-auto size-10 bg-surface-dark/60 active:not-aria-[haspopup]:translate-y-0 max-sm:size-9",
);

// Horizontal travel that turns a drag into prev / next.
const SWIPE = 60;
// Space between neighbouring photos while swiping.
const GAP = 16;
const MAX_ZOOM = 4;
// Zoom of a click / double tap, the zoom button and the first + key.
const STEP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;

type Point = { x: number; y: number };
// Translate (px from the stage centre) and scale over the contained photo.
type View = Point & { id: string; scale: number };
type Gesture =
  | { kind: "swipe"; start: Point }
  | { kind: "pan"; start: Point; from: View }
  | { kind: "pinch"; distance: number; center: Point; from: View };

const rest = (id: string): View => ({ id, scale: 1, x: 0, y: 0 });
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Clamps the zoom, and the pan so the photo never leaves a gap it could cover.
function fit(photo: PublicPhoto, box: DOMRect, scale: number, x: number, y: number): View {
  scale = clamp(scale, 1, MAX_ZOOM);
  const contain = Math.min(box.width / photo.width, box.height / photo.height);
  const maxX = Math.max(0, (photo.width * contain * scale - box.width) / 2);
  const maxY = Math.max(0, (photo.height * contain * scale - box.height) / 2);
  return { id: photo.id, scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

// Zooms keeping the stage point `at` over the same spot of the photo.
function zoomAt(photo: PublicPhoto, box: DOMRect, from: View, scale: number, at: Point): View {
  const ratio = clamp(scale, 1, MAX_ZOOM) / from.scale;
  return fit(
    photo,
    box,
    from.scale * ratio,
    at.x - (at.x - from.x) * ratio,
    at.y - (at.y - from.y) * ratio,
  );
}

function toStage(point: Point, box: DOMRect): Point {
  return { x: point.x - box.left - box.width / 2, y: point.y - box.top - box.height / 2 };
}

// Saves the main copy as JPEG, re-encoded here since Storage only holds WebP.
async function saveAsJpeg(photo: PublicPhoto) {
  const source = await (await fetch(photo.main)).blob();
  let jpeg = source;
  if (source.type !== "image/jpeg") {
    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("JPEG encode failed"))), "image/jpeg", 0.92),
    );
  }
  const url = URL.createObjectURL(jpeg);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gdg-cloud-hanoi-${photo.id.slice(-12)}.jpg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// One photo of the swipe track; keyed by id so it keeps its loaded image when it becomes current.
function Slide({
  photo,
  slot,
  view,
  smooth,
}: {
  photo: PublicPhoto;
  slot: -1 | 0 | 1;
  view: View;
  smooth: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const current = slot === 0;
  return (
    <div
      aria-hidden={!current || undefined}
      className="absolute inset-0"
      style={slot ? { transform: `translateX(calc(${slot * 100}% + ${slot * GAP}px))` } : undefined}
    >
      <div
        className={cn("absolute inset-0", smooth && "transition-transform duration-200 ease-out")}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {/* The thumb is usually cached from the grid, so something shows at once. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumb}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={(image) => {
            // Loaded before hydration: onLoad never fires for it.
            if (image?.complete && image.naturalWidth) setLoaded(true);
          }}
          src={photo.main}
          alt={current ? photoLabel(photo) : ""}
          fetchPriority={current ? "high" : "auto"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full object-contain transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}

export function Viewer({
  photo,
  group,
  position,
  prev,
  next,
  onNavigate,
  onClose,
}: {
  photo: PublicPhoto;
  // The photos of the tile's group, `photo` among them; null when alone.
  group: PublicPhoto[] | null;
  position: string | null;
  prev: PublicPhoto | null;
  next: PublicPhoto | null;
  onNavigate: (photo: PublicPhoto) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const shareOpen = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const press = useRef<(Point & { time: number; moved: boolean }) | null>(null);
  const lastTap = useRef<(Point & { time: number }) | null>(null);
  const [offset, setOffset] = useState(0);
  // A released swipe gliding to a neighbour (or back when `to` is null).
  const [settle, setSettle] = useState<{ to: PublicPhoto | null } | null>(null);
  // A view for another photo is stale: navigating resets the zoom.
  const viewRef = useRef<View | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [smooth, setSmooth] = useState(false);
  const [saving, setSaving] = useState(false);
  const zoom = view?.id === photo.id ? view : rest(photo.id);
  const zoomed = zoom.scale > 1;

  const current = () => (viewRef.current?.id === photo.id ? viewRef.current : rest(photo.id));
  const apply = (next: View, animate = false) => {
    viewRef.current = next;
    setView(next);
    setSmooth(animate);
  };
  const box = () => stage.current?.getBoundingClientRect() ?? new DOMRect();
  const zoomStep = (scale: number) => {
    const from = current();
    apply(zoomAt(photo, box(), from, from.scale * scale, { x: 0, y: 0 }), true);
  };
  const toggleZoom = (at: Point) => {
    const from = current();
    apply(from.scale > 1 ? rest(photo.id) : zoomAt(photo, box(), from, STEP_ZOOM, at), true);
  };

  useEffect(() => dialog.current?.focus(), []);

  useEffect(() => {
    track("photo_view", { photo_id: photo.id });
  }, [photo.id]);

  // React's wheel listener is passive, so it can't stop the page from scrolling.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const from = viewRef.current?.id === photo.id ? viewRef.current : rest(photo.id);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      // Trackpad pinches arrive as ctrl + small deltas.
      const scale = from.scale * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002));
      const at = toStage({ x: event.clientX, y: event.clientY }, rect);
      const next = zoomAt(photo, rect, from, scale, at);
      viewRef.current = next;
      setView(next);
      setSmooth(false);
    };
    // Rotating the phone changes how far the photo may pan.
    const onResize = () => {
      const from = viewRef.current;
      if (from?.id !== photo.id) return;
      const next = fit(photo, element.getBoundingClientRect(), from.scale, from.x, from.y);
      viewRef.current = next;
      setView(next);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    return () => {
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [photo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // Escape first closes an open share menu. Others may have handled Escape already (Next's
      // dev overlay prevents it), so only the arrows respect defaultPrevented.
      if (event.key === "Escape") {
        if (shareOpen.current) return;
        onClose();
      } else if (event.defaultPrevented) return;
      else if (event.key === "ArrowLeft" && prev) onNavigate(prev);
      else if (event.key === "ArrowRight" && next) onNavigate(next);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next, onNavigate, onClose]);

  // Keeps the current photo of the strip in view; the strip itself scrolls, never the page.
  const scrolledGroup = useRef<PublicPhoto[] | null>(null);
  useEffect(() => {
    const list = strip.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !item) return;
    const box = list.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    list.scrollBy({
      left: rect.left - box.left - (box.width - rect.width) / 2,
      // A new strip jumps; within one, it glides.
      behavior: scrolledGroup.current === group ? "smooth" : "instant",
    });
    scrolledGroup.current = group;
  }, [photo.id, group]);

  // Keeps Tab inside the dialog; + - 0 zoom.
  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") zoomStep(current().scale > 1 ? 1.5 : STEP_ZOOM);
      else if (event.key === "-") zoomStep(1 / 1.5);
      else if (event.key === "0") apply(rest(photo.id), true);
      else return;
      event.preventDefault();
      return;
    }
    if (!dialog.current) return;
    const items = dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const pinch = (from: View): Gesture => {
    const [a, b] = [...pointers.current.values()];
    return {
      kind: "pinch",
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      center: toStage({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, box()),
      from,
    };
  };

  // Ends a glide: the slide that reached the centre becomes the current photo in the same render.
  const finishSettle = () => {
    if (!settle) return;
    setSettle(null);
    setOffset(0);
    if (settle.to) onNavigate(settle.to);
  };

  // One finger swipes between photos, or pans once zoomed; two fingers pinch; a double tap toggles.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Capturing a press on the arrows would retarget their click to the stage.
    if ((event.target as Element).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    finishSettle();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, { ...point });
    const from = current();
    if (pointers.current.size === 1) {
      press.current = { ...point, time: event.timeStamp, moved: false };
      if (from.scale > 1) gesture.current = { kind: "pan", start: point, from };
      else if (event.pointerType !== "mouse") gesture.current = { kind: "swipe", start: point };
      else gesture.current = null;
    } else {
      press.current = null;
      lastTap.current = null;
      setOffset(0);
      gesture.current = pinch(from);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = pointers.current.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (press.current && Math.hypot(point.x - press.current.x, point.y - press.current.y) > 10) {
      press.current.moved = true;
    }
    const active = gesture.current;
    if (active?.kind === "swipe") {
      const dx = point.x - active.start.x;
      // Past the first / last photo the drag resists.
      const edge = (dx < 0 && !next) || (dx > 0 && !prev);
      if (Math.abs(dx) > Math.abs(point.y - active.start.y)) setOffset(edge ? dx / 3 : dx);
    } else if (active?.kind === "pan") {
      const { from, start } = active;
      apply(fit(photo, box(), from.scale, from.x + point.x - start.x, from.y + point.y - start.y));
    } else if (active?.kind === "pinch") {
      const { from, center, distance } = active;
      const [a, b] = [...pointers.current.values()];
      const rect = box();
      const now = toStage({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rect);
      const scale = clamp((from.scale * Math.hypot(a.x - b.x, a.y - b.y)) / distance, 1, MAX_ZOOM);
      const ratio = scale / from.scale;
      apply(
        fit(
          photo,
          rect,
          scale,
          now.x - (center.x - from.x) * ratio,
          now.y - (center.y - from.y) * ratio,
        ),
      );
    }
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const ended = gesture.current;
    const from = current();
    if (pointers.current.size >= 2) {
      gesture.current = pinch(from);
      return;
    }
    if (pointers.current.size === 1) {
      const [start] = [...pointers.current.values()];
      gesture.current = from.scale > 1 ? { kind: "pan", start: { ...start }, from } : null;
      return;
    }
    gesture.current = null;
    if (ended?.kind === "swipe") {
      const up = event.type === "pointerup";
      const direction = up && offset <= -SWIPE && next ? 1 : up && offset >= SWIPE && prev ? -1 : 0;
      if (direction) {
        setSettle({ to: direction > 0 ? next : prev });
        setOffset(-direction * (box().width + GAP));
        return;
      }
      if (offset) {
        setSettle({ to: null });
        setOffset(0);
      }
    }

    const tap = press.current;
    press.current = null;
    if (event.type !== "pointerup" || !tap || tap.moved) return;
    const point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    // A mouse click toggles at once; a single touch tap is left free for the double tap.
    if (event.pointerType === "mouse") return toggleZoom(toStage(point, box()));
    const last = lastTap.current;
    if (
      last &&
      point.time - last.time < DOUBLE_TAP_MS &&
      Math.hypot(point.x - last.x, point.y - last.y) < 40
    ) {
      lastTap.current = null;
      toggleZoom(toStage(point, box()));
    } else lastTap.current = point;
  };

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={photoLabel(photo)}
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-ink-deep text-on-dark outline-none animate-in fade-in duration-200"
    >
      {/* Scroll lock that also applies before hydration; the gutter stops the page from shifting. */}
      <style>{"html{overflow:hidden;scrollbar-gutter:stable}"}</style>

      <div className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-4">
        <p className="min-w-0 flex-1 truncate px-2 text-caption text-on-dark-mute">
          {[position, photo.capturedAt].filter(Boolean).join(" · ")}
        </p>
        <Button
          variant="ghost"
          size="icon-lg"
          className={darkButton}
          onClick={() => toggleZoom({ x: 0, y: 0 })}
          aria-label={zoomed ? "Đặt lại thu phóng" : "Phóng to"}
          title={zoomed ? "Đặt lại thu phóng" : "Phóng to"}
        >
          {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className={darkButton}
          nativeButton={false}
          render={
            <a
              href={`/photos/download/${photo.id}`}
              download
              aria-disabled={saving || undefined}
              onClick={(event) => {
                event.preventDefault();
                if (saving) return;
                track("photo_download");
                setSaving(true);
                const fallback = event.currentTarget.href;
                saveAsJpeg(photo)
                  // The WebP copy as is, rather than nothing.
                  .catch(() => location.assign(fallback))
                  .finally(() => setSaving(false));
              }}
            />
          }
          aria-label="Tải xuống"
          title="Tải xuống"
        >
          {saving ? <Spinner /> : <DownloadIcon />}
        </Button>
        {/* TODO: re-enable photo sharing.
        <ShareButton
          photo={photo}
          className={darkButton}
          onOpenChange={(open) => (shareOpen.current = open)}
        />
        */}
        <Button
          variant="ghost"
          size="icon-lg"
          className={darkButton}
          onClick={onClose}
          aria-label="Đóng"
          title="Đóng"
        >
          <XIcon />
        </Button>
      </div>

      {/* Stage and strip share a box of fixed height, so the arrows stay put with or without a strip. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={stage}
          className={cn(
            "relative min-h-0 flex-1 touch-none overflow-hidden select-none",
            zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            className={cn("absolute inset-0", settle && "transition-transform duration-300 ease-out")}
            style={offset ? { transform: `translateX(${offset}px)` } : undefined}
            onTransitionEnd={(event) => {
              // Zoom and image fades inside bubble up here too.
              if (event.target === event.currentTarget) finishSettle();
            }}
          >
            {prev && <Slide key={prev.id} photo={prev} slot={-1} view={rest(prev.id)} smooth={false} />}
            <Slide key={photo.id} photo={photo} slot={0} view={zoom} smooth={smooth} />
            {next && <Slide key={next.id} photo={next} slot={1} view={rest(next.id)} smooth={false} />}
          </div>
        </div>

        {prev && (
          <div className="pointer-events-none absolute inset-y-0 left-2 z-10 flex items-center sm:left-4">
            <Button
              variant="ghost"
              size="icon-lg"
              className={arrowButton}
              onClick={() => onNavigate(prev)}
              aria-label="Ảnh trước"
              title="Ảnh trước"
            >
              <ChevronLeftIcon />
            </Button>
          </div>
        )}
        {next && (
          <div className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center sm:right-4">
            <Button
              variant="ghost"
              size="icon-lg"
              className={arrowButton}
              onClick={() => onNavigate(next)}
              aria-label="Ảnh sau"
              title="Ảnh sau"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        )}

        {group && (
          <div
            ref={strip}
            role="group"
            aria-label={`Nhóm ${group.length} ảnh`}
            className="shrink-0 overflow-x-auto overscroll-x-contain pb-[env(safe-area-inset-bottom)] [scrollbar-width:none]"
          >
            {/* w-max + mx-auto: centred while it fits, scrolls once it doesn't. */}
            <div className="mx-auto flex w-max gap-1.5 p-2 sm:gap-2 sm:p-3">
              {group.map((item, i) => {
                const current = item.id === photo.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={current}
                    aria-label={`Ảnh ${i + 1} / ${group.length}`}
                    onClick={() => onNavigate(item)}
                    className={cn(
                      "size-12 shrink-0 overflow-hidden rounded-md bg-surface-dark outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring sm:size-14",
                      current ? "ring-2 ring-on-dark" : "opacity-50 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
