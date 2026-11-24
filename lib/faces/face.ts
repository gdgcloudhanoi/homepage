import type { FaceDetectorId } from "./config";

export type FaceRequest = { detector: FaceDetectorId; image: ImageBitmap };

// Box [x, y, w, h] and landmarks [x1, y1, x2, y2, …] as fractions of the image size.
export type DetectedFace = {
  box: number[];
  landmarks: number[];
  score: number;
  embedding: Float32Array<ArrayBuffer>;
};

export type FaceResponse = { ok: true; faces: DetectedFace[] } | { ok: false; message: string };

// Browser only. Detection + MobileFaceNet embeddings; the worker loads its models on the first request.
export const createFaceWorker = () =>
  new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
