import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { getAdminBucket, getAdminDb } from "@/lib/firebase-admin";
import { PHOTOS_REVALIDATE, PHOTOS_TAG } from "./gallery";
import type { MediaVariant } from "./photo";
import { photos } from "./storage";

// Copies never change once saved, so the CDN and browsers keep them for a year.
const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

const loadMedia = unstable_cache(
  async (id: string, variant: MediaVariant) => {
    const [snapshot] = await getAdminDb().getAll(photos().doc(id), {
      fieldMask: [`files.${variant}.path`, `files.${variant}.type`, `files.${variant}.size`, "hidden"],
    });
    const file = snapshot.get(`files.${variant}`) as
      | { path?: string; type?: string; size?: number }
      | undefined;
    if (!file?.path || snapshot.get("hidden") === true) return null;
    return {
      path: file.path,
      type: file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
      size: Number(file.size) || null,
    };
  },
  ["photo-media"],
  // Short, so a hidden photo stops being served here within a minute on every instance.
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);

// Streams a copy from Storage. Never the original.
// Plain fetch: the SDK's createReadStream stacks listeners on one stream (MaxListenersExceededWarning).
export async function serveMedia(
  request: Request,
  rawId: string,
  variant: MediaVariant,
  attachment = false,
) {
  const id = z.uuidv7().safeParse(rawId);
  if (!id.success) return notFound();
  const etag = `"${id.data}-${variant}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": IMMUTABLE } });
  }

  const file = await loadMedia(id.data, variant);
  if (!file) return notFound();
  const bucket = getAdminBucket();
  const token = await bucket.storage.authClient.getAccessToken();
  const upstream = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket.name}/o/${encodeURIComponent(file.path)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (upstream.status === 404) return notFound();
  if (!upstream.ok || !upstream.body) throw new Error(`Storage responded ${upstream.status}`);
  const headers = new Headers({
    "Content-Type": file.type,
    "Cache-Control": IMMUTABLE,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size) headers.set("Content-Length", String(file.size));
  if (attachment) {
    const name = `gdg-cloud-hanoi-${id.data.slice(-12)}.${file.type === "image/jpeg" ? "jpg" : "webp"}`;
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  return new Response(upstream.body, { headers });
}

// Cached briefly: an id may only exist once its upload is committed.
const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
