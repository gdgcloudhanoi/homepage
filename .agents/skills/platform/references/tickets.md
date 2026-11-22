# Tickets & check-in

The ticket system uses an **Ed25519 key pair** to sign event tickets. The public registration form creates tickets; the platform check-in page verifies and records scans.

## Key pair

| Variable | Format | Used by |
|---|---|---|
| `DEVFEST_TICKET_PRIVATE_KEY` | Unencrypted OpenSSH ed25519 private key (`-----BEGIN OPENSSH PRIVATE KEY-----`) | `ticket.ts` (server-only): `createTicket()` |
| `DEVFEST_TICKET_PUBLIC_KEY` | `ssh-ed25519 AAAA… comment` line (standard `authorized_keys` format) | `ticket.ts` (server-only): `getTicketPublicKey()` → raw 32-byte key as base64url |

The private key is parsed from OpenSSH format by hand (`sshReader`) because `node:crypto` doesn't support that format directly. The seed (first 32 bytes of the 64-byte secret) is converted to JWK `{ kty: "OKP", crv: "Ed25519", d, x }` and cached.

Both variables are required. The module throws at first use if missing or malformed.

## File map

```
app/events/devfest-cloud-2026/
  registration.ts              zod schema, option arrays (roles, genders, levels, topics)
  ticket.ts                    server-only: createTicket(email), getTicketPublicKey()
  actions.ts                   "use server": register(input) — validate, sign, create doc, send email
  components/
    ticket-button.tsx          client: verifyTicket(ticket, publicKey), TicketFace, TicketButton (QR display)

app/platform/(dashboard)/check-in/
  page.tsx                     table (checkin.read) + scanner (checkin.write); passes publicKey to CheckIn
  data.ts                      server-only: loadCheckIns() — whole `checkin` collection, sorted by last scan
  actions.ts                   "use server": checkIn(ticket) — re-verify, append scan, audit
  components/
    check-in.tsx               client: camera scanner + status alerts; calls verifyTicket() then checkIn()
```

## Ticket format

```
ticket = base64url(JSON.stringify({ email, signature }))
```

- `email`: the registrant's email (lowercased, trimmed by `emailSchema`).
- `signature`: `Ed25519(email_bytes)` encoded as base64url.

The ticket is self-contained: decoding it yields both the claim (email) and the proof (signature). Verification only needs the public key.

## Registration flow (`register()`)

1. Parse input with `registrationSchema`.
2. `createTicket(email)` → `{ signature, ticket }`.
3. `ref.create({ ...data, signature, createdAt })` — `create()` fails with `ALREADY_EXISTS` if the email already registered, returning `{ status: "duplicate" }`.
4. Build the confirmation email (both plain text and HTML with inline styles, table layout for Outlook/mso).
5. `sendMail({ to, subject, text, html })` — on failure, roll back by `ref.delete()` so the attendee can retry.
6. Return `{ status: "registered", name, email, role }`.

### Email details

- The email contains a "Xem vé của bạn" CTA linking to `https://gdgcloudhanoi.dev/events/devfest-cloud-2026?ticket=<ticket>`.
- A summary table lists all registration fields.
- Inline styles use `'Google Sans',Roboto,Arial,Helvetica,sans-serif`. Light-only color scheme forced to resist dark mode recoloring.
- Images use `background-image: linear-gradient(#f8f9fa,#f8f9fa)` backing so transparent PNGs survive forced dark backgrounds.
- The `siteUrl` is hard-coded (`https://gdgcloudhanoi.dev`), never read from request headers (prevents Host header injection).

## QR display (public event page)

When `?ticket=<ticket>` is present on the event page:

1. `verifyTicket(ticket, publicKey)` uses `crypto.subtle.verify("Ed25519", ...)` to check the signature.
2. On success, `TicketButton` renders a `QRCodeSVG` with the raw ticket string as data.
3. The attendee shows this QR at the event.

## Check-in flow (platform scanner)

### Client side (`check-in.tsx`)

1. `@yudiel/react-qr-scanner` captures the QR. It only fires for a code different from the previous scan, so holding a QR in view records it once.
   - It sits in a `Camera` wrapper whose unmount cleanup stops the `<video>`'s tracks, now and on a later `loadstart`: the library's own cleanup misses streams that arrive after unmount, which left the camera on after navigating away.
   - "Khởi động lại camera" (floating icon button with tooltip, top-right of the preview) remounts `Camera` (new `key`).
   - After 15 s (`IDLE_MS`) without a scan, counted from the video's `playing` event, `Camera` unmounts and the frame shows "Camera đã dừng"; clicking the frame or the icon restarts it.
2. `verifyTicket(ticket, publicKey)` rejects invalid tickets immediately (fast reject, no server round-trip).
3. On valid ticket: call the `checkIn(ticket)` Server Action.
4. Status states: idle → `pending` → `ok` / `invalid` / `error` (with retry). `ok` is green on the first scan (`firstAt === null`), yellow with the first check-in time on re-scans.

### Server side (`checkIn()`)

1. `requireSession("/platform/check-in")`.
2. Parse the ticket: `ticketSchema` = `z.string().max(1024)` → base64url decode → `JSON.parse` → `z.object({ email: z.string().max(254), signature: z.string().max(128) })`.
3. `can(session, "checkin", "write")` — throws `Forbidden` if not authorized.
4. `verifySignature(getTicketPublicKey(), email, signature)` — re-verify on the server (client can't be trusted).
5. `Timestamp.now()` — captured before the write because `serverTimestamp()` isn't allowed inside `arrayUnion`.
6. Doc ref: `checkin/{sha256(email)}` — hashing the email gives a consistent, collision-resistant doc id.
7. Transaction:
   - `tx.get(ref)` reads the earlier scans; `firstAt` = the earliest, or `null`.
   - `tx.set(ref, { email, signature, checkin: FieldValue.arrayUnion(at) }, { merge: true })` — creates on first scan, appends on every re-scan.
   - `audit(tx, { action: "checkIn", actor: actorOf(session), email })`.
8. `refresh()` re-renders the page so the table shows the new scan immediately.
9. Return `{ status: "ok", email, at, firstAt }`.

## Firestore data

| Path | Schema | Owner |
|---|---|---|
| `events/devfest-cloud-2026/registrations/{email}` | Form fields + `signature` + `createdAt` | Public registration form (`register()`) |
| `checkin/{sha256(email)}` | `{ email, signature, checkin: Timestamp[] }` | Platform check-in (`checkIn()`) |

- The platform reads registrations without `signature` (`loadRegistrants` uses `.select(<form fields>)`).
- The checkin table reads with `.select("email", "checkin")`, sorted by last scan in memory.
- `loadRegistrants` also reads `checkin` (`checkin` only) and fills the "Check-in lúc" column with each ticket's first scan. Registrant `id` = `checkInId(email)` (sha256, also when masked).
- Rows not yet checked in show a "Check-in" button (needs `checkin.write`) → `checkInRegistrant(eventId, id)` in `events/actions.ts`: finds the registration by that hash, re-verifies its stored `signature`, then `recordCheckIn()` from `check-in/record.ts` (shared with the scanner).

## Security invariants

1. **Private key isolation.** `ticket.ts` is `server-only`. The private key is a `KeyObject` — never serialized, never sent to the client.
2. **Public key handoff.** The server page calls `getTicketPublicKey()` and passes the raw 32-byte key (base64url) as a prop to the client `CheckIn` component.
3. **Dual verification.** The client verifies via `crypto.subtle` for fast UX; the server always re-verifies before writing. Never skip the server check.
4. **Unique registration.** `create()` ensures one registration per email. Duplicate attempts return `{ status: "duplicate" }` without overwriting.
5. **Email rollback.** If `sendMail` throws, the registration doc is deleted so the attendee isn't stuck without a ticket.
6. **No signature leaks.** Platform queries (`loadRegistrants`) skip the `signature` field. The `checkin` doc stores it, but `loadCheckIns` only selects `email` and `checkin`.
7. **Hard-coded origin.** Email links use `const siteUrl = "https://gdgcloudhanoi.dev"` — never derived from request headers.

## Audit

| Action key | Label | When |
|---|---|---|
| `checkIn` | Check-in | Each scan (entry includes `email` = ticket's email) |

Registration itself is not audited in the platform audit log — it's a public action outside the platform, logged only as an email in the `email` collection.
