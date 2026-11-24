import { z } from "zod";

// Keys are stored in platform/ai and on every face, so never rename one.
export const faceDetectors = {
  "blazeface-short": "BlazeFace short-range (MediaPipe, 0.2 MB)",
  "blazeface-full": "BlazeFace full-range (MediaPipe, 1 MB)",
  "blazeface-sparse": "BlazeFace full-range sparse (MediaPipe, 0.7 MB)",
  yunet: "YuNet 2023mar (0.23 MB)",
  "scrfd-500m": "SCRFD 500M (2.5 MB)",
  "scrfd-2.5g": "SCRFD 2.5G (3.3 MB)",
  "scrfd-10g": "SCRFD 10G (17 MB)",
} as const;
export type FaceDetectorId = keyof typeof faceDetectors;

export const DEFAULT_FACE_DETECTOR: FaceDetectorId = "scrfd-10g";

export const faceDetectorSchema = z.enum(
  Object.keys(faceDetectors) as [FaceDetectorId, ...FaceDetectorId[]],
);

// Selfie search on /photos: 5 landmarks like the SCRFD faces stored on upload, and only 2.5 MB.
export const SEARCH_DETECTOR: FaceDetectorId = "scrfd-500m";

// Lowest similarity (dot product of normalized w600k_mbf embeddings) for a stored face to count
// as the selfie's person. Not measured on event photos yet; tuned in /platform/ai.
export const DEFAULT_FACE_THRESHOLD = 0.35;
export const FACE_THRESHOLD_MIN = 0.2;
export const FACE_THRESHOLD_MAX = 0.8;
export const faceThresholdSchema = z
  .number()
  .min(FACE_THRESHOLD_MIN)
  .max(FACE_THRESHOLD_MAX)
  .transform((value) => Math.round(value * 100) / 100);
