"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowRightIcon, ScanFaceIcon, SwitchCameraIcon, XIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { SEARCH_DETECTOR } from "@/lib/faces/config";
import {
  createFaceWorker,
  type DetectedFace,
  type FaceRequest,
  type FaceResponse,
} from "@/lib/faces/face";
import { track } from "@/lib/firebase/analytics";
import type { FaceResults } from "@/lib/faces/search";
import { DETECT_SIZE } from "@/lib/photos/photo";
import { fit, resize } from "@/lib/photos/resize";
import { createPool, type Pool } from "@/lib/pool";
import { cn } from "@/lib/utils";
import { findMyPhotos } from "../actions";

// One worker for the page's lifetime. It's warmed when the page opens, so the pool keeps it for a few
// minutes without work; a later worker reloads the models from Cache Storage, without downloading.
let pool: Pool<FaceRequest, FaceResponse> | undefined;
const workers = () =>
  (pool ??= createPool<FaceRequest, FaceResponse>({
    create: createFaceWorker,
    size: 1,
    retire: (response) => !response.ok,
    idleMs: 5 * 60_000,
  }));

// Downloads the models (~15 MB, cached afterwards) once the page is idle, so a search starts at once.
let warming: Promise<void> | undefined;
function warmUp() {
  warming ??= createImageBitmap(new ImageData(1, 1))
    .then((image) =>
      workers().run({ detector: SEARCH_DETECTOR, image }, [image], new AbortController().signal),
    )
    .then(
      (response) => {
        if (!response.ok) warming = undefined;
      },
      () => {
        warming = undefined;
      },
    );
  return warming;
}

type Selfie = { url: string; width: number; height: number; faces: DetectedFace[]; selected: number };
type Facing = "user" | "environment";
type Status = { text: string; busy?: boolean; error?: boolean };

// Similarity above which a face counts as the one of the last search, whose stored result the server
// may then reuse while the album is unchanged. Kept in memory only.
const SAME_FACE = 0.8;
let lastSearched: Float32Array | undefined;
const recall = () => lastSearched;
const remember = (face: Float32Array) => {
  lastSearched = face;
};

const similarity = (a: Float32Array, b: Float32Array) => a.reduce((sum, value, i) => sum + value * b[i], 0);

const largest = (faces: DetectedFace[]) =>
  faces.reduce((best, face, i) => (face.box[2] * face.box[3] > faces[best].box[2] * faces[best].box[3] ? i : best), 0);

// Matches Tailwind's `lg`: from there the camera is a side panel instead of fullscreen.
const WIDE = "(min-width: 64rem)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useWide = () =>
  useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

const boxStyle = ([x, y, w, h]: number[]) => ({
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: `${w * 100}%`,
  height: `${h * 100}%`,
});

export function FaceSearch({
  onResults,
}: {
  // null: nothing to show for the current selfie (no face, no match, error). `query` continues the
  // search on later pages.
  onResults: (results: FaceResults | null, query?: Float32Array) => void;
}) {
  const [selfie, setSelfie] = useState<Selfie | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [canSwitch, setCanSwitch] = useState(false);
  const [flash, setFlash] = useState(false);
  const [closing, setClosing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const run = useRef<AbortController | null>(null);

  useEffect(() => () => run.current?.abort(), []);

  // Not on data saver or 2G: there the models wait for the button.
  useEffect(() => {
    const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
    if (connection?.saveData || connection?.effectiveType?.endsWith("2g")) return;
    const start = () => void warmUp();
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(start, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(start, 2000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!stream) return;
    if (video.current) video.current.srcObject = stream;
    return () => stream.getTracks().forEach((track) => track.stop());
  }, [stream]);

  // Fullscreen camera: no page scroll behind it. The side panel leaves the page usable. Escape closes
  // it, unless it belongs to a dialog opened over the panel (the photo viewer).
  const cameraOpen = !!stream;
  const wide = useWide();
  // The side panel slides out first; its animationend then stops the camera.
  const close = () => (wide ? setClosing(true) : setStream(null));
  useEffect(() => {
    if (!cameraOpen) return;
    const overflow = document.body.style.overflow;
    if (!wide) document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]:not([data-camera])'))
        if (wide) setClosing(true);
        else setStream(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [cameraOpen, wide]);

  async function startCamera(mode: Facing) {
    void warmUp();
    // Phones can't keep two cameras open, so release the current one first.
    stream?.getTracks().forEach((track) => track.stop());
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setFacing(mode);
      setFlash(false);
      setClosing(false);
      setStream(next);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitch(devices.filter((device) => device.kind === "videoinput").length > 1);
    } catch {
      setStream(null);
      setStatus({ text: "Không mở được camera. Hãy cho phép trình duyệt truy cập camera.", error: true });
    }
  }

  function shoot() {
    const source = video.current;
    if (!source?.videoWidth || flash) return;
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    setFlash(true);
    canvas.toBlob((blob) => {
      if (blob) void open(blob);
    }, "image/jpeg", 0.92);
  }

  // The preview stays a local object URL; it's revoked when replaced or on leaving.
  const url = selfie?.url;
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function begin() {
    run.current?.abort();
    run.current = new AbortController();
    return run.current.signal;
  }

  // Shown results always belong to the selected face, so a search without photos clears them.
  function end(signal: AbortSignal, text: string, error = true) {
    if (signal.aborted) return;
    setStatus({ text, error });
    onResults(null);
  }

  async function find(face: DetectedFace, signal: AbortSignal) {
    setStatus({ text: "Đang tìm ảnh…", busy: true });
    try {
      const last = recall();
      const same = !!last && similarity(last, face.embedding) >= SAME_FACE;
      const response = await findMyPhotos(face.embedding, same);
      if (signal.aborted) return;
      if ("error" in response) return end(signal, response.error);
      // A stored result reused during the cooldown belongs to the last fresh search's face.
      const query = response.fresh ? face.embedding : (last ?? face.embedding);
      if (response.fresh) remember(face.embedding);
      const { total, complete } = response.result;
      track("face_search", { results: total });
      if (!total && complete) return end(signal, "Chưa tìm thấy ảnh nào có bạn.", false);
      setStatus({ text: `Tìm thấy ${total}${complete ? "" : "+"} ảnh.` });
      onResults(response.result, query);
    } catch {
      end(signal, "Không tìm được ảnh. Vui lòng thử lại sau.");
    }
  }

  async function open(file: Blob) {
    const signal = begin();
    let canvas: OffscreenCanvas;
    try {
      // Like uploads: EXIF orientation applied, at most 2048px, same downscaling.
      const source = await createImageBitmap(file);
      const size = fit(source, DETECT_SIZE);
      canvas = resize(source, size.width, size.height);
      source.close();
    } catch {
      return end(signal, "Trình duyệt không đọc được ảnh này.");
    }
    if (signal.aborted) return;
    const preview = { url: URL.createObjectURL(file), width: canvas.width, height: canvas.height };
    setSelfie({ ...preview, faces: [], selected: -1 });
    setStatus({ text: "Đang tải mô hình nhận diện…", busy: true });
    await warmUp();
    if (signal.aborted) return;
    setStatus({ text: "Đang nhận diện khuôn mặt…", busy: true });
    let faces: DetectedFace[];
    try {
      const image = await createImageBitmap(canvas);
      const response = await workers().run({ detector: SEARCH_DETECTOR, image }, [image], signal);
      if (!response.ok) throw new Error(response.message);
      faces = response.faces;
    } catch {
      return end(signal, "Không nhận diện được khuôn mặt. Vui lòng thử lại.");
    }
    if (!faces.length) return end(signal, "Không thấy khuôn mặt nào trong ảnh.");
    const selected = largest(faces);
    setSelfie({ ...preview, faces, selected });
    await find(faces[selected], signal);
  }

  function pick(index: number) {
    if (!selfie || index === selfie.selected) return;
    setSelfie({ ...selfie, selected: index });
    void find(selfie.faces[index], begin());
  }

  const busy = status?.busy ?? false;

  return (
    <div>
      <h2 className="mb-3 font-bold text-ink">Tìm ảnh có bạn</h2>
      <button
        type="button"
        disabled={busy || !!stream}
        aria-describedby="face-search-note"
        onClick={() => void startCamera("user")}
        className="group flex w-full items-center gap-4 rounded-sm bg-surface-dark p-4 text-left text-on-dark outline-none transition-colors hover:bg-surface-dark-elevated focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-sm border border-hairline-strong transition-colors group-hover:border-brand">
          <ScanFaceIcon className="size-8 text-on-dark" strokeWidth={1.5} />
          <span
            aria-hidden
            className="absolute inset-x-1.5 top-2 h-0.5 rounded-full bg-brand shadow-[0_0_8px_2px] shadow-brand/60 animate-scan motion-reduce:hidden"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Tìm bằng khuôn mặt</span>
          <span className="block text-caption text-on-dark-mute">Selfie một tấm, tìm lại khoảnh khắc của bạn</span>
        </span>
        <ArrowRightIcon className="size-5 shrink-0 text-on-dark-mute transition-transform group-hover:translate-x-1 group-hover:text-on-dark" />
      </button>
      <p id="face-search-note" className="mt-2 text-caption text-mute">
        Khi bấm nút, bạn đồng ý để trình duyệt phân tích khuôn mặt trong ảnh selfie. Ảnh chỉ nằm trên máy bạn;
        chỉ đặc trưng khuôn mặt được gửi đi để tìm ảnh và không được lưu lại.
      </p>

      {stream &&
        createPortal(
          <div
            role="dialog"
            aria-modal={!wide}
            aria-label="Chụp ảnh selfie"
            data-camera
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget || !closing) return;
              setClosing(false);
              setStream(null);
            }}
            className={cn(
              "fixed inset-0 z-50 overflow-hidden bg-ink-deep text-canvas duration-300 lg:left-auto lg:z-40 lg:flex lg:w-120 lg:flex-col lg:shadow-2xl",
              closing
                ? "animate-out fade-out slide-out-to-right fill-mode-forwards"
                : "animate-in fade-in zoom-in-95 lg:zoom-in-100 lg:slide-in-from-right",
            )}
          >
            {/* Side panel: the page makes room for it, in step with its slide. */}
            <style>{`@media ${WIDE}{body{transition:padding-right .3s ease-out}${closing ? "" : "body{padding-right:30rem}"}}`}</style>
            <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 lg:static lg:flex lg:items-center lg:justify-between lg:p-4">
              {/* <h2 className="hidden font-medium lg:block">Chụp ảnh selfie</h2> */}
              <button
                type="button"
                aria-label="Đóng camera"
                onClick={close}
                className="grid size-11 place-items-center rounded-full bg-ink-deep/50 outline-none transition-colors hover:bg-ink-deep/70 focus-visible:ring-2 focus-visible:ring-canvas lg:bg-canvas/10 lg:hover:bg-canvas/20"
              >
                <XIcon className="size-6" />
              </button>
            </div>
            {/* Side panel: the whole frame at its own aspect ratio, as it will be captured. */}
            <div className="lg:flex lg:min-h-0 lg:flex-1 lg:items-center lg:px-4">
              <video
                key={stream.id}
                ref={video}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute inset-0 size-full object-cover duration-500 animate-in fade-in lg:static lg:h-auto lg:max-h-full lg:rounded-lg lg:object-contain",
                  facing === "user" && "-scale-x-100",
                )}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 items-center bg-linear-to-t from-ink-deep/70 to-transparent px-6 pt-10 pb-[max(2rem,env(safe-area-inset-bottom))] duration-500 animate-in slide-in-from-bottom-8 lg:static lg:bg-none lg:pt-6">
              <span />
              <button
                type="button"
                aria-label="Chụp"
                onClick={shoot}
                className="group justify-self-center rounded-full border-4 border-canvas p-1 outline-none focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-ink-deep"
              >
                <span className="block size-14 rounded-full bg-canvas transition-transform group-hover:scale-95 group-active:scale-80" />
              </button>
              {canSwitch && (
                <button
                  type="button"
                  aria-label="Đổi camera"
                  onClick={() => void startCamera(facing === "user" ? "environment" : "user")}
                  className="group grid size-12 place-items-center justify-self-end rounded-full bg-ink-deep/50 outline-none transition-colors hover:bg-ink-deep/70 focus-visible:ring-2 focus-visible:ring-canvas"
                >
                  <SwitchCameraIcon
                    className={cn("size-6 transition-transform duration-500", facing === "environment" && "rotate-180")}
                  />
                </button>
              )}
            </div>
            {flash && (
              <div
                className="absolute inset-0 bg-canvas duration-300 animate-out fade-out fill-mode-forwards"
                onAnimationEnd={() => {
                  setFlash(false);
                  close();
                }}
              />
            )}
          </div>,
          document.body,
        )}

      {(selfie || status) && (
        <div className="mt-4 flex items-start gap-3">
          {selfie && (
            <div
              className="relative h-32 max-w-1/2 shrink-0 overflow-hidden rounded-lg bg-surface-card"
              style={{ aspectRatio: `${selfie.width} / ${selfie.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfie.url} alt="Ảnh selfie" className="size-full object-cover" />
              {selfie.faces.map((face, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Khuôn mặt ${index + 1}`}
                  aria-pressed={index === selfie.selected}
                  disabled={busy}
                  onClick={() => pick(index)}
                  className={cn(
                    "absolute rounded-sm border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    index === selfie.selected ? "border-brand" : "border-canvas/80 hover:border-canvas",
                  )}
                  style={boxStyle(face.box)}
                />
              ))}
            </div>
          )}
          {status && (
            <p
              role="status"
              className={cn("flex items-center gap-2 text-body", status.error && "text-danger")}
            >
              {status.busy && <Spinner aria-hidden className="shrink-0" />}
              {status.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
