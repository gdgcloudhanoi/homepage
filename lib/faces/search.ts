import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadAlbumVersion, loadPhotos, PAGE_SIZE, type PhotoSlice } from "@/lib/photos/gallery";
import { faces, photos, searches } from "@/lib/photos/storage";
import { DEFAULT_FACE_THRESHOLD, faceThresholdSchema } from "./config";

// Cache tag of the public copy of platform/ai; saving AI settings marks it stale.
export const AI_TAG = "ai";

const SEARCH_LIMIT = 20;
const SEARCH_WINDOW = 10 * 60 * 1000;
// Firestore's maximum for findNearest, with no cursor: faces are searched in `createdAt` windows,
// newest first, and a window that fills it is halved and searched again.
const MATCH_LIMIT = 1000;
// Vector queries per request, so one page can't run long.
const QUERIES_PER_PAGE = 12;
// One vector search per client in this time; searches in between get the stored result.
const SEARCH_COOLDOWN = 30 * 1000;
// How long a result stays for paging and reuse. `expiresAt` is the TTL field of `search`.
const SEARCH_KEEP = 60 * 60 * 1000;
// Stored faces this close to the selfie (one per photo) refine the query: the selfie weighs half,
// their mean the other half, so different poses and light match too.
const REFINE_THRESHOLD = 0.5;
const REFINE_FACES = 5;

export type FaceResults = PhotoSlice & {
  // Id of the stored search, so pages of a replaced search are refused.
  search: string;
  // Photos found so far.
  total: number;
  // Every face has been searched, so `total` is final.
  complete: boolean;
  next: number | null;
};

type StoredSearch = {
  // Newest shot first from the first unserved page on; served pages keep their order.
  photos: string[];
  // Capture time of each photo, ms, or null without EXIF time.
  taken: (number | null)[];
  // Ids of the faces that refined the query; their embeddings stay in `faces`.
  refinedBy: string[];
  // Faces created in [floor, until) ms are still to search; null when all are done.
  until: number | null;
  floor: number;
  // Length of the next window, ms.
  span: number;
  // Every page of a search uses the threshold it started with.
  threshold: number;
  version: string;
  searchedAt: Timestamp;
  expiresAt: Timestamp;
};

export const loadFaceThreshold = unstable_cache(
  async () => {
    const stored = faceThresholdSchema.safeParse(
      (await getAdminDb().doc("platform/ai").get()).get("faceThreshold"),
    );
    return stored.success ? stored.data : DEFAULT_FACE_THRESHOLD;
  },
  ["face-threshold"],
  { revalidate: 60, tags: [AI_TAG] },
);

// Fixed window per client. The key is a hash, so no address is stored, and `until` is the TTL
// field of every `throttle` collection, so Firestore drops the doc after the window.
// Returns the minutes left when the client is over the limit.
export async function throttleSearch(client: string) {
  const key = createHash("sha256").update(`face-search:${client}`).digest("hex");
  const ref = getAdminDb().doc(`platform/photos/throttle/${key}`);
  return getAdminDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const until = (snapshot.get("until") as Timestamp | undefined)?.toMillis() ?? 0;
    const now = Date.now();
    if (until <= now) {
      tx.set(ref, { count: 1, until: Timestamp.fromMillis(now + SEARCH_WINDOW) });
      return null;
    }
    const count = Number(snapshot.get("count")) || 0;
    if (count >= SEARCH_LIMIT) return Math.ceil((until - now) / 60_000);
    tx.update(ref, { count: count + 1 });
    return null;
  });
}

// Faces created in [from, until) at least as similar as the threshold to `embedding` (L2-normalized
// w600k_mbf), best match first. Only photo ids leave `faces`; never boxes or embeddings.
async function findInWindow(embedding: Float32Array, from: number, until: number, threshold: number) {
  const { docs } = await faces()
    .where("createdAt", ">=", Timestamp.fromMillis(from))
    .where("createdAt", "<", Timestamp.fromMillis(until))
    .select("photo")
    .findNearest({
      vectorField: "embedding",
      queryVector: Array.from(embedding),
      limit: MATCH_LIMIT,
      // Normalized vectors: same order as cosine, cheaper. Keeps results ≥ the threshold.
      distanceMeasure: "DOT_PRODUCT",
      distanceThreshold: threshold,
    })
    .get();
  return docs.map((doc) => doc.get("photo") as string);
}

async function oldestFace() {
  const { docs } = await faces().orderBy("createdAt").select("createdAt").limit(1).get();
  return (docs[0]?.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
}

function refine(selfie: Float32Array, vectors: number[][]) {
  if (!vectors.length) return selfie;
  const query = selfie.map(
    (value, i) => value / 2 + vectors.reduce((sum, vector) => sum + vector[i], 0) / (2 * vectors.length),
  );
  const norm = Math.hypot(...query);
  return query.map((value) => value / norm);
}

async function refineFaces(selfie: Float32Array) {
  const { docs } = await faces()
    // The vector index leads with `createdAt`, so every vector query filters on it.
    .where("createdAt", ">=", Timestamp.fromMillis(0))
    .select("photo", "embedding")
    .findNearest({
      vectorField: "embedding",
      queryVector: Array.from(selfie),
      limit: REFINE_FACES * 4,
      distanceMeasure: "DOT_PRODUCT",
      distanceThreshold: REFINE_THRESHOLD,
    })
    .get();
  const photos = new Set<string>();
  return docs
    .filter((doc) => {
      const photo = doc.get("photo") as string;
      if (photos.has(photo)) return false;
      photos.add(photo);
      return true;
    })
    .slice(0, REFINE_FACES)
    .map((doc) => ({ id: doc.id, vector: (doc.get("embedding") as FirebaseFirestore.VectorValue).toArray() }));
}

// Rebuilds the refined query of a stored search for its later pages.
async function refinedQuery(selfie: Float32Array, ids: string[]) {
  if (!ids.length) return selfie;
  const snapshots = await getAdminDb().getAll(...ids.map((id) => faces().doc(id)), {
    fieldMask: ["embedding"],
  });
  return refine(
    selfie,
    snapshots.flatMap((snapshot) => {
      const vector = snapshot.get("embedding") as FirebaseFirestore.VectorValue | undefined;
      return vector ? [vector.toArray()] : [];
    }),
  );
}

async function captureTimes(ids: string[]) {
  if (!ids.length) return [];
  const snapshots = await getAdminDb().getAll(...ids.map((id) => photos().doc(id)), {
    fieldMask: ["capturedAt"],
  });
  return snapshots.map(
    (snapshot) => (snapshot.get("capturedAt") as Timestamp | null | undefined)?.toMillis() ?? null,
  );
}

type Found = { id: string; at: number | null };

// Like the gallery: newest shot first, no capture time last, ties by id descending (upload order).
function newestFirst(a: Found, b: Found) {
  if (a.at !== b.at) return a.at === null ? 1 : b.at === null ? -1 : b.at - a.at;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// Searches older windows until `want` photos are found, everything is searched, or the query budget
// runs out. A photo's faces share its `createdAt`, so each photo is found in one window only.
// The first `served` photos were already shown; the rest, old and new, are sorted by capture time.
async function advance(search: StoredSearch, embedding: Float32Array, want: number, served: number) {
  const { threshold } = search;
  const found = new Set(search.photos);
  const added: string[] = [];
  let { until, floor, span } = search;
  for (let queries = 0; until !== null && found.size < want && queries < QUERIES_PER_PAGE; queries++) {
    const from = Math.max(floor, until - span);
    const matches = await findInWindow(embedding, from, until, threshold);
    if (matches.length >= MATCH_LIMIT && until - from > 1) {
      if (!floor) floor = await oldestFace();
      span = Math.max(1, Math.floor((until - Math.max(floor, from)) / 2));
      continue;
    }
    for (const photo of matches) {
      if (found.has(photo)) continue;
      found.add(photo);
      added.push(photo);
    }
    until = from > floor ? from : null;
    if (matches.length < MATCH_LIMIT / 2) span *= 2;
  }
  const times = await captureTimes(added);
  const rest = [
    ...search.photos.slice(served).map((id, i) => ({ id, at: search.taken[served + i] ?? null })),
    ...added.map((id, i) => ({ id, at: times[i] })),
  ].sort(newestFirst);
  return {
    ...search,
    photos: [...search.photos.slice(0, served), ...rest.map((item) => item.id)],
    taken: [...search.taken.slice(0, served), ...rest.map((item) => item.at)],
    until,
    floor,
    span,
  };
}

const searchRef = (client: string) =>
  searches().doc(createHash("sha256").update(`face-search:${client}`).digest("hex"));

// TTL deletion lags, so expiry is checked here too. Searches stored before `taken` or `threshold`
// are run again.
function readSearch(data: unknown) {
  const stored = data as StoredSearch | undefined;
  return stored &&
    Array.isArray(stored.taken) &&
    typeof stored.threshold === "number" &&
    stored.expiresAt.toMillis() > Date.now()
    ? stored
    : null;
}

async function resultPage(stored: StoredSearch, offset: number): Promise<FaceResults> {
  const end = offset + PAGE_SIZE;
  const total = stored.photos.length;
  const complete = stored.until === null;
  const final = complete && end >= total;
  // A group shows once, at its first match: earlier pages may hold it already.
  const rank = new Map(stored.photos.map((id, i) => [id, i]));
  // Out of query budget before a full page: the next request searches on from the first photo
  // left out, so a page never ends on a short row.
  const { used, ...slice } = await loadPhotos(
    stored.photos.slice(offset, end),
    final,
    rank,
    !complete && end > total,
  );
  return {
    ...slice,
    search: String(stored.searchedAt.toMillis()),
    total,
    complete,
    next: final ? null : offset + used,
  };
}

// `same`: the browser found this face close to the one of its last fresh search. The stored result
// comes back during the cooldown, or for the same face while the album and threshold are unchanged.
export async function searchByFace(client: string, embedding: Float32Array, same: boolean) {
  const ref = searchRef(client);
  const [snapshot, album, threshold] = await Promise.all([
    ref.get(),
    loadAlbumVersion(),
    loadFaceThreshold(),
  ]);
  const version = `${album}:${threshold}`;
  const stored = readSearch(snapshot.data());
  const now = Date.now();
  if (
    stored &&
    (now - stored.searchedAt.toMillis() < SEARCH_COOLDOWN || (same && stored.version === version))
  ) {
    return { result: await resultPage(stored, 0), fresh: false };
  }
  const refiners = await refineFaces(embedding);
  const search = await advance(
    {
      photos: [],
      taken: [],
      refinedBy: refiners.map((face) => face.id),
      until: now,
      floor: 0,
      span: now,
      threshold,
      version,
      searchedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + SEARCH_KEEP),
    },
    refine(
      embedding,
      refiners.map((face) => face.vector),
    ),
    PAGE_SIZE,
    0,
  );
  await ref.set(search);
  return { result: await resultPage(search, 0), fresh: true };
}

// Later pages continue the search with the browser's embedding; the server never stores it.
export async function loadSearchPage(
  client: string,
  search: string,
  offset: number,
  embedding: Float32Array,
) {
  const ref = searchRef(client);
  let stored = readSearch((await ref.get()).data());
  if (!stored || String(stored.searchedAt.toMillis()) !== search) return null;
  if (stored.until !== null && stored.photos.length < offset + PAGE_SIZE) {
    const query = await refinedQuery(embedding, stored.refinedBy ?? []);
    stored = await advance(stored, query, offset + PAGE_SIZE, offset);
    const { photos, taken, until, floor, span } = stored;
    await ref.update({ photos, taken, until, floor, span });
  }
  return resultPage(stored, offset);
}
