# Photos & faces

Photos are uploaded from `/platform/photos/upload`. All heavy work (EXIF, resizing, watermark, face detection, embeddings) runs in the uploader's browser. The server only authorizes, hands out upload sessions, checks the uploaded objects and writes Firestore. Faces and their embeddings are stored now so pages can browse photos by face and search with a selfie later.

Decisions agreed with the user (keep them unless asked):
- Watermarks are **per browser** (IndexedDB), not shared, and **per aspect ratio group** (`ratioKey`: common ratios within 1%, e.g. `3:2` and `2:3` apart). Several logos, drawn in order, only on `main`. Each logo sits in a corner (width % of the shorter edge) or uses "Vừa khung" (`corner: "fill"`): a transparent overlay (e.g. logos bottom-left + bottom-right, or diagonal) scaled to the largest size inside the margin that keeps its ratio, centred (never stretched), so upload one overlay per ratio. A queued photo starts only once its group's layout is confirmed in the watermark dialog; a new group's draft is the last saved layout. Saved layouts survive reloads and clearing the list, and the dialog lists them even with no photos.
- Newly picked photos are `held`: the watermark dialog opens on them (corner Huỷ / Không watermark / Lưu, no other way to close). Lưu saves every changed group and releases them; Huỷ removes them; Không watermark releases them with `noWatermark: true` (they start once their ratio is read, with an empty watermark list, and saved layouts stay untouched). "Áp dụng tất cả tỉ lệ" copies the current group's draft to every group; groups stay editable before saving. "Thêm watermark" and "Áp dụng tất cả tỉ lệ" are icon buttons in the header row. A saved ratio that no unfinished photo uses can be deleted from the left list (immediately, `removeLayouts`).
- The list is sorted running → queued → paused → error → done (newest `doneAt` first).
- Copies: `main` 3840px (long edge) with watermark and `thumb` 640px (short edge) without. The original is stored untouched and stays private.
- Photos are **not linked to an event** yet.
- The upload queue runs in the background on every platform page.
- The face detection model is set in `/platform/ai` (default SCRFD 10G). The embedder is fixed: MobileFaceNet `w600k_mbf`.
- No new npm dependencies without asking. The user declined `exifr`, so EXIF is read by `exif.ts`.
- Public gallery: `/photos` lists every photo, `/photos/<id>` is the same gallery opened on one photo (no albums or event field). Layout: square grid with 2×2 tiles for group shots (`lib/photos/mosaic.ts`).
- Selfie search is public (approved): consent checkbox, the selfie never leaves the browser, threshold in `platform/ai`. One vector search per browser per 30 s (the per-IP throttle is commented out with a TODO); results are stored in `search/*` and paged.

## File map

```
lib/photos/
  photo.ts                shared: VARIANTS, fileKeys, originalTypes / variantTypes, MAX_SIZE, objectPath(),
                          uuidv7(), EMBEDDER, EMBEDDING_DIM, MAX_FACES
  storage.ts              server-only: photos(), faces(), downloadUrl()
  resize.ts               browser: resize() / fit(), used by uploads, the watermark editor and the selfie search
  gallery.ts              server-only: PublicPhoto, PUBLIC_FIELDS, toSlice(), loadPhotoPage(after), countPhotos(),
                          loadPhoto(id) (unstable_cache, tag PHOTOS_TAG = "photos", 60 s)
  media.ts                server-only: serveMedia() streams main / thumb from the GCS JSON API (plain fetch with the
                          Admin SDK's access token; createReadStream logs MaxListenersExceededWarning), immutable caching
  mosaic.ts               pure: mosaic(photos, final, hero) → square grid for both densities (compact < 640px, regular)
lib/faces/
  config.ts               shared: faceDetectors, DEFAULT_FACE_DETECTOR, faceDetectorSchema, SEARCH_DETECTOR,
                          DEFAULT_FACE_THRESHOLD / faceThresholdSchema
  face.ts                 face worker protocol (FaceRequest, DetectedFace, FaceResponse) + createFaceWorker()
  face.worker.ts          detectors (ONNX Runtime Web / MediaPipe) + ArcFace alignment + MobileFaceNet
  search.ts               server-only: loadFaceThreshold() (tag AI_TAG = "ai"), throttleSearch(), findPhotosByFace()
lib/pool.ts               worker pool: lazy start, one job per worker, abort, `discard`, `retire`, idle stop after 60 s
app/platform/(dashboard)/photos/upload/
  page.tsx                upload queue (photos.write); passes the AI face detector to <Uploader>
  store.ts                client only: IndexedDB `platform-photos` v2 (tasks, files, outputs, settings), files picked
                          in this tab (in memory), inspectStorage() / cleanStorage()
  source.ts               client only: pickFiles() / droppedFiles() (File System Access handles, folders dropped
                          recursively), canRead() / requestRead()
  pipeline.ts             processPhoto(): analyze → checkpoint → prepareUpload → resumable PUTs → commitPhoto → cleanup
  ratio.ts                readSize() (JPEG SOF + EXIF orientation, else createImageBitmap), ratioKey(), ratioValue()
  image.ts                shared: WatermarkOptions, drawWatermark(), image worker protocol
  image.worker.ts         EXIF + decode + main / thumb + clean DETECT_SIZE (2048px) bitmap for detection
  exif.ts                 readExif(): JPEG, PNG, WebP → { ifd0, exif, gps, interop }; readThumbnail(): IFD1 JPEG
  actions.ts              "use server": prepareUpload(), commitPhoto() (+ capturedAt() from EXIF)
  components/queue.tsx    PhotoQueue provider (mounted by (dashboard)/layout.tsx for photos.write) + usePhotoQueue()
  components/uploader.tsx list UI (200 rows, then "Hiện thêm"): pick/drop, dedupe, pause / resume / retry / remove,
                          "Cho phép đọc ảnh", "Bộ nhớ" popover (usage, copies, leftovers, "Dọn dữ liệu thừa")
  components/watermark-dialog.tsx  watermark per ratio group: groups | preview + thumbnail strip (±15 around the
                          current photo, from the EXIF thumbnail, else a downscaled decode, 2 at a time) | logo controls
app/platform/(dashboard)/photos/manage/
  photo.ts                shared: Filter (zod, every field `.catch`es to its default), parseFilter() / toSearch()
                          (URL state), Facets, LibraryPhoto, MAX_EDIT = 2000
  data.ts                 server-only: in-memory index of every photo per instance (full read ≤ every 5 min, else a
                          `modifiedAt` delta), matcher / sort, facetsOf() (cameras = Make Model #serial, tags, uploaders)
  page.tsx                filter from the URL, first 96 matches; the rest load in the browser (infinite scroll)
  actions.ts              "use server": loadPhotos(filter, offset, limit) (next pages, reload after a save),
                          selectMatching(filter) (first MAX_EDIT, "Chọn tất cả"), updatePhotos(changes):
                          capturedAt / hidden, transactions of 150 photos + audit, updateTag("photos") + refresh(),
                          deletePhotos(ids): photos + their faces + audit per transaction (≤ 500 writes, ≤ 30 ids for
                          the faces `in` query), then Storage objects, forgetPhotos() on this instance's index
  components/filters.tsx  toolbar controls (32px): search (debounced), status, sort, "Bộ lọc" sheet (capture / upload
                          day ranges, no capture time, cameras, tags, untagged, uploader, faces, groups, orientation),
                          "Một nhóm ✕" while `?group=` is set, "Xoá bộ lọc"
  components/library.tsx  one toolbar (filters | count, selection actions incl. "Nhóm" / "Bỏ nhóm"), group badge on
                          tiles (opens `?group=<id>`), grid with infinite load, selection across
                          filters capped at MAX_EDIT = 2000 (shift = range), "Sửa n ảnh"
  components/photo-editor.tsx  dialog like the watermark editor: preview + strip | per-photo fields, and for a
                          selection "Dời giờ chụp" and "Ẩn / Hiện tất cả"; drafts until "Lưu"
app/platform/(dashboard)/ai/                 face detection model + selfie search threshold (ai.read / ai.write)
lib/firebase-admin/index.ts                  getAdminBucket(): bucket NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
app/photos/
  [[...slug]]/page.tsx    /photos and /photos/<id>: metadata (og:image = main), on-demand ISR (revalidate 60)
  feed/route.ts           GET ?after=<id>: next PhotoPage as JSON, Cache-Control public 60 s
  download/[id]/route.ts  GET: the watermarked main copy as an attachment (serveMedia), immutable
app/media/[id]/route.ts         GET /media/<id>: main copy; thumb/route.ts → /media/<id>/thumb
  actions.ts              "use server": findMyPhotos(embedding) (public, throttled)
  components/             photo-browser.tsx (feed, results, viewer state + URL), mosaic.tsx, viewer.tsx,
                          share-button.tsx, face-search.tsx
```

## Data

### `photos/{id}` (id = UUIDv7, also the file name in Storage)

| Field | Type | Notes |
|---|---|---|
| `name` | string | original file name |
| `hash` | string | SHA-256 (hex) of the original, computed in the uploader's browser. Absent on photos saved before it existed until `/platform/tools/photo-hash` (master only) backfills it from Storage; the backfill leaves `modifiedAt` alone |
| `width`, `height` | number | original size after EXIF orientation |
| `capturedAt` | Timestamp \| null | `exif.DateTimeOriginal` (else `CreateDate`) + `OffsetTimeOriginal` (else `OffsetTime`, else +07:00). `null` when there is no EXIF date (nulls sort first ascending) |
| `uploadedAt` | Timestamp | commit time |
| `modifiedAt` | Timestamp | last change to the doc; equals `uploadedAt` until something edits the photo. Every update sets it |
| `metadata` | map | raw EXIF, see [EXIF](#exif). Not indexed (`fieldOverrides`) |
| `files.original` | `{ path, type, size }` | private, no download token |
| `files.main` | `{ path, type, size, width, height, url }` | ≤3840px, watermark, WebP (JPEG if uploaded from Safari) |
| `files.thumb` | `{ path, type, size, width, height, url }` | ≤640px short edge, no watermark |
| `faces` | number | count of `faces` docs whose `photo` is this id |
| `detector` | string | face detector key (`faceDetectors` in `lib/faces/config.ts`) |
| `tags` | string[] | slugs of `tags/{slug}`, picked in the upload toolbar (`UploadTask.tags`, stored when the photo is added) and filtered to existing tags by `commitPhoto`; max 20. Absent on photos uploaded before tags existed. Never loaded by public pages |
| `uploadedBy` | `{ deviceId, email }` | platform device that uploaded it; never show publicly |
| `hidden` | boolean | toggled on `/platform/photos/manage`; absent (photos saved before it existed) means shown. Public code checks `=== true` and never filters it in a query, because Firestore filters leave out docs without the field |
| `pinned` | number | rank (0-based) at the top of the public gallery, max `MAX_PINNED` = 20; absent = not pinned (unpinning deletes the field). Set only by `savePins` on `/platform/photos/manage`, which rewrites the whole order |
| `group` | string | random UUID shared by similar photos (bursts, near-duplicates), max `MAX_GROUP` = 100 photos; absent = alone. Set only by `groupPhotos` / `ungroupPhotos` on `/platform/photos/manage`. A group left with one photo (the others deleted) counts as no group everywhere. Read a group with `photos().where("group", "in", ids)` (automatic index) |
| `cover` | `true` | the group's cover, shown as its tile; absent otherwise. Set only by `setGroupCover` ("Đặt làm ảnh đại diện" in the editor), which clears any other cover of the group; joining another group or leaving one deletes it. Readers take the first shown cover in feed order, else the newest shot |

`url` is a Firebase download link (`https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>`). It works for anyone who has it, regardless of `storage.rules`, and is allowed by `images.remotePatterns` in `next.config.ts`.

### `faces/{uuid}`

| Field | Type | Notes |
|---|---|---|
| `photo` | string | photo id |
| `box` | `[x, y, w, h]` | fractions (0–1) of the photo size; works on every copy |
| `landmarks` | number[] | `[x1, y1, …]` fractions: 5 points (eyes, nose, mouth corners) for SCRFD/YuNet, 6 for BlazeFace |
| `score` | number | detector confidence |
| `embedding` | Vector(512) | `FieldValue.vector`, L2-normalized |
| `detector`, `model` | string | detector key and embedder (`"w600k_mbf"`) |
| `createdAt` | Timestamp | same as the photo |

- The id is a random UUID (`randomUUID()`), not derived from the photo id. Read a photo's faces with `faces().where("photo", "==", id)` (automatic single-field index).
- Faces are found on a clean 2048px copy (`DETECT_SIZE`) of `main` before the watermark goes on. Faces under 20px there are dropped, and at most 200 are kept.
- Embeddings are only comparable when `model` is the same. Today every face has `w600k_mbf`.

### Storage (`gdg-cloud-hanoi.firebasestorage.app`)

| Path | Content | Access | Cache-Control |
|---|---|---|---|
| `photos/original/{id}.{jpg,png,webp,avif,heic,heif,gif,tif}` | uploaded file, byte for byte (keeps EXIF and GPS) | Admin SDK only | none |
| `photos/main/{id}.{webp,jpg}` | 3840px copy + watermark, no metadata | download token | `public, max-age=31536000, immutable` |
| `photos/thumb/{id}.{webp,jpg}` | 640px (short edge) copy, no metadata | download token | same |

`storage.rules` stays deny-all: the browser writes through resumable sessions created by the server, and reads through token links.

### Browser storage (uploader only)

| Where | Key / store | Content |
|---|---|---|
| IndexedDB `platform-photos` v2 | `tasks` (keyPath `id`) | `UploadTask`: status, `photoId`, `held`, `doneAt`, checkpoints `sessions` / `uploaded` |
| | `files` | until the photo is saved: a `FileSystemFileHandle` where the browser has File System Access (Chromium; task has `handle: true`, nothing copied), else a copy of the `File` (checked against `navigator.storage.estimate()` before adding). After a reload, handles need "Cho phép đọc ảnh" (`requestPermission`); until then those tasks are neither probed nor started |
| | `outputs` | `Processed`: copies, EXIF, faces, detector, until the photo is saved |
| | `settings` → `"layouts"` | `Record<ratio, Watermark[]>` (PNG blob + options); a key = confirmed, last saved last. The older `"watermarks"` list only seeds the first draft |
| localStorage | `platform-photos-concurrency` | 1–6, default 3 |
| Web Lock | `platform-photos-upload` | held by the tab that runs the queue |
| Cache Storage | `platform-face-models` | ONNX / TFLite model files, kept across visits |

### `platform/ai`

`{ faceDetector, faceThreshold, updatedAt }`, read with `loadAiConfig()` (falls back to `DEFAULT_FACE_DETECTOR` = `scrfd-10g` and `DEFAULT_FACE_THRESHOLD` = 0.35). The dashboard layout reads it once per full page load, so open tabs keep the old model until reloaded. The public search reads `faceThreshold` through `loadFaceThreshold()` (cached 60 s per server instance; `saveFaceThreshold` expires it on its own instance with `updateTag`). A stored search keeps the threshold it started with for all its pages.

### `platform/photos/throttle/{sha256("face-search:" + client)}`

`{ count, until }`: fixed 10-minute window per client IP for the public selfie search (20 searches). `until` is the TTL field of the `throttle` collection group. The client is `x-fah-client-ip` on App Hosting (`FIREBASE_CONFIG` is set there; `X-Forwarded-For` can be forged behind its proxies), else the first `X-Forwarded-For` entry.

## Upload pipeline

| Step | Where | What happens |
|---|---|---|
| Queue | `components/queue.tsx` | One tab holds the Web Lock and runs up to `concurrency` tasks. On load, `running` tasks go back to `queued`. Pause aborts the task's `AbortController`; checkpoints written by an aborted run are ignored |
| Ratio | `ratio.ts` (4 at a time) | Each queued or paused task without `ratio` gets its oriented size read and its group stored on the task; unreadable files become errors. Results are applied in one update every 300 ms, so thousands of photos don't re-render the list once each. Tasks wait ("Chờ căn chỉnh") until `layouts[ratio]` exists (or `noWatermark`), then run with that layout |
| Check | `pipeline.ts` → `checkPhoto(id, hash, name, allowName)` | SHA-256 of the original (`crypto.subtle`, checkpointed as `task.hash`), then, before any file is sent: `saved` (this id exists) and `duplicate` (a photo has this `hash`) end the task as done (`duplicate: true` shows "Đã có"); `sameName` (a photo has this `name`) pauses it with `sameName: true` ("Trùng tên") until "Vẫn tải lên" sets `allowName` or the user removes it. Adding files only skips ones already in the list (same name, size and `lastModified`) |
| Image | `image.worker.ts` (up to 2 workers) | `readExif()`; `createImageBitmap` (applies orientation); `main` = fit 3840 (white background when encoding JPEG); `thumb` = `fitShort` 640 from the clean `main` (q 0.82); a clean `main` scaled to `DETECT_SIZE` 2048 goes to face detection; then watermarks are drawn on `main` (q 0.82). WebP, or JPEG where the browser can't encode WebP |
| Faces | `lib/faces/face.worker.ts` (1 worker, replaced after any failed request) | ONNX detectors run on a 640px letterbox (SCRFD score ≥ 0.5, NMS 0.4; YuNet 0.7 / 0.3), MediaPipe BlazeFace at confidence 0.5. Then a similarity transform to the ArcFace 112×112 template and MobileFaceNet → normalized `Float32Array(512)`. ORT sessions are created one at a time: two first sessions on different backends (`wasm` for SCRFD 2.5G/10G, `webgpu` for the rest) break ORT's init for the worker's lifetime |
| Checkpoint | `store.ts` → `outputs` | Saved before any upload, so retries and reloads skip the analysis |
| Prepare | `prepareUpload(photoId, files)` | If `photos/{id}` exists, returns `{ saved: true }` and the task is done. Otherwise creates one GCS resumable session per missing file with the request `Origin` (needed for CORS) and a fixed type and size. The client renews sessions after 6 days (GCS keeps them 7) |
| Upload | `pipeline.ts` → `put()` | PUT of the whole blob. A session from an earlier run is first asked how much it has (`Content-Range: bytes */size`); if the `Range` header isn't readable it resends from 0, and GCS skips the bytes it already has. 3 retries with 1 / 2 / 4 s backoff. A 4xx other than 408/429 means the session is unusable: one new session, then an error |
| Commit | `commitPhoto(photo)` | zod on everything (embeddings arrive as `Float32Array`, 4× smaller than JSON). Reads each object's metadata from Storage: missing files come back as `{ missing }` and are uploaded again on retry. One transaction: if `photos/{id}` exists an earlier attempt succeeded; if a photo with the same `hash` exists (saved meanwhile, e.g. by a concurrent task) the uploaded objects are deleted and `{ duplicate: true }` comes back; otherwise `photos/{id}` + one `faces/{uuid}` per face + the `uploadPhoto` audit entry. No `refresh()`: uploads run while the user is on other pages. `revalidateTag("photos", "max")` marks the gallery's cache stale without re-rendering anything |
| Cleanup | `releaseTask()` | Deletes the task's `files` / `outputs`; the row stays as "Đã tải lên". On load, `cleanStorage()` deletes `files` / `outputs` of tasks that are done or gone; never those of unfinished tasks |

Accepted originals: JPEG, PNG, WebP, AVIF, HEIC/HEIF, GIF, TIFF (by MIME type, else by extension). Chrome can't decode HEIC or TIFF, so those tasks fail with "Trình duyệt không đọc được ảnh này."

## EXIF

`metadata` keeps the tags of four IFDs with their stored values, like `exiftool -n`: no value translation, rationals as decimals, arrays as flat number arrays.

```
metadata: {
  ifd0:    { Make, Model, Orientation, Software, ModifyDate, Artist, Copyright, … }
  exif:    { ExposureTime, FNumber, ISO, DateTimeOriginal, OffsetTimeOriginal, FocalLength, LensModel, … }
  gps:     { GPSLatitudeRef, GPSLatitude: [d, m, s], GPSLongitudeRef, GPSLongitude, GPSAltitude, … }
  interop: { InteropIndex, InteropVersion }
}
```

- Names follow exiftool (`ISO`, `CreateDate`, `ExposureCompensation`, `LensInfo`, `SerialNumber`, …). Tags without a name in `exif.ts` use their hex id, e.g. `"0x9c9b"`.
- Dropped: IFD1 (embedded thumbnail), file offsets, binary values over 64 bytes (MakerNote, PrintIM). UNDEFINED values become text when printable or prefixed with `ASCII` / `UNICODE`.
- Read from JPEG (APP1 within the first 1 MB), PNG (`eXIf`) and WebP (`EXIF`). HEIC/AVIF photos get `metadata: {}`.

Display recipes (the fields of `app/test3/photo-card.tsx`):

| Show | From |
|---|---|
| Camera | `ifd0.Make` + `ifd0.Model` (skip the make when the model already starts with it) |
| Lens | `exif.LensModel` (else `exif.LensMake`) |
| Focal length | `${exif.FocalLength}mm` |
| Aperture | `f/${exif.FNumber}` |
| Shutter | `exif.ExposureTime` = t: `1/round(1/t)` s when t < 1, else `t` s (0.008 → 1/125s) |
| ISO | `ISO ${exif.ISO}` |
| Time | `capturedAt` with `formatDateTime` from `proof.ts` |
| Location (platform only) | `gps.GPSLatitude` = [d, m, s] → d + m/60 + s/3600, negative when `GPSLatitudeRef` is `S`; same for longitude with `W` |

## Building pages on photos and faces

Load the domain from `photos()` / `faces()` in `lib/photos/storage.ts`, or reuse the public loaders and `PUBLIC_FIELDS` of `lib/photos/gallery.ts`. Shared constants live in `lib/photos/photo.ts`, the face worker and its config in `lib/faces/`.

### Platform photo library (`/platform/photos`, planned)

1. **Access.** `photos.read` to browse, `photos.write` ("Quản lý") to upload, change or delete. Labels may change, the `photos` key may not.
2. **Nav.** Add `{ title: "Thư viện", url: "/platform/photos" }` to the "Ảnh" group so the page gets a header title. A detail route `/platform/photos/[id]` needs no nav item.
3. **List loader.** Newest first, cursor pages like the audit page (`?before=<id>`, validated with `z.uuidv7()`), and a field mask so `metadata` never loads:

   ```ts
   let query = photos()
     .orderBy("uploadedAt", "desc")
     .select("name", "width", "height", "capturedAt", "uploadedAt", "modifiedAt", "files.thumb", "faces")
     .limit(PAGE_SIZE + 1);
   if (before) {
     const cursor = await photos().doc(before).get();
     if (cursor.exists) query = query.startAfter(cursor);
   }
   ```

   `orderBy("uploadedAt")` and `orderBy("capturedAt")` use automatic single-field indexes in both directions. Ordering by document id only works ascending without an index: descending needs a composite index on `__name__`.
4. **Images.** Grids use `files.thumb.url`, the viewer and downloads use `files.main.url`, and the original is never linked. Both copies are already resized WebP, so pass `unoptimized` to `next/image` (or use `<img>`) instead of re-encoding them on App Hosting. Give every image its `width` / `height`, and a `bg-muted` placeholder in that aspect ratio.
5. **Faces on a photo.** `faces().where("photo", "==", id).select("box", "score")`, never `embedding`. Overlay a box with percentages over a container in the photo's aspect ratio: `left: x·100%`, `top: y·100%`, `width: w·100%`, `height: h·100%`. Crop a face without storing crops by using `files.main.url` as a background: `background-size: (100 / w)% (100 / h)%` and `background-position: (x / (1 − w) · 100)% (y / (1 − h) · 100)%`, on a box whose aspect ratio is `(w · width) / (h · height)`.
6. **Delete.** Firestore first, then Storage: a failure then leaves unreferenced objects, never a doc whose files are gone.

   ```ts
   // audit.ts: auditActions gains `deletePhoto: "Xoá ảnh"`; it reuses AuditEntry.photo.
   export async function deletePhoto(photoId: string) {
     const session = await requireSession("/platform/photos");
     const id = z.uuidv7().parse(photoId);
     if (!can(session, "photos", "write")) throw new Error("Forbidden");
     const ref = photos().doc(id);
     const paths = await getAdminDb().runTransaction(async (tx) => {
       const photo = await tx.get(ref);
       if (!photo.exists) return [];
       const found = await tx.get(faces().where("photo", "==", id).select());
       tx.delete(ref);
       for (const face of found.docs) tx.delete(face.ref);
       audit(tx, { action: "deletePhoto", actor: actorOf(session), photo: { id, name: photo.get("name") } });
       return Object.values(photo.get("files") as Record<string, { path: string }>).map((f) => f.path);
     });
     await Promise.all(paths.map((path) => getAdminBucket().file(path).delete({ ignoreNotFound: true })));
     refresh();
   }
   ```

   One photo is at most 1 + 200 + 1 writes, under the 500-write limit.

### Public gallery (`app/photos`)

`/photos` and `/photos/<id>` are one route, `app/photos/[[...slug]]/page.tsx`. `/photos/<id>` renders the same gallery with the viewer open on that photo, so a shared link lands on the photo (og:image = its `main` URL) and closing it shows the gallery.

- **Data.** `lib/photos/gallery.ts` reads through the Admin SDK (`firestore.rules` stays deny-all) with `PUBLIC_FIELDS`: `files.{thumb,main}.path` (existence only), `files.main.{width,height}`, `capturedAt`, plus the `faces` count, which only weights the layout and never leaves the server. `PublicPhoto` = `{ id, thumb, main, width, height, capturedAt }` with `thumb` / `main` = `mediaUrl()` (`/media/<id>/thumb`, `/media/<id>`), never Storage paths or token links (`capturedAt` already formatted, vi-VN, Asia/Ho_Chi_Minh). Never `files.original`, `uploadedBy`, `metadata` or anything from `faces/*`.
- **Media proxy** (`lib/photos/media.ts`). `/media/<id>[/thumb]` and `/photos/download/<id>` look up `files.<variant>.{path,type,size}` (cached 1 h) and stream the object with the Admin SDK. `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`, `ETag "<id>-<variant>"` (304 without reading Firestore), `Content-Length`; 404s cached 60 s. App Hosting's Cloud CDN caches them (≤ 10 MiB, no `Set-Cookie`, not matched by `proxy.ts`), so Cloud Run only serves each copy once per CDN cache. Keep `/media` out of the `proxy.ts` matcher and never read cookies/headers there.
- **Order and pages.** Pinned photos (`where("pinned", ">=", 0).orderBy("pinned")`, hidden ones skipped) open the first page and the feed leaves them out, so the first page still holds 48; the mosaic lays them out like any photo (a large tile may shift one within its band). Face search results ignore pins. Then newest shot first by `capturedAt` (desc), 48 per page. Photos with `capturedAt: null` come last (null sorts below timestamps); ties use the implicit document id order, descending like the last `orderBy`, so uuidv7 ids put the latest upload first. A doc without the `capturedAt` field at all would be left out, so every photo write must set it (null when there's no EXIF time). The cursor is the last photo's id; the next page reads that doc's `capturedAt` (field mask) for `startAfter`. A cursor whose photo is gone ends the feed. Photos without a download URL are skipped.
- **Groups.** A group is one tile showing its head: the shown cover, else the newest shot. It is placed where the head would be in the feed; at its first pinned photo when one is pinned (page 1); in face search results at its first match in the stored list (`loadPhotos(ids, final, rank)`). `toTile(snapshot, groups, place)` ranks the group's photos for the list at hand and emits the tile only at the lowest, so every page decides alone, no state crosses pages and edits (capture time, hide, delete, cover) need no bookkeeping. Each page loads the groups of its photos with `in` queries (30 groups each, in parallel); the tile carries `group`: the other shown photos (`PublicPhoto[]`, feed order), so the viewer needs no extra request. `countTiles()` (reads every grouped photo, 2 fields, cached) gives the viewer's total; the heading keeps `countPhotos()`. `loadPhoto(id)` returns the tile holding the photo, so a shared member link opens with its strip; metadata picks the linked photo out of it.
- **Caching.** Every loader is `unstable_cache` with tag `photos` and 60 s (photo / download lookups 1 h). The page is on-demand ISR: `generateStaticParams` returns `[]`, so nothing reads Firestore at build time, and each URL renders on its first request, then is cached with `s-maxage=60`. `GET /photos/feed?after=<id>` returns the next `PhotoPage` with `Cache-Control: public, max-age=60, s-maxage=60`, so the CDN can serve it too. Revalidation is local to each server instance: `commitPhoto`'s `revalidateTag` only reaches the instance that ran it; others catch up within the minute.
- **Layout** (`lib/photos/mosaic.ts`). Square grid: centre-cropped square tiles, 4 columns below Tailwind's `sm` (`compact`), 8 above (`regular`), gap 2px / 4px. Computed per page on the server for both densities: about one photo in 6 becomes a 2×2 tile. Tiles go in bands of two rows; in each band the photos with the most faces (ties by `seedOf(id)`) take the band's large slots (1 per band on phones, up to 2 above, columns cycled from fixed patterns) and the rest fill the free cells in feed order. A page that more photos follow picks a large-tile count that ends on a full row (48 photos → 8 large tiles, 72 cells), so pages stack without holes; only the final page may end with a short row. Face search pages can hold any count (query budget, hidden photos, folded groups), so `loadPhotos` keeps whole rows of `FULL_ROW` (8) tiles on non-final pages and `next` resumes at the first photo left out (an empty page while the search goes on is skipped by `Mosaic`). A first page with pinned photos (and at least 8 photos) opens with a fixed hero block in feed order: photo 1 as a 3×2 tile, photo 2 as 2×2, then 6 small ones (regular: `1 1 1 2 2 3 4 5 / 1 1 1 2 2 6 7 8`; compact: `1 1 1 3 / 1 1 1 4 / 5 6 2 2 / 7 8 2 2`), filling whole rows; the mosaic continues below it. Tiles carry `w` / `h` spans. Each page is its own CSS grid with explicit `grid-column` / `grid-row`, square rows `calc((100cqw − (columns − 1) × gap) / columns)`.
- **Rendering.** `Mosaic` renders both densities during SSR and hydration (CSS shows one), then keeps only the active one (`matchMedia`). Tiles are `<a href="/photos/<id>">` with a plain `<img>` of `thumb` (no next/image: the copies are already resized WebP); the first 8 load eagerly with high priority, the rest lazily. More pages load 1600px before the end and when the viewer gets within 4 photos of it.
- **Viewer.** Opening pushes `/photos/<id>` with `history.pushState` (Next keeps the current tree), paging uses `replaceState`, and closing goes `history.back()` (or `replaceState("/photos")` after a direct landing), so Back closes the viewer and nothing is fetched from the server. `thumb` shows at once under `main`, which fades in; the neighbours' `main` copies are preloaded. ←/→/Esc, swipe on touch, a focus trap, and focus returns to the last tile viewed. Prev / next / swipe / ←→ go through a group's photos, then on to the next tile (backwards onto the previous tile's last photo); the position shows the tile. A group tile adds a strip of its photos under the stage (48px thumbs on phones, 56px from `sm`, centred while it fits, else scrolls on its own with the current one kept centred, safe-area padding). Picking one replaces the URL with its id. Stage and strip share one box of fixed height, and the arrows sit in wrappers of that box (no translate on the button, no press offset), so they never move between photos. Grid tiles of a group show a small count badge (top-right), nothing else, so the mosaic costs the same to render. Scroll lock is an inline `<style>` (`html{overflow:hidden;scrollbar-gutter:stable}`), so it also applies to the server-rendered viewer of `/photos/<id>`.
- **Download / share.** `/photos/download/<id>` streams `main` as an attachment (`gdg-cloud-hanoi-<last 12 hex of id>.webp`) through `serveMedia`; the viewer's download button instead re-encodes `main` to JPEG in the browser (canvas, q 0.92, `.jpg`) and falls back to that route on failure. Share uses the system sheet on touch devices, else a menu (copy link, Facebook, LinkedIn, X). Both send GA4 events (`photo_download`, `photo_share`).

### Face search (selfie → photos)

`components/face-search.tsx` on `/photos`, `findMyPhotos` in `app/photos/actions.ts`, `lib/faces/search.ts`.

1. **Consent.** The button stays disabled until the visitor ticks the consent box (ASCII `[x]` like the registration form). The note says the photo never leaves the device and the face features are not stored. Consent survives clearing results, not reloads.
2. **Query embedding in the browser.** Same pipeline as uploads: `createImageBitmap` (orientation applied), `fit` to ≤2048px (`DETECT_SIZE`) with `resize()`, then the shared face worker (`createFaceWorker()`, `lib/pool.ts`, one worker for the page) with `SEARCH_DETECTOR` = SCRFD 500M (2.5 MB, 5 landmarks like the stored SCRFD faces) and MobileFaceNet `w600k_mbf`. The largest face is searched; with several faces the preview shows boxes to pick another. Opening the file picker starts the model download (~15 MB, cached in Cache Storage) by running the worker on a 1×1 bitmap.
3. **Server** (`findMyPhotos(embedding, same)`). zod (`Float32Array`, 512, finite, non-zero), normalize, then `searchByFace`:
   - The key is a random browser id in the httpOnly cookie `photos-client` (path `/photos`, 30 days), never the IP: visitors on one Wi-Fi share an IP and must never get each other's results.
   - `search/{sha256("face-search:" + id)}` = `{ photos, until, floor, span, version, searchedAt, expiresAt }` (TTL 1 h). Within 30 s of `searchedAt` any search returns the stored result silently. After that, `same` (the browser found the face ≥ 0.8 similar to its last fresh search, kept in memory only) with an unchanged `version` (`loadAlbumVersion()` = photo count + newest `uploadedAt`, plus the threshold) also reuses it. Otherwise a new search replaces the doc. `fresh` tells the browser which happened.
   - `findNearest` returns at most 1000 and has no cursor, so faces are searched in `createdAt` windows, newest first: `faces().where("createdAt", ">=", from).where("createdAt", "<", until).select("photo").findNearest({ …, limit: 1000, distanceMeasure: "DOT_PRODUCT", distanceThreshold })`. The first window is everything; a window that returns 1000 is halved (from the oldest face) and searched again, and `span` doubles after a sparse window. A photo's faces share its `createdAt`, so each photo comes from one window. Each request runs windows until it has a full page of 48, everything is searched (`until: null`, `complete`), or 12 queries ran.
   - Pages come from `loadMyPhotos(search, offset, embedding)`: it continues the windows with the embedding the browser sends again (never stored), then `getAll`s the photos with `PUBLIC_FIELDS`. `search` = `searchedAt` ms, so a replaced search refuses old pages. Until `complete`, counts show `+`.
   - **Refinement.** A fresh search first finds up to 5 stored faces with similarity ≥ 0.5 to the selfie (one per photo, `findNearest` limit 20 over all `createdAt`, reading `embedding` on the server only). The windows then search with `normalize(selfie / 2 + mean(those faces) / 2)`. The doc keeps their face ids in `refinedBy`, and later pages rebuild the same query from them (`getAll` with field mask `embedding`). Constants `REFINE_THRESHOLD` / `REFINE_FACES` in `lib/faces/search.ts`.
   - Errors come back as `{ error }`; only photo ids, URLs and times leave the server, never boxes, similarities or embeddings.
4. **Threshold.** `platform/ai.faceThreshold`, default 0.35, edited (and audited) on `/platform/ai`, read through a 60 s cache. Not measured on real event photos yet: compare same-person and different-person similarities, then tune it there.
5. **Index.** The vector index on `faces` (`createdAt` ascending + `embedding` 512, flat) is in `firestore.indexes.json`; until it is deployed the query fails with `FAILED_PRECONDITION` and the page shows "Không tìm được ảnh". Another pre-filter (e.g. `where("model", "==", EMBEDDER)`) needs its equality fields in the same index. Ask before deploying.
6. **Privacy.** Face embeddings are biometric data (sensitive personal data under Vietnamese law). Keep the consent box and note. The server keeps only, per hashed browser id, the matching photo ids for 1 h; ask before storing or exposing anything else face-related.

## Invariants

1. Only Server Actions write `photos` and `faces`, through the Admin SDK, each change committed with its audit entry.
2. `embedding` is never sent to a client and never selected for display. Responses carry photo references and public URLs only.
3. The original stays private: no download token, no public link. Public pages use `main` (watermarked) for viewing and downloading, `thumb` only in grids.
4. Never compare embeddings across `model` values. Changing the embedder means re-embedding everything or pre-filtering by `model`.
5. Re-detecting faces later should start from the original (via the Admin SDK), because `main` carries the watermark.
6. Ask before running uploads or deletes against the shared bucket and Firestore, and before deploying indexes.

## Audit

| Action key | Label | Written by |
|---|---|---|
| `uploadPhoto` | Tải ảnh lên | `commitPhoto`, one entry per photo (`photo` = `{ id, name }`) |
| `hashPhoto` | Tính hash ảnh | `hashPhotos` (`/platform/tools/photo-hash`), one entry per photo |
| `datePhoto` / `hidePhoto` / `showPhoto` | Sửa ngày chụp / Ẩn ảnh / Hiện ảnh | `updatePhotos` (`/platform/photos/manage`), one entry per photo and kind of change |
| `deletePhoto` | Xoá ảnh | `deletePhotos` (`/platform/photos/manage`: "Xoá" on a selection, or the trash icon in the editor), one entry per photo |
| `pinPhoto` / `unpinPhoto` / `movePin` | Ghim ảnh / Bỏ ghim ảnh / Đổi thứ tự ảnh ghim | `savePins(order, expected)` (`/platform/photos/manage`: "Ghim" / "Bỏ ghim" on a selection, "Ảnh ghim" dialog), one entry per photo; `movePin` only when its place among the photos still pinned changed. Refuses with `{ error }` when the current pins differ from `expected` |
| `groupPhoto` / `ungroupPhoto` | Nhóm ảnh / Bỏ nhóm ảnh | `groupPhotos(ids)` ("Nhóm": the selection plus every other photo of its groups become one group, under the largest existing group's id, else a new UUID) and `ungroupPhotos(ids)` ("Bỏ nhóm": the selection leaves; a group left with one photo is dissolved too). One entry per photo whose `group` changed, with `group` = the id joined or left. One transaction each, ≤ `MAX_GROUP` photos |
| `coverPhoto` | Đặt ảnh đại diện nhóm | `setGroupCover(id)` (photo editor, "Đặt làm ảnh đại diện"), one entry for the new cover with `group`; the previous cover's flag goes in the same transaction |
| `updateAi` | Sửa cấu hình AI | `saveFaceDetector` (`ai` = `{ faceDetector }`) and `saveFaceThreshold` (`ai` = `{ faceThreshold }`) |

## Known limitations

- The queue only runs while a platform tab is open; closing it pauses everything until the next visit.
- ONNX Runtime runs single-threaded (the site isn't cross-origin isolated). Detection at a 640px letterbox misses small faces in large group photos.
- Models load from Hugging Face and MediaPipe's CDN at runtime. The InsightFace models (SCRFD, MobileFaceNet) are licensed for non-commercial research only.
- The photo doc doesn't record which watermark was applied, and different browsers may use different watermarks.
- Every uploaded photo adds an audit entry.
- In production the App Hosting service account needs object create/read (and delete, once deletion exists) on the bucket.
- The public gallery shows every photo whose `hidden` is `false`. Hiding is immediate for pages and `/media` lookups on the instance that saved it (`updateTag`), within a minute elsewhere, but `/media/<id>` copies already in the CDN or a browser stay cached (immutable, one year). Search results count hidden matches in `total`.
- A shared `/photos/<id>` outside the first page opens alone, without prev / next.
- The selfie search threshold is a guess until measured on real event photos.
