# Device-key auth

## Product rules (agreed with the user; keep them)

- **Onboarding.** A stranger who opens `/platform/*` lands on `/platform/onboarding`, which has a single email field. The page states clearly that a session lasts **3 months**.
- **Keys.** The browser generates an Ed25519 key pair and a device id (`crypto.randomUUID()`). The private key is a non-extractable `CryptoKey` in IndexedDB.
- **Email verification.** Registration writes the device as unverified and emails a confirmation link. Confirmation needs a button click on `/platform/verify`, because mail scanners open links. Verification happens once per key pair. Unverified devices and their requests are hidden from the user tables.
- **Masters.**
  - The first email ever confirmed becomes master.
  - Master status is tied to the verified email, not the device.
  - Masters never expire, can open every page, and can promote others.
  - There can be many masters. There is no demote UI; edit `platform/iam.masters` in the console.
- **Permissions.** Each section (`sections` in `proof.ts`) has two levels, **read** and **write**, and write includes read. A section without `write` is read-only.
  - `users`: Xem người dùng (view the table) / Xoá người dùng (delete a device row).
  - `requests`: Xem yêu cầu / Duyệt yêu cầu (approve, reject and revoke).
  - `audit`: Xem nhật ký only. There is no write level, because nobody may change the log.
  - `checkin`: Xem check-in (table of checked-in tickets) / Quét vé check-in (camera scanner at `/platform/check-in`).
  - `events`: Xem sự kiện (events list and each event's registrants, including their personal data) / Sửa sự kiện (create, edit and delete events; an event with registrations can't be deleted).
  - `links`: Xem link rút gọn (short links table) / Sửa link rút gọn (create, edit and delete `/s/<key>` links; the key never changes).
  - `photos`: Xem ảnh / Tải lên ảnh (upload queue and its per-browser watermark dialog).
  - `ai`: Xem AI / Sửa AI (the face detection model used by photo uploads).
- **Requesting.** A device without read sees `AccessGate` with "Yêu cầu quyền xem". Once read is approved, a `RequestWrite` toolbar button asks for write. Write cannot be requested before read.
- **Deciding.** Holders of `requests.write` approve or reject pending requests and revoke on the users table. Revocation steps down one level at a time: write first, then read.
  - **Only masters** approve, grant or revoke `requests.write`, so approval power never spreads without a master.
  - Masters can also answer a pending request with "Cấp quyền {xoá|duyệt}" (`grantWrite`), which approves read and write together.
  - Nobody decides on their own device.
- **Deleting.** `users.write` deletes one device (row), which signs it out at once; its owner must register a new device. Nobody deletes their own device; only masters delete a master's device (master status stays with the email).
- **Settings** is open to every verified device. It shows the email and the device id. Changing the email sends a link to the new address. After confirmation the email switches and approved pages return to pending.
- **After 3 months** (non-masters) the device shows "Phiên đăng nhập đã hết hạn". "Gia hạn phiên" keeps the device id and creates a new key pair signed by the old key. The user confirms the email again and approved pages return to pending.
- **Sign out** ("Đăng xuất") deletes the device doc, the cookie and the local key.
- **Audit log** ("Nhật ký", `/platform/audit`) records every change listed [below](#audit-log). It can only be viewed: nobody edits or deletes entries, masters included.

## Audit log

Each entry stores the action key, the commit time, the actor (device id + email at that moment) and, when relevant, the target device, the permission (`section`, `level`) and the new email. The page lists entries newest first, 50 per page ("Cũ hơn" / "Mới nhất").

| Area | Key: label | Written by |
|---|---|---|
| Onboarding | `register`: Đăng ký, `signIn`: Đăng nhập, `renew`: Gia hạn phiên, `signOut`: Đăng xuất | `register`, `signIn` (only when it sets the cookie), `renew`, `signOut` |
| Email | `resendLink`: Gửi lại link xác nhận, `verifyEmail`: Xác nhận email, `requestEmailChange`: Yêu cầu đổi email, `changeEmail`: Đổi email | `resendLink`, `confirmEmail`, `changeEmail` |
| Requests | `requestAccess`: Yêu cầu quyền, `approveAccess`: Duyệt yêu cầu, `rejectAccess`: Từ chối yêu cầu | `requestAccess`, `decideRequest` |
| Permissions | `grantAccess`: Cấp quyền (read + write), `revokeAccess`: Thu hồi quyền, `bootstrapMaster`: Trở thành master, `promoteMaster`: Nâng làm master, `deleteDevice`: Xoá người dùng | `grantWrite`, `revokeAccess`, `confirmEmail` (first master), `promoteMaster`, `deleteDevice` |
| Check-in | `checkIn`: Check-in (`email` = the ticket's email) | `checkIn` in `(dashboard)/check-in/actions.ts`, one entry per scan |
| Events | `createEvent`: Tạo sự kiện, `updateEvent`: Sửa sự kiện, `deleteEvent`: Xoá sự kiện (`event` = `{ id, name }`) | `createEvent`, `updateEvent` (logs `createEvent` when it creates a missing doc), `deleteEvent` in `(dashboard)/events/actions.ts` |
| Short links | `createLink`: Tạo link rút gọn, `updateLink`: Sửa link rút gọn, `deleteLink`: Xoá link rút gọn (`link` = `{ key, url }`, the destination at that moment) | `createLink`, `updateLink`, `deleteLink` in `(dashboard)/links/actions.ts` |
| Photos | `uploadPhoto`: Tải ảnh lên (`photo` = `{ id, name }`), one entry per photo | `commitPhoto` in `(dashboard)/photos/upload/actions.ts` |
| AI | `updateAi`: Sửa cấu hình AI (`ai` = `{ faceDetector }`) | `saveFaceDetector` in `(dashboard)/ai/actions.ts` |

In email entries the actor carries the old address and `email` the new one.

## Signed messages

`message(purpose, ...fields)` = `["gdgcloudhanoi-platform", purpose, ...fields].join("\n")`, where `iat` is in epoch ms.

| Purpose | Fields | Signed by | Used in |
|---|---|---|---|
| `register` | deviceId, email (normalized), publicKey, iat | new key | `register` |
| `session` | deviceId, iat | device key | `signIn` (becomes the cookie), `resendLink`, `signOut(proof)` |
| `renew` | deviceId, newPublicKey, iat | old (expired) key | `renew` |

- A proof counts as fresh when `|now - iat| <= 5 min`. `signIn` reports clock skew as `status: "error"`.
- Keep the purpose prefix whenever you add a new purpose, so a signature made for one purpose can never be replayed as another.

## Session cookie

- **Name and value:** `platform_session` = `<deviceId>.<iat>.<signature>`, where the signature is over the `session` message.
- **Flags:** HttpOnly, SameSite=Lax, Path=/platform, Secure in production.
- **Lifetime:** expires with the session. Masters get 400 days, the browser maximum. After that, onboarding silently signs in again with the local key.
- **Per-request check in `getSession`:**
  - The device doc exists and is `verified`.
  - The signature is valid for the **current** `publicKey`.
  - The session has not expired.
- **Revocation:** rotating the key (`renew`) or deleting the device revokes every cookie for that device.

## Browser storage

IndexedDB database `platform`, object store `device`, key `current`:
`{ deviceId, email, publicKey, privateKey: CryptoKey, expiresAt: number | null }`.
`expiresAt` is null for masters and is synced from `signIn`.

## signIn states (onboarding client)

| status | Meaning | Client action |
|---|---|---|
| `unknown` | No device, or the key doesn't match | `clearDevice()`, show the email form |
| `unverified` | Waiting for email confirmation | "Kiểm tra email"; re-check on window focus |
| `expired` | Non-master key older than 3 months | "Gia hạn phiên" (renew) |
| `active` | Cookie set | `router.replace(next)` |
| `error` | Clock skew | Error card |

## Lifetimes

| Item | Value | Where |
|---|---|---|
| Session (non-master) | `keyCreatedAt` + 3 months | `sessionExpiry()` |
| Email link | 24 h | `LINK_TTL` |
| Unverified device kept | 7 days (Firestore TTL `deleteAt`) | `UNVERIFIED_TTL` |
| Email cooldown per address | 60 s (Firestore TTL `until`) | `MAIL_COOLDOWN` |
| Proof freshness | 5 min | `PROOF_MAX_AGE` |

## Invariants when changing auth code

- New devices use `create()` (never `set`/merge), so nobody can overwrite another device's key.
- Validate the device id as a UUID before using it in a doc path.
- `renew` requires the old key's signature and an already-expired session.
- Confirm email only through a POST action. Keep `referrer: "no-referrer"` on the verify page, because the token is in the URL.
- Build emailed links from `siteUrl()`: a fixed origin in production, the request Origin only in development.
- `?next=` must stay limited to `/platform/...` and must not point to onboarding or verify (open redirect and redirect loops).
- Bootstrap the first master only when the `masters` field is absent. An emptied array must never re-bootstrap.
- Every decision goes through `authorizeDecision` (requests.write, not self, master for `requests.write`) and `updateGrants` (transaction, verified target, only valid transitions).
- `can()` treats masters as write everywhere. Promotion stays master-only (`promoteMaster`).
- Approvals return to pending on `renew` and on a confirmed email change (`resetApprovals`).
- Master status follows a master's confirmed email change.
- Every change commits together with its audit entry: `audit(batch, entry).commit()` or `audit(tx, entry)` inside the transaction. `signIn` commits its entry before it sets the cookie, and no-op calls return before writing.
- Audit entries are created with auto ids and never updated or deleted. Don't add a TTL, a delete action or a reset for `platform/audit`.
- `accessSchema` checks the level against `sectionLevels(section)`, so write can't be requested, granted or revoked on a read-only section.

## Known limitations (tell the user when relevant)

- Registration is open. There is only a per-address email cooldown, no CAPTCHA and no App Check. Spam registrations also leave `register` entries in the audit log, which is never trimmed.
- Safari ITP may wipe IndexedDB after 7 days without a visit. The cookie still works, but renewal then fails and the user must onboard again with a new device id.
- Verification links, and DevFest tickets, are stored in plain text in the `email` log collection.
