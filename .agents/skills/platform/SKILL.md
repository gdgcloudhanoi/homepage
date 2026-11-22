---
name: platform
description: 'Build and extend the GDG Cloud Hanoi admin platform at /platform (Next.js 16 App Router, Server Actions, Firebase Admin SDK + Firestore, shadcn base-nova). Use when adding or changing platform pages, sidebar nav, access-gated sections, Server Actions, Firestore data under platform/*, the device-key auth (Ed25519 keys in IndexedDB, session cookie, onboarding, email verification, masters, access requests, 3-month expiry and renewal), the append-only audit log (platform/audit, /platform/audit), events and their registrants (/platform/events), short links (/platform/links, url/{key} served at /s/<key>, click counts), the GA4 dashboard (/platform/analytics), photo uploads (/platform/photos: background queue, watermark, EXIF, face detection and embeddings, resumable uploads to Storage, photos/faces collections), pages that show or search photos and faces (photo library, public gallery, selfie face search with Firestore vector search), AI settings (/platform/ai), or platform UI and copy.'
---

# GDG Cloud Hanoi Platform

Internal admin dashboard at `/platform`. Each browser signs in with its own Ed25519 device key: no passwords, no Firebase Auth. A device confirms its email once per key, then requests **read** and later **write** permission per section. Approvers (`requests.write`) or masters decide. Every change is recorded in an audit log that nobody can edit or delete.

Before coding, read:
- `AGENTS.md`: this Next.js version differs from training data. Check `node_modules/next/dist/docs/` before using an API.
- `DESIGN.md`: tokens and visual rules.
- The reference below that matches the task.

| Topic | Reference |
|---|---|
| File map, request flow, Next.js 16 rules | [architecture.md](./references/architecture.md) |
| Device-key auth, sessions, roles, audit log, product rules, security invariants | [auth.md](./references/auth.md) |
| Firestore tree, queries, TTL, indexes, reset | [firestore.md](./references/firestore.md) |
| Layout, components, tables, forms, copy | [ui.md](./references/ui.md) |
| Ticket creation (registration) and QR check-in | [tickets.md](./references/tickets.md) |
| Photos and faces: upload pipeline, data, EXIF, recipes for photo and face pages | [photos.md](./references/photos.md) |

## Non-negotiables

1. **Re-check auth on the server everywhere.** Every page and Server Action checks the session again with `requireSession` / `getSession` / `can(session, section, level)` from `app/platform/session.ts`. `proxy.ts` only checks that the cookie exists, and layouts don't re-render on client navigation.
2. **Treat Server Actions as public POST endpoints.** Validate every argument with zod, authorize, then touch Firestore. Never trust ids, roles or page keys sent by the client.
3. **Firestore is Admin SDK only.** `firestore.rules` denies all access. Never read platform data with the client SDK (`lib/firebase`).
4. **Private keys never leave the browser.** Keys are non-extractable `CryptoKey`s in IndexedDB. Never add an export path, and never send key material to the server.
5. **Only pass plain fields to client components.** Never pass `Device` docs; they contain `verification.tokenHash`.
6. **UI copy is Vietnamese and minimal.** The user wants short titles and no explanatory paragraphs ("ko cần giải thích nhiều").
7. **Don't change theme tokens in `app/globals.css` unless asked.** The user reverted an earlier sidebar color change.
8. **Ask before touching shared resources.** Dev and prod share the Firebase project `gdg-cloud-hanoi`, including Firestore and SMTP. Ask before running flows against them, deploying, deleting data, or creating throwaway test scripts. The user checks the UI visually.
9. **Audit every change.** A Server Action that changes platform state writes an `audit()` entry in the same batch or transaction as the change. Entries are append-only: never update or delete them, and never add a TTL or a delete action, not even for masters.
10. **Faces are biometric data.** Never send `embedding` values to a client, keep original photos private, and ask before exposing anything face-related on public pages.

## Workflow: add a section page

1. **Decide access.**
   - Open to every verified device: `requireSession(path)` is enough (Settings works this way).
   - Gated: add a section to `sections` in `app/platform/proof.ts`, e.g. `speakers: { title: "Diễn giả", read: "Xem", write: "Sửa" }`.
     - The key becomes the Firestore map `access.<section>.{read,write}` and can never be renamed, or existing grants are orphaned.
     - The labels build "Xem diễn giả" / "Sửa diễn giả" everywhere via `permissionLabel()`.
     - Leave out `write` for a read-only section. `sectionLevels(section)` then returns only `read`, and `accessSchema` refuses write requests, grants and revocations for it.
     - Existing sections: `users` (Xem / Xoá), `requests` (Xem / Duyệt), `audit` (Xem only), `checkin` (Xem / Quét vé), `events` (Xem / Sửa), `links` (Xem / Sửa), `email` (Xem / Gửi lại), `photos` (Xem / Quản lý), `tags` (Xem / Sửa), `analytics` (Xem only) and `ai` (Xem / Sửa).
   - Write includes read. Users request read first, then write.
   - Requests, revocations and the requests page pick new sections up automatically through `sectionKeys` and `sectionLevels`.
2. **Create the route** at `app/platform/(dashboard)/<section>/page.tsx` as a server component. The `(dashboard)` layout already renders the sidebar and a header whose `<h1>` is the nav title. Pages add no heading, description or stat cards.
3. **Set the title:** `export const metadata: Metadata = { title: "<tiêu đề>" }`. The platform layout already sets `noindex`.
4. **Add a nav entry** in `app/platform/nav.ts`:
   - A plain item: `{ title, url, icon }`.
   - A collapsible group: `{ title, icon, items: [{ title, url }] }`.
   - Master-only pages (e.g. "Công cụ" → "Hash ảnh" at `/platform/tools/photo-hash`) go in a group with `master: true`, which the sidebar hides from others; the page and its actions still check `session.master`.
   - `SiteHeader` shows the title of the nav url equal to the pathname, else of the closest parent url. So every list page needs its own nav url, while a detail route such as `/platform/events/[id]` needs none: it shows the parent's title and opens with a back button plus the item's name (see `events/[id]/page.tsx`).
5. **Load data** in a `server-only` module next to the page (see `users/data.ts`). Map Firestore docs to plain objects before rendering.
6. **Mutate** through Server Actions (next workflow), wired in one of two ways:
   - `<form action={action.bind(null, id)}>` with `SubmitButton`.
   - A client component using `useActionState` / `useTransition`. Bound actions can be passed as props (see `RowActions`).
7. **Run `pnpm exec next typegen`** so `PageProps` / `LayoutProps` know the new route, then [verify](#verify).

```tsx
import type { Metadata } from "next";
import { AccessGate, RequestWrite } from "../../components/access-gate";
import { can, requireSession } from "../../session";

export const metadata: Metadata = { title: "Diễn giả" };

export default async function Page() {
  const session = await requireSession("/platform/speakers");
  const grants = session.device.access?.speakers;
  if (!can(session, "speakers", "read")) {
    return <AccessGate section="speakers" status={grants?.read?.status} />;
  }
  const canWrite = can(session, "speakers", "write");
  const rows = await loadSpeakers(); // server-only loader returning plain objects
  return (
    <>
      {!canWrite && (
        <div className="flex justify-end">
          <RequestWrite section="speakers" status={grants?.write?.status} />
        </div>
      )}
      <div className="overflow-hidden rounded-lg border">{/* Table; write actions only if canWrite */}</div>
    </>
  );
}
```

A read-only section renders no `RequestWrite` (see `audit/page.tsx`). With write, the toolbar holds the page's main action instead, e.g. "Thêm sự kiện" opening a sheet form (see `events/components/event-form.tsx`).

## Workflow: add a Server Action

Put the action in `app/platform/actions.ts`, or in a colocated `actions.ts` with `"use server"`. Such files may only export async functions. The order is always:

1. `const session = await requireSession("<page path>")`. It redirects to onboarding when the session is invalid.
2. Parse every argument with zod before it reaches a doc path:
   - `z.uuid()` for device ids.
   - `sectionSchema` / `levelSchema` for permissions.
   - A strict regex for other ids.
3. Authorize:
   - `can(session, section, "write")` for mutations, `"read"` for reads.
   - `session.master` for master-only actions.
   - Refuse actions on `session.deviceId` itself where that matters, as `authorizeDecision` does.
4. Write through `getAdminDb()` and record the change with `audit()` from `app/platform/audit.ts` in the same commit:
   - Plain writes: build a batch and commit it through `audit()`, e.g. `await audit(db.batch().update(ref, data), entry).commit()`.
   - Read-modify-write: use `runTransaction` and call `audit(tx, entry)` next to the writes.
   - `entry` = `{ action, actor: actorOf(session), target?, section?, level?, email? }`. Emails and device ids are copied into the entry, so it stays readable after the device is deleted.
   - Return before writing when nothing changes, so the log holds only real changes.
   - A new kind of change needs a key and a Vietnamese label in `auditActions`. Keys are stored in Firestore, so never rename one. If the change concerns something other than a device, a permission or an email, add an optional field to `AuditEntry` and render it in the "Đối tượng" column of `audit/page.tsx`.
5. Call `refresh()` from `next/cache` so the current route re-renders with fresh data. Background actions (`prepareUpload`, `commitPhoto`) skip it: they run while the user is on other pages.

Return values:
- Return `{ error: "<thông báo>" }` for expected failures that the UI shows.
- Throw for tampering, for example `throw new Error("Forbidden")`.
- Actions passed directly to `<form action>` must return `void`.

```ts
// audit.ts: auditActions gains `archiveSpeaker: "Lưu trữ diễn giả"`; AuditEntry gains `speaker?: { id; name }`.
export async function archiveSpeaker(speakerId: string) {
  const session = await requireSession("/platform/speakers");
  const id = z.string().regex(/^[\w-]{1,64}$/).parse(speakerId);
  if (!can(session, "speakers", "write")) throw new Error("Forbidden");
  const db = getAdminDb();
  const ref = db.doc(`platform/speakers/items/${id}`);
  await db.runTransaction(async (tx) => {
    const speaker = await tx.get(ref);
    if (!speaker.exists || speaker.get("archived")) return;
    tx.update(ref, { archived: true });
    audit(tx, { action: "archiveSpeaker", actor: actorOf(session), speaker: { id, name: speaker.get("name") } });
  });
  refresh();
}
```

Forms that return field errors use `useActionState` with controlled inputs and an `(state, formData)` action returning `{ errors?: { field: message }, saved?: true }` (see `events/actions.ts`).

Emails go through `sendMail` in `lib/mail.ts`:
- Every sent email is logged to the `email` collection, so never put long-lived secrets in an email.
- Rate-limit per address with the `throttle()` helper.
- Build links with `siteUrl()`, which never trusts the Host header in production.

## Workflow: ticket creation and QR check-in

The full lifecycle is: **register → create ticket → email ticket link → attendee shows QR → staff scans → client verifies → server re-verifies → Firestore append**. Details: [tickets.md](./references/tickets.md).

1. **Registration** (`events/devfest-cloud-2026/actions.ts → register()`). Validates input with `registrationSchema`, signs the email with `createTicket()`, writes the doc with `create()` (unique-per-email), then sends the confirmation email with an inline ticket link.
2. **Ticket** = `base64url(JSON.stringify({ email, signature }))`. The `signature` is Ed25519 over the raw email bytes, using the `DEVFEST_TICKET_PRIVATE_KEY` env var (unencrypted OpenSSH ed25519 key). The `signature` field is also stored in the Firestore registration doc.
3. **QR code** is rendered on the public event page when `?ticket=<ticket>` is present, using `qrcode.react`. The ticket is verified client-side before showing (see `verifyTicket()` in `ticket-button.tsx`).
4. **Scanning** (`(dashboard)/check-in/components/check-in.tsx`). The `@yudiel/react-qr-scanner` reads the QR; each unique code fires `submit(ticket)` once. The client calls `verifyTicket()` first (Ed25519 via `crypto.subtle`) to reject garbage before hitting the server.
5. **Server check-in** (`(dashboard)/check-in/actions.ts → checkIn()`). Re-validates the ticket with zod, requires `checkin.write`, re-verifies the Ed25519 signature server-side with `verifySignature(getTicketPublicKey(), email, signature)`, then appends a `Timestamp.now()` to the `checkin` array with `FieldValue.arrayUnion` in a transaction that also reads the first scan (`firstAt`: green on the first scan, yellow with that time on re-scans). An `audit()` entry is written in the same transaction.
6. **Firestore doc** = `checkin/{sha256(email)}`: `{ email, signature, checkin: Timestamp[] }`. Each scan appends; the array length is the scan count. The email is hashed for the doc id so it's consistent across re-scans.
7. **Environment variables**: `DEVFEST_TICKET_PRIVATE_KEY` (OpenSSH ed25519 private key, server-only) and `DEVFEST_TICKET_PUBLIC_KEY` (ssh-ed25519 public key line). The server module (`ticket.ts`) is `server-only`.

### Security invariants for tickets

- The private key is in a `server-only` module and is never exposed to the client.
- The public key is passed as a prop from the server page to the client scanner component.
- Client-side verification is an optimization (fast reject); the server always re-verifies.
- `create()` on the registration doc ensures each email registers once.
- On email send failure, the registration doc is rolled back (`ref.delete()`) so the attendee can retry.
- The `signature` field is never selected in platform read queries (`loadRegistrants` skips it).

## Workflow: photos and faces

Pipeline, data shapes, EXIF and page recipes: [photos.md](./references/photos.md).

- **Upload** (`(dashboard)/photos/upload/`). Heavy work runs in the uploader's browser: `image.worker.ts` reads EXIF and makes `main` (3840px long edge, watermark) and `thumb` (640px short edge), and `lib/faces/face.worker.ts` finds faces with the model from `platform/ai` and embeds them with MobileFaceNet. `prepareUpload` hands out GCS resumable sessions, the browser PUTs the original and both copies, and `commitPhoto` writes `photos/{uuidv7}` (with the `tags` picked in the upload toolbar), `faces/{uuid}` and the `uploadPhoto` audit entry in one batch, then marks the public gallery's cache stale (`revalidateTag("photos", "max")`, no re-render). `PhotoQueue` runs in the dashboard layout, so uploads continue on every platform page; every step is checkpointed in IndexedDB, so pause, retry and reload resume.
- **Watermark**: a dialog on the upload page, per browser and per aspect ratio, in IndexedDB. Photos of a ratio without a confirmed layout wait in the queue. **AI** (`/platform/ai`): the face detection model and the selfie search threshold, in `platform/ai`.
- **Public gallery** (`app/photos/[[...slug]]`): `/photos` and `/photos/<id>` (the same gallery opened on that photo), on-demand ISR. Justified mosaic laid out on the server (`lib/photos/mosaic.ts`), viewer URLs via `history.pushState`, pages from `GET /photos/feed?after=<id>`, downloads from `/photos/download/<id>`, and a selfie search (`findMyPhotos`) with consent, per-IP throttling and the threshold from `platform/ai`.
- **New pages** (e.g. the library at `/platform/photos`):
  1. Gate platform pages with `photos`: read to browse, write to change.
  2. Load through `photos()` / `faces()` from `lib/photos/storage.ts` with a field mask, or reuse the public loaders in `lib/photos/gallery.ts`. List pages never load `metadata`, and nothing loads `embedding` for display.
  3. Show `files.thumb.url` in grids and `files.main.url` in viewers and downloads; never link the original.
  4. Photos carry `capturedAt` (EXIF, or `null`), `uploadedAt` and `modifiedAt`; every update sets `modifiedAt`. Faces have their own random UUIDs: read a photo's faces with `faces().where("photo", "==", id)`. Boxes and landmarks are fractions of the image.
  5. Mutations follow the Server Action workflow. A delete commits Firestore and its audit entry first, then deletes the Storage objects listed in `files.*.path`, then calls `revalidateTag(PHOTOS_TAG, "max")`.
  6. Face search reuses `lib/faces` (same embedder `w600k_mbf`, `findNearest` with `DOT_PRODUCT`). Ask before deploying indexes or exposing anything else face-related.

## Workflow: add Firestore data

- **Platform-internal data** goes under `platform/<module>` (a doc plus subcollections), following `platform/iam`. Resetting a module is then one recursive delete.
- **The audit log** lives in `platform/audit/entries`, outside `platform/iam`, so an IAM reset keeps the history. Never reset or trim it.
- **Site data** (`events/*`, `checkin`, `email`, `url`, `photos`, `faces`) keeps its existing paths. The platform reads and writes it through the Admin SDK. `/platform/events` owns the `events/{id}` docs (name, description) but only reads `registrations`, which the public pages write; it never deletes an event that has registrations. `/platform/links` creates, edits and deletes the `url/{key}` short links that `proxy.ts` resolves. `/platform/tags` owns the `tags/{slug}` docs (title, description); other docs reference a tag by slug (`photos/{id}.tags: string[]`). `/platform/photos/upload` creates `photos` and `faces` docs and their Storage objects.
- **TTL and index exemptions** go in `firestore.indexes.json` under `fieldOverrides`. Overrides apply per collection-group id across the whole database. Deploy with `firebase deploy --only firestore:indexes`, after asking.
- **Query indexes:**
  - Equality-only filters on several fields need no composite index (index merging).
  - Equality plus a range or `orderBy` needs a composite index in `firestore.indexes.json`.
- Details: [firestore.md](./references/firestore.md).

## Verify

```bash
pnpm exec next typegen      # after adding, moving or renaming routes/layouts
pnpm exec tsc --noEmit -p .
pnpm build
```

- `pnpm exec eslint` crashes on a pre-existing ESLint 10 / eslint-plugin-react mismatch. Skip it.
- `pnpm dev:privileged` runs with a service account against the shared Firestore. Ask before using it for anything that writes.
