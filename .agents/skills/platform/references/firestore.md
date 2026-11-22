# Firestore

The project uses a single database: `(default)`, **Standard** edition, `asia-southeast1`, with PITR enabled. Dev (`pnpm dev:privileged`) and production share it. All access goes through the Admin SDK (`getAdminDb()`), and `firestore.rules` denies every client read and write.

## Platform tree

```
platform/iam                                   { masters: string[] }  (lowercase verified emails)
platform/iam/devices/{deviceId}                one per browser key (deviceId = UUID)
  email: string                                verified email (the registration email until confirmed)
  verified: boolean
  publicKey: string                            raw Ed25519, base64url (43 chars)
  keyCreatedAt: Timestamp                      start of the 3-month session
  createdAt: Timestamp
  verification?: {                             pending link; email ≠ device.email means an email change
    email: string, tokenHash: string, expiresAt: Timestamp }   (sha256 hex of the emailed token)
  access: { [section]: { read?: Grant, write?: Grant } }   Grant = { status: "pending" | "approved" | "rejected",
                                                                   updatedAt: Timestamp, by?: string }
  deleteAt?: Timestamp                         TTL; set while unverified (7 days), removed on confirm
platform/iam/throttle/{sha256(email)}          { until: Timestamp }  (email cooldown; TTL)
platform/ai                                    { faceDetector, faceThreshold, updatedAt }  (missing = SCRFD 10G, 0.35)
platform/photos/throttle/{sha256("face-search:" + client)}   { count, until: Timestamp }  (public selfie search,
                                               20 per 10 min per client IP; TTL; the parent doc doesn't exist).
                                               Unused for now: the call is commented out with a TODO in app/photos/actions.ts
platform/audit/entries/{auto}                  audit log; append-only, no TTL (the parent doc doesn't exist)
  action: string                               key of auditActions in audit.ts; never renamed
  at: Timestamp                                serverTimestamp() of the commit
  actor: { deviceId, email }                   device that acted, with its email at that moment
  target?: { deviceId, email }                 device acted on (decisions, promote, delete)
  section?: string, level?: "read" | "write"   permission involved
  email?: string                               new address of an email change, or the checked-in ticket's email
  event?: { id, name }                         event created, edited or deleted, with its name at that moment
  link?: { key, url }                          short link created, edited or deleted, with its destination then
  photo?: { id, name }                         uploaded photo and its original file name
  tag?: { slug, title }                        tag created, edited or deleted, with its title at that moment
  ai?: { faceDetector } | { faceThreshold }    the AI setting after the change
```

- **Parent doc.** `platform/iam` may not exist while its subcollections do. The absence of the `masters` field is what triggers the first-master bootstrap.
- **Reset.** `firebase firestore:delete platform/iam --recursive` resets IAM. Stale browser keys clean themselves up on the next visit. The audit log sits outside `platform/iam`, so it survives the reset (a new first master shows up as `bootstrapMaster`). Never delete `platform/audit`.
- **Emails** are stored lowercase and trimmed (`emailSchema`).

## Queries in use

| Query | Index |
|---|---|
| `devices().doc(id).get()` + `iamDoc().get()` on every request | none |
| `devices().where("verified", "==", true)` (users page) | automatic single-field |
| `.where("verified", "==", true).where("access.<section>.<level>.status", "==", "pending")`, one per section × level (requests page) | index merging; no composite |
| `auditLog()` with optional `where("action", "==")`, `where("actor.email", "==")` and an `at` day range, `.orderBy("at", "desc").limit(51)` (`asc` from `?after`, reversed), `.startAfter(<snapshot of ?before / ?after>)`, plus `.count()` of the filtered query (audit page) | composites on `entries` (`action` + `at` and `actor.email` + `at`, both directions) in `firestore.indexes.json`, merged when both filters are set; unfiltered and date-only use the automatic single-field index |
| `collection("checkin").select("email", "checkin").get()`, sorted by last scan in memory (check-in page, reloaded after every scan) | none |
| `events().listDocuments()` (includes missing docs that only have subcollections) + `getAll(...)` + `registrations.count()` per event (events page) | none |
| `events/{id}/registrations` `.select(<form fields>)`, sorted by `createdAt` in memory (registrants page; never selects `signature`) | none |
| `registrations.select().limit(1)` inside the `deleteEvent` transaction | none |
| `shortUrls().get()` (whole `url` collection), sorted by key in memory (links page) | none |
| `photos().doc(id).get()` in `prepareUpload`; `create()` of the photo + its faces in `commitPhoto` | none |
| `photos().orderBy("capturedAt", "desc").select(<public fields>, "hidden").limit(49)`, plus `.startAfter(<snapshot of ?after, fieldMask capturedAt>)`; hidden photos are dropped in code and the query repeats until a page is full (public gallery, `lib/photos/gallery.ts`) | automatic single-field. Never filter `hidden` in the query: photos saved before the field existed don't have it |
| `photos().count()` minus `photos().where("hidden", "==", true).count()` (gallery header); `getAll(photos().doc(id), { fieldMask })` (photo page, download, media) | automatic single-field |
| `photos().select(<small fields>).get()` (whole collection, at most every 5 min per instance) + `photos().where("modifiedAt", ">=", <last seen − 60 s>).select(…)` on every load (`/platform/photos/manage` index; filters, sorting and paging run in memory) | automatic single-field |
| `tx.getAll(<photo refs>, { fieldMask: ["name", "capturedAt", "hidden"] })` in the `updatePhotos` transaction | none |
| `faces().where("photo", "==", id)` (a photo's faces) | automatic single-field |
| `faces().where("createdAt", ">=", from).where("createdAt", "<", until).select("photo").findNearest({ vectorField: "embedding", distanceMeasure: "DOT_PRODUCT", distanceThreshold, limit: 1000 })`, one per time window (selfie search, `lib/faces/search.ts`; see [photos.md](./photos.md#face-search-selfie--photos)) | vector index on `faces` (`createdAt` ascending + `embedding` 512, flat) in `firestore.indexes.json`; fails with `FAILED_PRECONDITION` until deployed |
| `faces().orderBy("createdAt").select("createdAt").limit(1)` (oldest face, when a window is full) | automatic single-field |
| `searches().doc(sha256("face-search:" + browser id))` get / set (selfie search results and their pages) | none |
| `photos().count()` + `photos().orderBy("uploadedAt", "desc").select("uploadedAt").limit(1)` (`loadAlbumVersion`, cached 60 s) | automatic single-field |

A new query that combines equality with a range or `orderBy`, or uses `array-contains` plus equality, needs a composite index in `firestore.indexes.json`.

## TTL and exemptions (`firestore.indexes.json` → `fieldOverrides`)

| collectionGroup | field | Setting |
|---|---|---|
| `devices` | `deleteAt` | `ttl: true`, not indexed |
| `devices` | `publicKey` | not indexed |
| `devices` | `verification` | not indexed (subfields inherit) |
| `throttle` | `until` | `ttl: true`, not indexed |
| `photos` | `metadata` | not indexed (raw EXIF) |
| `search` | `expiresAt` | `ttl: true`, not indexed |
| `search` | `photos` | not indexed (every matching photo id) |

`entries` (audit) has no overrides: never add a TTL there, and its fields stay indexed so the log can be filtered later.

- **Scope.** Overrides apply to **every** collection with that id in the database. Pick unique collection ids or TTL field names for new modules.
- **Timing.** TTL deletion usually happens within 24 h after the timestamp, so code must still compare times itself (as `throttle()` and `matchesToken()` do).
- **Deploy.** `firebase deploy --only firestore:indexes` syncs the whole file (the vector index on `faces.embedding` plus the overrides). It asks before deleting indexes that exist in the project but not in the file. Ask before deploying.

## Site data (not owned by the platform)

| Path | Owner / use |
|---|---|
| `events/{eventId}` | `{ name, description, createdAt, updatedAt }`, created, edited and deleted by `/platform/events` (the id is the slug of the public page and never changes). It may be missing while registrations exist; the events page then lists the id as "Chưa đặt tên" and the first save creates the doc |
| `events/{eventId}/registrations/{email}` | Written by the public registration form (e.g. DevFest Cloud 2026: the form fields + `signature` + `createdAt`). The platform only reads them, without `signature`, and refuses to delete an event that has any |
| `checkin/{sha256(email)}` | QR check-in log `{ email, signature, checkin: Timestamp[] }`; each scan appends a time. Written and listed by `/platform/check-in` |
| `email/{auto}` | Log of every email sent by `sendMail` (`to, subject, text, html, messageId, response, sentAt`). Listed by `/platform/email` (masked recipients for non-masters; bodies master-only via `loadEmailBody`, verify tokens redacted). `resendEmail` sends a logged message again to its recipient (throttled, audited; never platform verification emails), which logs a new doc |
| `url/{key}` | Short links resolved by `proxy.ts` (`/s/<key>`, via `resolveShortUrl` in `lib/shorten.ts`): `{ url, code?: 307 \| 308, name?, exp?: Timestamp, clicks?: number }`. `clicks` is incremented by `proxy.ts` per non-bot redirect (browsers cache 308s, so those undercount). `url` is an absolute http(s) URL or a `/path`; a missing or expired link redirects to `/<key>`. Created, edited and deleted by `/platform/links`: new keys match `[\w-]{1,64}`, the key never changes, and edits use `update()` so hand-added fields survive |
| `tags/{slug}` | `{ title, description, createdAt, updatedAt }`, created, edited and deleted by `/platform/tags`. The slug (doc id: lowercase ASCII, digits, `-`; defaults to `slugify(title)`, editable only on create) never changes. Docs reference a tag by slug, e.g. `photos/{id}.tags: string[]`. A tag that any photo carries is never deleted (`where("tags", "array-contains", slug)`, automatic index). Shared helpers: `fold` / `slugify` in `lib/slug.ts` |
| `photos/{uuidv7}` | One doc per uploaded photo, created by `commitPhoto` in `/platform/photos/upload` and shown at `/photos` (public fields only): name, size, `capturedAt` / `uploadedAt` / `modifiedAt`, raw EXIF `metadata`, `files.{original,main,thumb}` (Storage path, type, size; `url` on the copies), `faces` count, `detector`, `uploadedBy`. Fields and Storage layout: [photos.md](./photos.md#data) |
| `faces/{uuid}` | One doc per detected face (own random UUID, not derived from the photo id), created with its photo: `photo`, `box` / `landmarks` (fractions), `score`, `embedding` (Vector 512, `model: "w600k_mbf"`), `detector`, `createdAt`. Never compare embeddings across `model` values |
| `search/{sha256("face-search:" + browser id)}` | Last selfie search of a browser (`photos-client` cookie, random UUID): `{ photos: string[] (newest window first, best match first within one), refinedBy: string[] (face ids), until: ms | null, floor, span, version, searchedAt, expiresAt }`. Written by `findMyPhotos`, read for its pages by `loadMyPhotos`. Never holds an embedding. TTL 1 h. See [photos.md](./photos.md#face-search-selfie--photos) |

Platform features may read and write these through the Admin SDK. Keep their paths, and check the owning code before changing any field.

## Adding a platform module

1. Store module-internal data under `platform/<module>` (doc) with its own subcollections, so it can be reset on its own.
2. Keep docs small and flat. Use maps keyed by stable ids (like `access`) when the read path needs everything in one doc read.
3. Use `runTransaction` for read-modify-write, and `create()` when an id must stay unique. Commit an `audit()` entry with every change, including changes to site data.
4. Timestamps: `Timestamp.now()` / `Timestamp.fromMillis()` (firebase-admin).
5. Add TTL fields and index exemptions for fields you never query to `fieldOverrides`, then ask the user to deploy.
6. Rules stay deny-all. If a public client read is ever needed (for example photos), keep `platform/**` explicitly denied and use the `firestore-rules-creation` skill.
