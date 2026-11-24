import "server-only";
import { unstable_cache } from "next/cache";
import type { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { FULL_ROW, mosaic, seedOf, type Mosaic } from "./mosaic";
import { MAX_PINNED, mediaUrl } from "./photo";
import { photos } from "./storage";

export const PAGE_SIZE = 48;
// Cache tag of everything read from `photos`; commitPhoto marks it stale.
export const PHOTOS_TAG = "photos";
// Seconds a cached page may be served before Firestore is read again. Revalidation is local to
// each server instance, so this bounds how stale other instances get.
export const PHOTOS_REVALIDATE = 60;

// What public pages may see of a photo: the /media URLs of the two copies and the time it was taken.
export type PublicPhoto = {
  id: string;
  thumb: string;
  main: string;
  // Size of `main`; `thumb` has the same aspect ratio.
  width: number;
  height: number;
  capturedAt: string | null;
  // On a gallery tile: the other shown photos of its group, newest shot first. Absent when alone.
  // The tile itself is the group's cover, else its newest shot.
  group?: PublicPhoto[];
};

export type PhotoSlice = { photos: PublicPhoto[]; mosaic: Mosaic };
export type PhotoPage = PhotoSlice & { next: string | null };

// Never `metadata`, `files.original`, `uploadedBy` or anything from `faces/*`. The face count
// only weights the layout, `hidden` and `pinned` only filter and order, `group` and `cover` only
// gather tiles; they stay on the server.
export const PUBLIC_FIELDS = [
  "files.thumb.path",
  "files.main.path",
  "files.main.width",
  "files.main.height",
  "capturedAt",
  "faces",
  "hidden",
  "pinned",
  "group",
  "cover",
];

// Firestore's limit on values per `in` filter.
const MAX_IN = 30;

// `pinned` is the photo's rank among pinned photos; absent when not pinned.
const isPinned = (snapshot: DocumentSnapshot) => typeof snapshot.get("pinned") === "number";

const groupOf = (snapshot: DocumentSnapshot) => {
  const group = snapshot.get("group");
  return typeof group === "string" && group ? group : null;
};

const capturedMillis = (snapshot: DocumentSnapshot) =>
  (snapshot.get("capturedAt") as Timestamp | null | undefined)?.toMillis() ?? null;

// The feed's query order: newest shot first, no capture time last, ties by id descending.
function feedOrder(a: DocumentSnapshot, b: DocumentSnapshot) {
  const x = capturedMillis(a);
  const y = capturedMillis(b);
  if (x !== y) return x === null ? 1 : y === null ? -1 : y - x;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

const capturedAtFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function toPublicPhoto(snapshot: DocumentSnapshot): PublicPhoto | null {
  if (snapshot.get("hidden") === true) return null;
  const main = snapshot.get("files.main") as { path?: string; width?: number; height?: number } | undefined;
  if (!snapshot.get("files.thumb.path") || !main?.path || !main.width || !main.height) return null;
  const capturedAt = snapshot.get("capturedAt") as Timestamp | null | undefined;
  return {
    id: snapshot.id,
    thumb: mediaUrl(snapshot.id, "thumb"),
    main: mediaUrl(snapshot.id, "main"),
    width: main.width,
    height: main.height,
    capturedAt: capturedAt ? capturedAtFormat.format(capturedAt.toMillis()) : null,
  };
}

type Member = { snapshot: DocumentSnapshot; photo: PublicPhoto };
// Shown photos of each group, in feed order.
type Groups = Map<string, Member[]>;
type Tile = { photo: PublicPhoto; faces: number };

// Adds the groups of `snapshots` not in `groups` yet: one `in` query per 30 groups, in parallel.
async function loadGroups(snapshots: DocumentSnapshot[], groups: Groups) {
  const ids = [
    ...new Set(snapshots.map(groupOf).filter((id): id is string => !!id && !groups.has(id))),
  ];
  if (!ids.length) return;
  const chunks = Array.from({ length: Math.ceil(ids.length / MAX_IN) }, (_, i) =>
    ids.slice(i * MAX_IN, (i + 1) * MAX_IN),
  );
  const results = await Promise.all(
    chunks.map((chunk) => photos().where("group", "in", chunk).select(...PUBLIC_FIELDS).get()),
  );
  for (const id of ids) groups.set(id, []);
  for (const { docs } of results) {
    for (const snapshot of docs) {
      const photo = toPublicPhoto(snapshot);
      if (photo) groups.get(groupOf(snapshot)!)?.push({ snapshot, photo });
    }
  }
  for (const id of ids) groups.get(id)!.sort((a, b) => feedOrder(a.snapshot, b.snapshot));
}

// The tile of the photo's group, shown as its cover (else its newest shot) with the other photos
// after it. `place` ranks the group's photos in this list: the tile goes at the lowest, so null
// when another photo of the group ranks below this one.
function toTile(
  snapshot: DocumentSnapshot,
  groups: Groups,
  place: (member: DocumentSnapshot, head: DocumentSnapshot) => number,
): Tile | null {
  const photo = toPublicPhoto(snapshot);
  if (!photo) return null;
  const group = groupOf(snapshot);
  const members = group ? (groups.get(group) ?? []) : [];
  if (members.length < 2 || !members.some((m) => m.snapshot.id === snapshot.id)) {
    return { photo, faces: Number(snapshot.get("faces")) || 0 };
  }
  const head = members.find((m) => m.snapshot.get("cover") === true) ?? members[0];
  const own = place(snapshot, head.snapshot);
  if (members.some((m) => m.snapshot.id !== snapshot.id && place(m.snapshot, head.snapshot) < own)) {
    return null;
  }
  return {
    photo: { ...head.photo, group: members.filter((m) => m !== head).map((m) => m.photo) },
    faces: Number(head.snapshot.get("faces")) || 0,
  };
}

// Group shots (more faces) become the mosaic's large tiles.
function toSlice(tiles: Tile[], final: boolean, hero = false): PhotoSlice {
  return {
    photos: tiles.map(({ photo }) => photo),
    mosaic: mosaic(
      tiles.map(({ photo, faces }) => ({
        weight: Math.min(faces, 12),
        seed: seedOf(photo.id),
      })),
      final,
      hero,
    ),
  };
}

// Pinned photos open the first page in their order, and the feed leaves them out. Then newest shot
// first; photos without EXIF time (`capturedAt: null`) sort last. Ties fall back to the
// implicit document id order (descending, like the last orderBy), and uuidv7 ids follow upload time.
// Hidden photos are skipped here rather than in the query: a photo saved before `hidden` existed has
// no such field, and Firestore filters leave out docs without the field.
// A group is one tile where its cover (else its newest shot) would be, or at its first pinned
// photo, so every page decides alone which photos to skip: no state crosses pages.
export const loadPhotoPage = unstable_cache(
  async (after: string | null): Promise<PhotoPage> => {
    const groups: Groups = new Map();
    let cursor: DocumentSnapshot | null = null;
    const pinned: Tile[] = [];
    if (after) {
      // The cursor only needs the ordered field; the full doc would also carry the raw EXIF.
      [cursor] = await getAdminDb().getAll(photos().doc(after), { fieldMask: ["capturedAt"] });
      if (!cursor.exists) return { ...toSlice([], true), next: null };
    } else {
      const { docs } = await photos()
        .where("pinned", ">=", 0)
        .orderBy("pinned")
        .select(...PUBLIC_FIELDS)
        .limit(MAX_PINNED)
        .get();
      await loadGroups(docs, groups);
      for (const doc of docs) {
        const tile = toTile(doc, groups, (member) =>
          isPinned(member) ? (member.get("pinned") as number) : Infinity,
        );
        if (tile) pinned.push(tile);
      }
    }
    const size = PAGE_SIZE - pinned.length;
    const shown: Tile[] = [];
    for (;;) {
      let query = photos()
        .orderBy("capturedAt", "desc")
        .select(...PUBLIC_FIELDS)
        .limit(PAGE_SIZE + 1);
      if (cursor) query = query.startAfter(cursor);
      const { docs } = await query.get();
      const candidates = docs.filter((doc) => doc.get("hidden") !== true && !isPinned(doc));
      await loadGroups(candidates, groups);
      for (const doc of candidates) {
        // A pinned group was shown on the first page; others show at their head.
        const tile = toTile(doc, groups, (member, head) =>
          isPinned(member) ? -1 : member.id === head.id ? 0 : 1,
        );
        if (tile) shown.push(tile);
      }
      if (shown.length > size || docs.length <= PAGE_SIZE) break;
      cursor = docs[docs.length - 1];
    }
    const more = shown.length > size;
    const page = shown.slice(0, size);
    return {
      ...toSlice([...pinned, ...page], !more, pinned.length > 0),
      next: more && page.length ? page[page.length - 1].photo.id : null,
    };
  },
  ["photos-page", "capturedAt", "pinned", "group"],
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);

export const countPhotos = unstable_cache(
  async () => {
    // Counts the hidden ones instead: `where("hidden", "==", false)` would miss photos without the field.
    const [all, hidden] = await Promise.all([
      photos().count().get(),
      photos().where("hidden", "==", true).count().get(),
    ]);
    return all.data().count - hidden.data().count;
  },
  ["photos-count"],
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);

// Tiles of the feed: shown photos, each group counted once. Reads every grouped photo (2 fields).
export const countTiles = unstable_cache(
  async () => {
    const [all, hidden, grouped] = await Promise.all([
      photos().count().get(),
      photos().where("hidden", "==", true).count().get(),
      photos().where("group", ">", "").select("group", "hidden").get(),
    ]);
    const sizes = new Map<string, number>();
    for (const doc of grouped.docs) {
      const group = groupOf(doc);
      if (group && doc.get("hidden") !== true) sizes.set(group, (sizes.get(group) ?? 0) + 1);
    }
    let folded = 0;
    for (const size of sizes.values()) folded += size - 1;
    return all.data().count - hidden.data().count - folded;
  },
  ["photos-tiles"],
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);

// Changes when a photo is added. Edits don't change which faces match: hidden photos are dropped
// when results are shown. Deleting photos would need a real version.
export const loadAlbumVersion = unstable_cache(
  async () => {
    const [count, latest] = await Promise.all([
      photos().count().get(),
      photos().orderBy("uploadedAt", "desc").select("uploadedAt").limit(1).get(),
    ]);
    const uploadedAt = latest.docs[0]?.get("uploadedAt") as Timestamp | undefined;
    return `${count.data().count}:${uploadedAt?.toMillis() ?? 0}`;
  },
  ["photos-version"],
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);

// Public photos in the given order; missing, hidden or incomplete ones are skipped. `rank` places
// the ids in a longer list (face search results paged from it): a group is one tile, at its first
// photo there. Unless final, only whole rows are kept so the next slice stacks without a hole;
// `used` counts the ids they took. With `wait` (more ids are coming) a slice short of a row stays
// empty, else it keeps its short row so paging moves on.
export async function loadPhotos(
  ids: string[],
  final: boolean,
  rank: ReadonlyMap<string, number> = new Map(ids.map((id, i) => [id, i])),
  wait = false,
): Promise<PhotoSlice & { used: number }> {
  if (!ids.length) return { ...toSlice([], final), used: 0 };
  const snapshots = await getAdminDb().getAll(...ids.map((id) => photos().doc(id)), {
    fieldMask: PUBLIC_FIELDS,
  });
  const groups: Groups = new Map();
  await loadGroups(
    snapshots.filter((snapshot) => snapshot.exists),
    groups,
  );
  const placeOf = (member: DocumentSnapshot) => rank.get(member.id) ?? Infinity;
  const tiles = snapshots.flatMap((snapshot, at) => {
    const tile = snapshot.exists && toTile(snapshot, groups, placeOf);
    return tile ? [{ ...tile, at }] : [];
  });
  let keep = tiles.length;
  if (!final && (wait || keep >= FULL_ROW)) keep -= keep % FULL_ROW;
  return {
    ...toSlice(tiles.slice(0, keep), final),
    used: keep < tiles.length ? tiles[keep].at : ids.length,
  };
}

// The tile holding the photo: its group's cover first when it has one, so a shared link opens the
// viewer on the whole group.
export const loadPhoto = unstable_cache(
  async (id: string) => {
    const [snapshot] = await getAdminDb().getAll(photos().doc(id), { fieldMask: PUBLIC_FIELDS });
    if (!snapshot.exists) return null;
    const groups: Groups = new Map();
    await loadGroups([snapshot], groups);
    return toTile(snapshot, groups, () => 0)?.photo ?? null;
  },
  ["photo", "group", "cover"],
  { revalidate: PHOTOS_REVALIDATE, tags: [PHOTOS_TAG] },
);
