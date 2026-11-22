"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { loadSearchPage, searchByFace, type FaceResults } from "@/lib/faces/search";
// TODO: restore with the per-IP throttle in findMyPhotos.
// import { throttleSearch } from "@/lib/faces/search";
import { EMBEDDING_DIM } from "@/lib/photos/photo";

const embeddingSchema = z
  .instanceof(Float32Array)
  .refine((v) => v.length === EMBEDDING_DIM && v.every(Number.isFinite) && v.some((x) => x !== 0))
  .transform((v) => {
    const norm = Math.hypot(...v);
    return v.map((x) => x / norm);
  });

const CLIENT_COOKIE = "photos-client";

// Behind App Hosting's proxies X-Forwarded-For can be forged; x-fah-client-ip is set after them,
// and FIREBASE_CONFIG tells us we run there.
async function client() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (process.env.FIREBASE_CONFIG) return list.get("x-fah-client-ip") ?? forwarded ?? "unknown";
  return forwarded || "local";
}

// Stored results are keyed per browser, never per IP: visitors on the same Wi-Fi share one.
async function browser() {
  const current = z.uuid().safeParse((await cookies()).get(CLIENT_COOKIE)?.value);
  return current.success ? current.data : null;
}

async function newBrowser() {
  const id = randomUUID();
  (await cookies()).set(CLIENT_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/photos",
    maxAge: 30 * 24 * 60 * 60,
  });
  return id;
}

// Public. Only the selfie's embedding comes in (the photo never leaves the browser) and is not
// stored; only the ids of the matching photos are kept for paging, and public photo links go out.
export async function findMyPhotos(
  input: Float32Array,
  same: boolean,
): Promise<{ error: string } | { result: FaceResults; fresh: boolean }> {
  const embedding = embeddingSchema.parse(input);
  const isSame = z.boolean().parse(same);
  // TODO: bring back the per-IP throttle once the 30 s per-browser cooldown proves too weak.
  // const wait = await throttleSearch(await client());
  // if (wait) return { error: `Bạn đã tìm nhiều lần. Vui lòng thử lại sau ${wait} phút.` };
  try {
    const key = (await browser()) ?? (await newBrowser());
    return await searchByFace(key, embedding, isSame);
  } catch (error) {
    console.error("[photos] face search failed:", error);
    return { error: "Không tìm được ảnh. Vui lòng thử lại sau." };
  }
}

// Each page may search older faces, so it needs the embedding of the search again.
export async function loadMyPhotos(
  search: string,
  offset: number,
  input: Float32Array,
): Promise<{ error: string } | { result: FaceResults }> {
  const id = z.string().regex(/^\d{1,16}$/).parse(search);
  const start = z.number().int().min(0).max(100_000).parse(offset);
  const embedding = embeddingSchema.parse(input);
  try {
    const key = await browser();
    const result = key && (await loadSearchPage(key, id, start, embedding));
    return result ? { result } : { error: "Kết quả đã hết hạn. Vui lòng tìm lại." };
  } catch (error) {
    console.error("[photos] loading search page failed:", error);
    return { error: "Không tải được ảnh. Vui lòng thử lại." };
  }
}
