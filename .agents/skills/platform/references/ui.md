# UI conventions

## Stack

- **shadcn `base-nova` on Base UI primitives.**
  - Use `render={<Link href="…" />}` (not `asChild`) for custom elements.
  - A `Button` that renders a link needs `nativeButton={false}`.
  - `DropdownMenuItem` must sit inside a `DropdownMenuGroup`.
  - Icons inside buttons take `data-icon="inline-start" | "inline-end"` and no size classes.
- **Adding components.** Run `pnpm dlx shadcn@latest add <name>`, then:
  - Rewrite `import { cn } from "cn"` to `import { cn } from "@/lib/utils"`. The project's twMerge knows the custom `text-display/caption/code` classes.
  - Don't install `cn`.
  - If asked to overwrite `separator.tsx`, answer no.
- **Before adapting a block**, inspect it with `pnpm dlx shadcn@latest view @shadcn/<block>`. The layout follows `dashboard-01` (inset shell, tables), `sidebar-07` (collapsible nav) and `login-03` (auth shell).
- **Installed components:** accordion, alert, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, dropdown-menu, empty, field, input, input-otp, kbd, label, pagination, popover, progress, resizable, select, separator, sheet, sidebar, skeleton, slider, spinner, switch, table, tabs (currently unused), textarea, toggle, toggle-group, tooltip.
- **Icons:** `lucide-react`.

## Look

- Tokens come from `DESIGN.md` and `app/globals.css`: Google Sans, Google Blue primary, grey ladder, hairline `#dadce0`, `--radius: 4px`. Use semantic classes only (`bg-muted`, `text-muted-foreground`, `border`), never raw colors.
- No shadows and no gradients. Menus and popups use `ring-1 ring-border`; the shell is flat, separated by hairlines.
- The shared `components/ui/*` primitives are restyled to DESIGN.md, and the event page and `/qr` use them too. Don't restyle per page:
  - Text is 16px (`text-base`). Secondary lines are at least 14px (`text-sm`/`text-caption`), never `text-xs`.
  - `Button`: 36px (`sm` 32px), brand hover/active, `surface-card` fill and `ash` text when disabled, `link` is ink and underlined.
  - `Input`, `Select`, `Textarea`: 40px, `bg-muted`, hairline border, `border-ring` and `bg-background` on focus, `border-destructive` when invalid.
  - Focus on buttons and sidebar items is a solid `ring-2 ring-ring` (offset 2 on buttons), never a translucent halo.
  - `Badge` is a 4px chip. `default` is the dark chip (Master); `outline` for roles and permissions.
  - `Card` is a sharp hairline block with a bold 16px title. `FieldError` prefixes `[!]` like the registration form. Toggles use `+` / `−`.
- The primary (blue) button is reserved for the main action of a form or page. Row actions use `outline` or `ghost`, so tables don't fill with blue.
- Light mode only; there is no theme toggle.

## Dashboard shell (`(dashboard)/layout.tsx`)

- `SidebarProvider` (`--header-height` 56px) → `AppSidebar` (default flat variant, right hairline) → `SidebarInset` → `SiteHeader` + content column `@container/main flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6`.
- **Header.** `SiteHeader` is sticky, 56px, with a hairline. It renders the nav title as the page's only `<h1>` (bold). Pages start directly with content: no heading, description, overview stats or card title wrappers.
- **Detail pages** (`/platform/events/[id]`): the header shows the parent's title. The page opens with a ghost icon back button (`ArrowLeftIcon`, `aria-label`) next to the item's name as `<h2 className="leading-7 font-bold">` and its description in `text-sm text-muted-foreground`. Unknown ids call `notFound()` and the segment's `not-found.tsx` renders an `AccessGate`-style card with a way back. Heavy pages get a `loading.tsx` skeleton in the page's shape.
- **Sidebar** (`components/app-sidebar.tsx`):
  - `collapsible="offcanvas"`.
  - Header: as tall as the page header, with a bottom hairline, holding the wordmark `/gdgcloudhanoi.png` at `h-6`.
  - Groups: `Collapsible` rendered as `SidebarMenuItem`, a `+` / `−` text toggle (`group-data-open/collapsible`), and `SidebarMenuSub` items. A group opens by default when one of its urls is active.
  - Active state: sub-items need an exact url match; plain items match by prefix.
  - Footer: a top hairline and the user menu showing email and role, "Tài khoản" (links to Settings) and "Đăng xuất".

## Patterns

**Table page**

```tsx
<div className="overflow-hidden rounded-lg border">
  <Table>
    <TableHeader className="bg-muted">
      <TableRow>
        <TableHead>Người dùng</TableHead>
        <TableHead className="w-12"><span className="sr-only">Thao tác</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
            Không có dữ liệu.
          </TableCell>
        </TableRow>
      ) : (
        rows.map(/* … */)
      )}
    </TableBody>
  </Table>
</div>
```

- **Person cells:** `Identity` (avatar initials, email, `shortId(deviceId)` in mono).
- **Status:** `Badge` variants:
  - `default` (dark chip) for Master.
  - `outline` for roles and permissions.
  - `destructive` for "Đã hết hạn".
- **Row actions:**
  - One or two primary actions: inline `<form action={action.bind(…)}><SubmitButton size="sm" variant="outline">`.
  - More actions, or destructive ones: `RowActions` (a ghost ⋮ dropdown that runs a bound action after `window.confirm`).
  - An action that opens a form (e.g. "Sửa" on events): a controlled `Sheet` next to the dropdown, opened from the item's `onClick`, with `finalFocus` on the ⋮ trigger (see `EventActions`). Disable an item the server would refuse ("Xoá" on an event with registrants).
- **Clickable rows** (events, registrants): `TableRow className="relative"` and, in the first cell, a `Link` (navigation) or `button` (opens a sheet) with `outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset`. Other controls in the row need `relative z-10`.
- **Search** (registrants): filter in the client when the page already holds the whole list. A toolbar `flex flex-wrap items-center gap-2` holds an `Input type="search"` with a `SearchIcon` at `left-2.5` (`pl-8`, `sm:max-w-xs`), the count (`12/384 người đăng ký`, `aria-live`) and outline buttons pushed right with `ml-auto`. Match with `fold()` from `events/event.ts` (no diacritics, đ → d) and `useDeferredValue`.
- **CSV export:** built in the browser from the rows on screen: UTF-8 BOM, CRLF, every cell quoted, and a leading `'` on cells starting with `= + - @` tab or CR (formula injection). Only export data the page already shows.
- **Details sheet:** `SheetContent className="data-[side=right]:sm:max-w-md"`, `SheetHeader className="pr-12"` (clears the close button), then a `<dl>` of label/value pairs in form order; empty values show a muted "—". Keep the selected row in state after closing so the exit animation keeps its content.
- **Dates in client components:** format on the server (`formatDateTime`) and pass strings, so Node and browser ICU can't disagree during hydration.
- **Long lists** (audit page): cursor pages via `?before=<last id>` (older) and `?after=<first id>` (newer), validated with a strict regex. Filters live in the URL (`action`, `by` = actor email, `from`/`to` days) and every link keeps them (`auditHref` in `audit/filter.ts`); the toolbar holds an action `Select`, an email search submitted on Enter, two date inputs, a ghost "Xoá lọc" and the count. Below the table, a `flex justify-end gap-2` row holds outline `sm` link buttons "Mới nhất", "Mới hơn" and "Cũ hơn". The audit table's columns are Thời gian / Người thực hiện / Hành động (label + permission badge) / Đối tượng (target `Identity`, `EventName`, short link `/s/<key>` + destination, new email or "—").

**Form**

- Build forms from `Field`, `FieldLabel`, `FieldDescription` and `FieldError`. Put `data-invalid` on `Field` and `aria-invalid` on the control.
- Put an input next to its button with `flex items-center gap-2` (see `settings/components/email-form.tsx`).
- Disable submit until the value changes. Use `useActionState` when the server returns `{ error }`.
- Create/edit forms live in a right `Sheet` (`SheetHeader` title, `FieldGroup className="overflow-y-auto px-4"`, `SheetFooter` with the primary submit and an outline "Huỷ" `SheetClose`). Inputs are controlled, so a returned error keeps what was typed, and the form is a child of `SheetContent`, so it resets on every open. Field errors come back as `{ errors: { field: message } }`.
- Ids derived from a name (event slugs) follow the name through `slugify()` until edited by hand, and are disabled when editing.
- Date-times use `<Input type="datetime-local">` read and written in Vietnam time with `toDateTimeInput` / `fromDateTimeInput` from `proof.ts` (plain UTC+7 math, no ICU), plus a ghost X button to clear an optional value (see `links/components/link-form.tsx`).
- Never show secrets. Show the device id, never the keys.

**Gated page:** without read, return `<AccessGate section=… status={grants?.read?.status} />`. It is a centered card (`m-auto max-w-sm`) with a short title, one line of text and the request button. With read but no write, put `<RequestWrite section=… status={grants?.write?.status} />` in a `flex justify-end` toolbar above the table, and render write actions only when `can(…, "write")`. Read-only sections such as `audit` have no toolbar.

**Permission badges:** use `permissionLabel(section, level)` ("Xoá người dùng") for requests, and `"{title}: {level label}"` ("Người dùng: Xoá") for the highest granted level on the users table.

**Auth pages (`(auth)` shell):** white page, left-aligned wordmark (`h-8`) above a hairline card with a plain `CardHeader` / `CardTitle` (left-aligned, no size override). Put any note under the card with a plain `FieldDescription`. `AccessGate` and `not-found.tsx` cards are left-aligned too.

**Single setting** (`/platform/ai`): one `Field` (label + `Select`) with the primary "Lưu" inline (`flex items-center gap-2` in `w-full max-w-lg`, like Settings), disabled until the value changes. Without write the control is disabled and there is no button.

**Background queue** (`/platform/photos/upload`): a toolbar with the progress line (`aria-live`) on the left and, on the right, the concurrency `Select`, outline bulk actions (Tạm dừng tất cả, Tiếp tục tất cả, Thử lại lỗi, Xoá đã xong) and the primary "Chọn ảnh". Files drop anywhere on the page; an empty list is an `Empty` drop zone. Rows show a status `Badge` (Đang chờ `secondary`, Đang tải lên `default` + spinner, Tạm dừng `outline`, Lỗi `destructive` with the message under the name, Đã tải lên `outline` + check) and ghost icon buttons. The user wants no per-step progress: work runs in the background.

**Editor dialog** (watermark, from the upload toolbar): a near-fullscreen `Dialog` (`h-[calc(100dvh-1rem)] w-[calc(100%-1rem)]`, `dvh` so it follows the mobile address bar) with `lg:grid-cols-[11rem_minmax(0,1fr)_20rem]`, each column scrolling on its own. Left: aspect ratio groups (ratio icon, count, `Chờ` badge or check). Middle: the preview canvas (`bg-muted`, hairline), prev / next with `n/total · name`, and a horizontal thumbnail strip (←/→ work there). Right: expandable items (`+` / `−`) holding a corner `ToggleGroup` and `Slider`s, then "Xác nhận" (unconfirmed group, always enabled) or "Lưu" (disabled until something changes), and "Huỷ" (outline). Confirming jumps to the next unconfirmed group.

**Photos and faces:** thumbnails, viewers, face boxes and crops follow the recipes in [photos.md](./photos.md#building-pages-on-photos-and-faces).

## Copy

- Vietnamese, short and direct: titles like "Người dùng", "Yêu cầu", "Sự kiện", "Cài đặt". Button labels are verbs: "Duyệt", "Từ chối", "Cập nhật", "Gửi lại email", "Thêm sự kiện", "Xuất CSV".
- No explanatory paragraphs. One short line of feedback at most, e.g. "Đã gửi link xác nhận tới …".
- Dates: `formatDate` / `formatDateTime` from `proof.ts` (vi-VN, Asia/Ho_Chi_Minh). Device ids: `shortId`.
- Confirmation copy for irreversible actions names the target, e.g. "Nâng a@b.com làm master? …".
