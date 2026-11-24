import * as ort from "onnxruntime-web";
import { FaceDetector } from "@mediapipe/tasks-vision";
import type { FaceDetectorId } from "./config";
import type { DetectedFace, FaceRequest, FaceResponse } from "./face";
import { MAX_FACES } from "@/lib/photos/photo";

type Point = [number, number];
type Detection = { box: [x: number, y: number, w: number, h: number]; score: number; landmarks: Point[] };

const MODELS = {
  yunet:
    "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx",
  "scrfd-500m": "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/det_500m.onnx",
  "scrfd-2.5g":
    "https://huggingface.co/hsuyabc/scrfd_2.5g_bnkps.onnx/resolve/main/scrfd_2.5g_bnkps.onnx",
  "scrfd-10g": "https://huggingface.co/WePrompt/buffalo_l/resolve/main/det_10g.onnx",
  mobilefacenet: "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/w600k_mbf.onnx",
};
type ModelName = keyof typeof MODELS;

const MEDIAPIPE_VERSION = "1.1.0";
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_MODELS = {
  "blazeface-short":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
  "blazeface-full":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite",
  "blazeface-sparse":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range_sparse.tflite",
};
type MediaPipeId = keyof typeof MEDIAPIPE_MODELS;

// ArcFace 112x112 reference landmarks: eyes, nose tip, mouth corners (image left first).
const ARCFACE: Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
// BlazeFace has a mouth center instead of corners.
const ARCFACE_BLAZE: Point[] = [...ARCFACE.slice(0, 3), [56.1396, 92.2848]];

// Faces smaller than this on the 2048px copy give unusable embeddings.
const MIN_FACE = 20;

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

// Models are kept across visits; SCRFD 10G alone is 17 MB.
async function download(url: string) {
  const cache =
    typeof caches === "undefined" ? null : await caches.open("platform-face-models").catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được mô hình (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await cache?.put(url, new Response(bytes)).catch(() => {});
  return bytes;
}

type Loaded = { session: ort.InferenceSession; backend: string };
const sessions = new Map<ModelName, Promise<Loaded>>();

// AveragePool ceil_mode is unsupported on WebGPU, and a failed WebGPU run breaks every later WebGPU session.
const WASM_ONLY = new Set<ModelName>(["scrfd-2.5g", "scrfd-10g"]);

// Two first sessions on different backends ("wasm", "webgpu") at once break ORT's init for good.
let creating: Promise<unknown> = Promise.resolve();

function createSession(bytes: Uint8Array, backend: string) {
  const session = creating.then(() =>
    ort.InferenceSession.create(bytes, { executionProviders: [backend] }),
  );
  creating = session.catch(() => {});
  return session;
}

function load(name: ModelName) {
  let loaded = sessions.get(name);
  if (!loaded) {
    loaded = (async () => {
      const bytes = await download(MODELS[name]);
      const providers = !WASM_ONLY.has(name) && "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
      let cause = "";
      for (const backend of providers) {
        try {
          return { session: await createSession(bytes, backend), backend };
        } catch (error) {
          console.warn(`[face] ${name} on ${backend} failed`, error);
          cause = error instanceof Error ? error.message : String(error);
        }
      }
      throw new Error(`Không khởi tạo được ${name}: ${cause}`);
    })();
    loaded.catch(() => sessions.delete(name));
    sessions.set(name, loaded);
  }
  return loaded;
}

function letterbox(image: ImageBitmap, size: number, fill: string) {
  const scale = size / Math.max(image.width, image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const padX = (size - w) / 2;
  const padY = (size - h) / 2;
  const ctx = new OffscreenCanvas(size, size).getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, padX, padY, w, h);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const unmap = ([x, y]: Point): Point => [(x - padX) / scale, (y - padY) / scale];
  return { pixels, unmap };
}

function iou(a: Detection["box"], b: Detection["box"]) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

// Highest score first.
function nms(dets: Detection[], threshold: number) {
  const rest = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  while (rest.length) {
    const top = rest[0];
    kept.push(top);
    rest.splice(0, rest.length, ...rest.filter((d) => iou(top.box, d.box) <= threshold));
  }
  return kept;
}

async function detectYuNet(session: ort.InferenceSession, image: ImageBitmap) {
  const size = 640;
  const { pixels, unmap } = letterbox(image, size, "#000");
  const plane = size * size;
  const input = new Float32Array(plane * 3);
  // BGR, 0..255, NCHW
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    input[p] = pixels[i + 2];
    input[plane + p] = pixels[i + 1];
    input[2 * plane + p] = pixels[i];
  }
  const out = await session.run({
    input: new ort.Tensor("float32", input, [1, 3, size, size]),
  });

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const dets: Detection[] = [];
  for (const stride of [8, 16, 32]) {
    const cols = size / stride;
    const cls = out[`cls_${stride}`].data as Float32Array;
    const obj = out[`obj_${stride}`].data as Float32Array;
    const bbox = out[`bbox_${stride}`].data as Float32Array;
    const kps = out[`kps_${stride}`].data as Float32Array;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
      if (score < 0.7) continue;
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cx = (c + bbox[i * 4]) * stride;
      const cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride;
      const h = Math.exp(bbox[i * 4 + 3]) * stride;
      const [x1, y1] = unmap([cx - w / 2, cy - h / 2]);
      const [x2, y2] = unmap([cx + w / 2, cy + h / 2]);
      const landmarks: Point[] = [];
      for (let k = 0; k < 5; k++)
        landmarks.push(
          unmap([(kps[i * 10 + k * 2] + c) * stride, (kps[i * 10 + k * 2 + 1] + r) * stride]),
        );
      dets.push({ box: [x1, y1, x2 - x1, y2 - y1], score, landmarks });
    }
  }
  return nms(dets, 0.3);
}

// Outputs: scores, bboxes, kps for strides 8/16/32; 2 anchors per cell.
async function detectSCRFD(session: ort.InferenceSession, image: ImageBitmap) {
  const size = 640;
  const { pixels, unmap } = letterbox(image, size, "#000");
  const plane = size * size;
  const input = new Float32Array(plane * 3);
  // RGB, (x - 127.5) / 128, NCHW
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    input[p] = (pixels[i] - 127.5) / 128;
    input[plane + p] = (pixels[i + 1] - 127.5) / 128;
    input[2 * plane + p] = (pixels[i + 2] - 127.5) / 128;
  }
  const out = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, size, size]),
  });
  const data = session.outputNames.map((n) => out[n].data as Float32Array);

  const dets: Detection[] = [];
  [8, 16, 32].forEach((stride, s) => {
    const [scores, bbox, kps] = [data[s], data[s + 3], data[s + 6]];
    const cols = size / stride;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] < 0.5) continue;
      const cell = Math.floor(i / 2);
      const cx = (cell % cols) * stride;
      const cy = Math.floor(cell / cols) * stride;
      const [x1, y1] = unmap([cx - bbox[i * 4] * stride, cy - bbox[i * 4 + 1] * stride]);
      const [x2, y2] = unmap([cx + bbox[i * 4 + 2] * stride, cy + bbox[i * 4 + 3] * stride]);
      const landmarks: Point[] = [];
      for (let k = 0; k < 5; k++)
        landmarks.push(
          unmap([cx + kps[i * 10 + k * 2] * stride, cy + kps[i * 10 + k * 2 + 1] * stride]),
        );
      dets.push({ box: [x1, y1, x2 - x1, y2 - y1], score: scores[i], landmarks });
    }
  });
  return nms(dets, 0.4);
}

type Detector = (image: ImageBitmap) => Promise<Detection[]>;
const detectors = new Map<FaceDetectorId, Promise<Detector>>();

function loadDetector(id: FaceDetectorId) {
  let detector = detectors.get(id);
  if (!detector) {
    detector =
      id in MEDIAPIPE_MODELS
        ? loadMediaPipe(id as MediaPipeId)
        : load(id as Exclude<FaceDetectorId, MediaPipeId>).then(
            ({ session }): Detector =>
              (image) => (id === "yunet" ? detectYuNet : detectSCRFD)(session, image),
          );
    detector.catch(() => detectors.delete(id));
    detectors.set(id, detector);
  }
  return detector;
}

async function loadMediaPipe(id: MediaPipeId): Promise<Detector> {
  // Module workers have no importScripts, so load the ES module build ourselves.
  const [{ default: factory }, model] = await Promise.all([
    import(/* webpackIgnore: true */ `${MEDIAPIPE_WASM}/vision_wasm_module_internal.js`),
    download(MEDIAPIPE_MODELS[id]),
  ]);
  const fileset = {
    wasmLoaderPath: "",
    wasmBinaryPath: `${MEDIAPIPE_WASM}/vision_wasm_module_internal.wasm`,
  };
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      // MediaPipe unsets ModuleFactory after each instance is created.
      Object.assign(globalThis, { ModuleFactory: factory });
      const detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
      return async (image) =>
        detector
          .detect(image)
          .detections.map((d) => ({
            box: [
              d.boundingBox!.originX,
              d.boundingBox!.originY,
              d.boundingBox!.width,
              d.boundingBox!.height,
            ] as Detection["box"],
            score: d.categories[0]?.score ?? 0,
            landmarks: d.keypoints.map((k): Point => [k.x * image.width, k.y * image.height]),
          }))
          .sort((a, b) => b.score - a.score);
    } catch (error) {
      console.warn(`[face] ${id} on ${delegate} failed`, error);
    }
  }
  throw new Error(`Không khởi tạo được ${id}.`);
}

// Least-squares similarity (rotation + uniform scale + translation) src -> dst.
function similarity(src: Point[], dst: Point[]) {
  const n = src.length;
  const mean = (ps: Point[], i: 0 | 1) => ps.reduce((s, p) => s + p[i], 0) / n;
  const [sx, sy, dx, dy] = [mean(src, 0), mean(src, 1), mean(dst, 0), mean(dst, 1)];
  let num1 = 0;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const [xs, ys] = [src[i][0] - sx, src[i][1] - sy];
    const [xd, yd] = [dst[i][0] - dx, dst[i][1] - dy];
    num1 += xs * xd + ys * yd;
    num2 += xs * yd - ys * xd;
    den += xs * xs + ys * ys;
  }
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

async function embed(session: ort.InferenceSession, image: ImageBitmap, det: Detection) {
  const template = det.landmarks.length === 5 ? ARCFACE : ARCFACE_BLAZE;
  const { a, b, tx, ty } = similarity(det.landmarks.slice(0, template.length), template);
  const ctx = new OffscreenCanvas(112, 112).getContext("2d")!;
  ctx.setTransform(a, b, -b, a, tx, ty);
  ctx.drawImage(image, 0, 0);

  const pixels = ctx.getImageData(0, 0, 112, 112).data;
  const plane = 112 * 112;
  const input = new Float32Array(plane * 3);
  // RGB, [-1, 1], NCHW
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    input[p] = (pixels[i] - 127.5) / 127.5;
    input[plane + p] = (pixels[i + 1] - 127.5) / 127.5;
    input[2 * plane + p] = (pixels[i + 2] - 127.5) / 127.5;
  }
  const out = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 112, 112]),
  });
  const raw = out[session.outputNames[0]].data as Float32Array;
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0)) || 1;
  return Float32Array.from(raw, (v) => v / norm);
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const post = (message: FaceResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

// The pool sends one request at a time, since ORT sessions can't run concurrently.
self.onmessage = async ({ data: { detector: id, image } }: MessageEvent<FaceRequest>) => {
  try {
    const [detect, recognizer] = await Promise.all([loadDetector(id), load("mobilefacenet")]);
    const { width, height } = image;
    const found = (await detect(image))
      .filter(({ box }) => Math.min(box[2], box[3]) >= MIN_FACE)
      .slice(0, MAX_FACES);
    const faces: DetectedFace[] = [];
    for (const det of found) {
      const [x, y, w, h] = det.box;
      const [x1, y1, x2, y2] = [clamp(x / width), clamp(y / height), clamp((x + w) / width), clamp((y + h) / height)];
      faces.push({
        box: [x1, y1, x2 - x1, y2 - y1],
        landmarks: det.landmarks.flatMap(([lx, ly]) => [clamp(lx / width), clamp(ly / height)]),
        score: clamp(det.score),
        embedding: await embed(recognizer.session, image, det),
      });
    }
    post({ ok: true, faces }, faces.map((face) => face.embedding.buffer));
  } catch (error) {
    post({ ok: false, message: error instanceof Error ? error.message : "Không nhận diện được khuôn mặt." });
  } finally {
    image.close();
  }
};
