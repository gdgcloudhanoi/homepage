// Shared by the browser pipeline and the Server Actions.

// Optimized copies; only `main` gets the watermark. The original is uploaded untouched.
export const VARIANTS = {
  // Long edge.
  main: { size: 3840, quality: 0.82 },
  // Short edge: grid tiles are squares cropped with object-cover.
  thumb: { size: 640, quality: 0.82 },
} as const;

// Long edge of the clean copy faces are found on (uploads and selfies); MIN_FACE is tuned for it.
export const DETECT_SIZE = 2048;

export type MediaVariant = keyof typeof VARIANTS;

// Public URLs of the copies (app/media); Storage paths and tokens stay on the server.
export const mediaUrl = (id: string, variant: MediaVariant) =>
  variant === "main" ? `/media/${id}` : `/media/${id}/thumb`;

export const fileKeys = ["original", "main", "thumb"] as const;
export type FileKey = (typeof fileKeys)[number];

// Accepted originals and their extension in Storage.
export const originalTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "image/tiff": "tif",
} as const;
export type OriginalType = keyof typeof originalTypes;

// WebP, or JPEG where the browser can't encode WebP (Safari).
export const variantTypes = { "image/webp": "webp", "image/jpeg": "jpg" } as const;

export const MAX_SIZE: Record<FileKey, number> = {
  original: 200 * 1024 * 1024,
  main: 30 * 1024 * 1024,
  thumb: 5 * 1024 * 1024,
};

// MobileFaceNet (InsightFace w600k_mbf), L2-normalized.
export const EMBEDDER = "w600k_mbf";
export const EMBEDDING_DIM = 512;
export const MAX_FACES = 200;
// Photos pinned to the top of the public gallery.
export const MAX_PINNED = 20;
// Photos in one group (`photos/{id}.group`); the gallery sends a group with its tile.
export const MAX_GROUP = 100;

const extensionTypes: Record<string, OriginalType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

// Browsers often leave the type empty for HEIC, so fall back to the extension.
export function originalType({ name, type }: { name: string; type: string }) {
  if (type in originalTypes) return type as OriginalType;
  return extensionTypes[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export function objectPath(key: FileKey, id: string, type: string) {
  const extension =
    key === "original"
      ? originalTypes[type as OriginalType]
      : variantTypes[type as keyof typeof variantTypes];
  return `photos/${key}/${id}.${extension}`;
}

// Time-ordered, so photo ids and file names sort by upload time.
export function uuidv7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ms = Date.now();
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
