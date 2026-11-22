# Architecture

## File map

```
proxy.ts                                  /platform/* without the session cookie → /platform/onboarding?next=<path>
                                          (onboarding and verify are public; short links /s/* live here too)
app/platform/
  layout.tsx                              metadata: title "Platform", robots noindex; renders children only
  page.tsx                                redirect → /platform/users
  nav.ts                                  platformNav: plain items and collapsible groups (sidebar + header titles)
  proof.ts                                shared client/server: SESSION_COOKIE, SESSION_MONTHS, sections (+ Section,
                                          Level, sectionKeys, sectionLevels, sectionSchema, levelSchema,
                                          permissionLabel), emailSchema, proofSchema, publicKeySchema, message(),
                                          formatDate/formatDateTime (Asia/Ho_Chi_Minh), shortId,
                                          toDateTimeInput/fromDateTimeInput (datetime-local values in UTC+7)
  device.ts                               client only: IndexedDB store, generateKeys(), sign(), sessionProof()
  session.ts                              server-only DAL: iamDoc(), devices(), getMasters(), getSession(),
                                          requireSession(next), can(session, section, level), grantedLevel(),
                                          sessionExpiry(), verifySignature(), matchesToken(), findVerification()
  actions.ts                              "use server": register, signIn, resendLink, renew, confirmEmail,
                                          requestAccess(section, level), decideRequest, grantWrite, revokeAccess,
                                          deleteDevice, promoteMaster, changeEmail, signOut (each one audited)
  audit.ts                                server-only: auditActions (stored key → label), AuditEntry, auditLog(),
                                          actorOf(session), audit(batch | tx, entry)
  components/
    site-header.tsx                       SidebarTrigger + <h1> = title of the nav url equal to (else closest parent of) pathname
    access-gate.tsx                       AccessGate (no read: request / pending / rejected card) and
                                          RequestWrite (toolbar button asking for write)
    submit-button.tsx                     submit Button disabled while its form is pending (useFormStatus)
  (auth)/layout.tsx                       shell modeled on shadcn login-03: bg-muted, wordmark, max-w-sm column
  (auth)/onboarding/                      page.tsx sanitizes ?next=; components/onboarding.tsx = client state machine
  (auth)/verify/                          page.tsx looks up the link; components/confirm.tsx confirms on click
  (dashboard)/layout.tsx                  requireSession() → SidebarProvider + AppSidebar + SiteHeader; wraps the content
                                          in PhotoQueue (with the AI face detector) for photos.write
  (dashboard)/users/page.tsx              users table (read: users.read; delete: users.write; revoke: requests.write)
  (dashboard)/users/requests/page.tsx     pending requests (read: requests.read; decide: requests.write)
  (dashboard)/users/data.ts               server-only loaders: loadMembers(), loadRequests()
  (dashboard)/users/components/           identity.tsx (avatar + email + short id), row-actions.tsx (dropdown)
  (dashboard)/audit/page.tsx              audit log, newest first, `?before=<id>` pages (read: audit.read; no write)
  (dashboard)/audit/data.ts               server-only loader: loadAudit(before)
  (dashboard)/check-in/page.tsx           check-in table (read: checkin.read); scanner beside it (checkin.write)
  (dashboard)/check-in/data.ts            server-only loader: loadCheckIns() (whole `checkin` collection, latest first)
  (dashboard)/check-in/actions.ts         "use server": checkIn(ticket) re-verifies the Ed25519 ticket, appends the scan
  (dashboard)/events/page.tsx             events table (read: events.read); "Thêm sự kiện" + row Sửa/Xoá (events.write)
  (dashboard)/events/event.ts             shared client/server: eventIdSchema, eventSchema, EventInfo, fold(), slugify()
  (dashboard)/events/data.ts              server-only: events(), loadEvents() (+ registration counts), loadEvent() (cached),
                                          loadRegistrants(id, masked) (display strings, no `signature`; masked
                                          server-side for non-masters), Registrant
  (dashboard)/events/actions.ts           "use server": createEvent, updateEvent (creates a missing doc), deleteEvent
  (dashboard)/events/components/          event-form.tsx (CreateEvent, EventActions: sheet form + ⋮ menu),
                                          event-name.tsx (name + mono id; also used by the audit page)
  (dashboard)/events/[id]/page.tsx        registrants of one event (read: events.read); back button + name + description
  (dashboard)/events/[id]/components/     registrants.tsx: search, table, detail sheet, CSV export (all client-side)
  (dashboard)/events/[id]/loading.tsx     skeleton while the registrant list loads; not-found.tsx for unknown ids
  (dashboard)/links/page.tsx              short links table (read: links.read); "Thêm link" + row Sửa/Xoá (links.write)
  (dashboard)/links/link.ts               shared client/server: ShortLink, LinkFormState, linkKeySchema (new keys),
                                          existingKeySchema (update/delete), linkSchema (url, name, code, exp)
  (dashboard)/links/data.ts               server-only: shortUrls() (`url` collection), toShortLink(), loadLinks()
  (dashboard)/links/actions.ts            "use server": createLink, updateLink, deleteLink
  (dashboard)/links/components/           link-form.tsx (CreateLink, LinkActions: sheet form + ⋮ menu)
  (dashboard)/photos/upload/page.tsx      upload queue (photos.write); nav group "Ảnh" = Tải lên (library
                                          planned at /platform/photos). Pipeline, data and page recipes: photos.md
  (dashboard)/photos/upload/store.ts      client only: IndexedDB `platform-photos` v2 (tasks, files, outputs = processed
                                          checkpoint, settings = watermark layouts per ratio), survives reloads
  (dashboard)/photos/upload/ratio.ts      readSize() (JPEG header + EXIF orientation, else decode), ratioKey() groups
  (dashboard)/photos/upload/pipeline.ts   processPhoto(): analyze (workers) → checkpoint → prepareUpload → resumable PUTs
                                          (retry + resume) → commitPhoto → free IndexedDB blobs
  (dashboard)/photos/upload/image.ts      shared: WatermarkOptions, drawWatermark, image worker protocol
  (dashboard)/photos/upload/image.worker.ts  EXIF + decode + main (watermark) / thumb + clean bitmap for faces
  (dashboard)/photos/upload/exif.ts       EXIF reader (JPEG, PNG, WebP): IFD0/Exif/GPS/Interop, raw values by tag name
  (dashboard)/photos/upload/actions.ts    "use server": prepareUpload (GCS resumable sessions), commitPhoto (photos + faces +
                                          audit in one batch; no refresh(); revalidateTag("photos", "max"))
  (dashboard)/photos/upload/components/   queue.tsx: PhotoQueue provider (mounted by the dashboard layout) + usePhotoQueue();
                                          uploader.tsx: pick/drop, dedupe, concurrency, pause/resume/retry/remove;
                                          watermark-dialog.tsx: per-ratio watermark editor (ratios | preview | controls)
  (dashboard)/tags/page.tsx               tags table (read: tags.read); "Thêm tag" + row Sửa/Xoá (tags.write), photo counts
  (dashboard)/tags/tag.ts                 shared client/server: TagInfo, TagFormState, tagSlugSchema, tagSchema, MAX_TAGS
  (dashboard)/tags/data.ts                server-only: tags() (`tags` collection), loadTags(), loadTagsWithUsage()
  (dashboard)/tags/actions.ts             "use server": createTag, updateTag, deleteTag (refused while photos carry it)
  (dashboard)/tags/components/            tag-form.tsx (CreateTag, TagActions: sheet form + ⋮ menu), tag-name.tsx
  (dashboard)/photos/upload/components/tag-picker.tsx  toolbar popover: tags applied to the photos picked next
  (dashboard)/ai/page.tsx                 AI settings (read: ai.read; edit: ai.write): face detection model, selfie
                                          search threshold (components/face-detection-form.tsx, face-threshold-form.tsx)
  (dashboard)/ai/data.ts                  server-only: aiDoc() = platform/ai, loadAiConfig() (cached per request)
  (dashboard)/ai/actions.ts               "use server": saveFaceDetector, saveFaceThreshold (both audited as updateAi)
  (dashboard)/analytics/page.tsx          GA4 dashboard (read: analytics.read; no write): `?range=7|28|90`, realtime
                                          users, daily chart, sources / pages / events / Web Vitals tables
  (dashboard)/analytics/data.ts           server-only: loadAnalytics(propertyId, days) via @google-analytics/data (ADC;
                                          env GA4_PROPERTY_ID; the runtime service account needs GA4 Viewer),
                                          trackedEvents (event name → label, keep in sync with lib/firebase/analytics.ts)
  (dashboard)/analytics/components/       daily-chart.tsx (shadcn chart / recharts, metric tabs with totals)
  (dashboard)/check-in/components/        check-in.tsx: camera scanner + status; verifies on the client first
  (dashboard)/settings/                   email change (components/email-form.tsx) + device id; open to all
components/app-sidebar.tsx                sidebar: wordmark, nav, user menu (Tài khoản, Đăng xuất)
app/photos/                               public gallery: [[...slug]]/page.tsx (/photos, /photos/<id>; on-demand ISR),
                                          feed/route.ts, download/[id]/route.ts, actions.ts (findMyPhotos), components/
lib/photos/                               photo.ts (shared constants), storage.ts (server-only photos() / faces() /
                                          downloadUrl()), resize.ts (browser fit / resize), gallery.ts (server-only public
                                          loaders, cached), mosaic.ts (layout). See photos.md
lib/faces/                                config.ts (detectors, threshold), face.ts (worker protocol, createFaceWorker()),
                                          face.worker.ts, search.ts (server-only throttle + findNearest)
lib/pool.ts                               worker pool: lazy start, one job per worker, abort, idle terminate after 60 s
lib/firebase-admin/index.ts               getAdminDb() (Admin SDK, default credentials), getAdminBucket()
                                          (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
lib/mail.ts                               sendMail() over SMTP; logs every message to the `email` collection
lib/shorten.ts                            resolveShortUrl(): `url/{key}` → redirect target for /s/<key> (used by proxy.ts);
                                          recordShortUrlClick(): proxy.ts increments `clicks` in after(), bots skipped
lib/firebase/analytics.ts                 public site GA4 (plain gtag.js + Consent Mode v2: cookieless pings until consent, never on
                                          /platform): track(), trackPageView(), consent store; components/analytics.tsx
                                          mounts it in the root layout (banner hidden on /platform)
```

Route groups `(auth)` and `(dashboard)` only choose the layout. URLs never include them.

## Request flow

1. **`proxy.ts`** sends `/platform/*` requests without the `platform_session` cookie to onboarding. This check is optimistic: it only looks at whether the cookie exists and never hits Firestore.
2. **`(dashboard)/layout.tsx`** calls `requireSession()` and passes `{ email, master }` to the sidebar. For `photos.write` it also reads `platform/ai` and mounts the photo upload queue, which keeps running across client navigations.
3. **The page** calls `requireSession(path)`, then `can(session, section, "read")`, and renders either `AccessGate` or the content. Write-level controls render only when `can(…, "write")`; otherwise the page shows `RequestWrite`.
   - `getSession()` is wrapped in `cache()`, so a render pays at most 2 Firestore reads: the device doc and `platform/iam`, fetched in parallel.
4. **A Server Action** re-checks the session, writes the change and its audit entry in one commit, then calls `refresh()`. Actions that set or delete cookies also re-render the current route. That is how onboarding redirects once `signIn` sets the cookie.

## Next.js 16 rules that matter here

- Middleware is now `proxy.ts` (export `proxy` plus `config.matcher`). Its matcher includes `/platform/:path*`.
- `PageProps<"/route">` and `LayoutProps<"/route">` are global types generated by `pnpm exec next typegen`.
- `cookies()` and `headers()` are async.
  - Cookies can only be set or deleted in Server Actions and Route Handlers, never during render.
  - So an invalid cookie is cleared by `signIn` / `signOut`, not by pages.
- `redirect()` works in pages and actions. `requireSession()` relies on it.
- `refresh()` from `next/cache` works only inside Server Actions.
- Bound Server Actions (`action.bind(null, ...)`) are serializable. They can be passed to client components inside plain objects (see `RowActions`).
- Layouts don't re-render on client navigation, so never rely on a layout alone for authorization.
- `cacheComponents` is off. Pages that read cookies are dynamic automatically.
