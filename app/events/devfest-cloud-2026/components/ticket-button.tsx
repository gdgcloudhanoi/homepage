"use client";

import { Fragment, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { skipToken, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { track } from "@/lib/firebase/analytics";

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
    char.charCodeAt(0),
  );

// Resolves to the ticket's email when its ed25519 signature is valid, else null.
export async function verifyTicket(ticket: string, publicKey: string) {
  try {
    const { email, signature } = JSON.parse(
      new TextDecoder().decode(fromBase64Url(ticket)),
    ) as { email: string; signature: string };
    const key = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(publicKey),
      "Ed25519",
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "Ed25519",
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(email),
    );
    return valid ? email : null;
  } catch {
    return null;
  }
}

export function TicketFace({
  badge,
  children,
}: {
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex-1 overflow-hidden p-5 md:p-6">
      <div aria-hidden className="absolute inset-x-0 top-0 flex h-1.5">
        <span className="flex-1 bg-brand" />
        <span className="flex-1 bg-danger" />
        <span className="flex-1 bg-warning" />
        <span className="flex-1 bg-success" />
      </div>
      <Image
        src="/hero-df26.png"
        alt=""
        width={683}
        height={745}
        className="pointer-events-none absolute -right-6 -bottom-10 w-32 opacity-15 select-none md:w-40"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <Image
            src="/gdgcloudhanoi.png"
            alt="GDG Cloud Hanoi"
            width={3646}
            height={759}
            className="h-5 w-auto"
          />
          <span className="rounded-lg bg-surface-dark px-2 text-caption leading-6 text-on-dark">
            {badge}
          </span>
        </div>
        <p className="mt-5 text-2xl leading-tight font-bold md:text-[28px]">
          DevFest Cloud Hanoi 2026
        </p>
        <p className="mt-1 text-mute">Build, Secure, Scale</p>
        <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          {children}
        </dl>
      </div>
    </div>
  );
}

// Perforation notches: circles in the backdrop colour, centred on the stub's corners.
const notchClass = "absolute size-6 rounded-full bg-surface-dark";

function Ticket({
  ticket,
  email,
  details,
}: {
  ticket: string;
  email: string;
  details: string[][];
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-canvas text-ink md:flex-row">
      <TicketFace badge="Vé tham dự">
        {details.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-mute">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </Fragment>
        ))}
        <dt className="text-mute">Người tham dự</dt>
        <dd className="font-mono text-code break-all">{email}</dd>
      </TicketFace>

      <div className="relative flex flex-col items-center justify-center border-t-2 border-dashed border-hairline p-5 md:w-64 md:border-t-0 md:border-l-2 md:p-6">
        <span
          aria-hidden
          className={`${notchClass} top-0 left-0 -translate-x-1/2 -translate-y-1/2`}
        />
        <span
          aria-hidden
          className={`${notchClass} top-0 right-0 translate-x-1/2 -translate-y-1/2 md:top-auto md:right-auto md:bottom-0 md:left-0 md:-translate-x-1/2 md:translate-y-1/2`}
        />
        {/* Same look as /qr: level Q (tickets exceed its 120-byte H limit), 18% GDG logo. */}
        <QRCodeSVG
          value={ticket}
          size={256}
          level="Q"
          marginSize={2}
          title="Mã QR check-in"
          imageSettings={{ src: "/gdg.png", width: 46, height: 46, excavate: true }}
          className="aspect-square h-auto w-full max-w-60"
        />
        <p className="mt-2 text-center text-caption text-mute">
          Xuất trình mã này khi check-in
        </p>
      </div>
    </div>
  );
}

export function TicketButton({
  publicKey,
  details,
  className,
  children,
}: {
  publicKey: string;
  details: string[][];
  className: string;
  children: React.ReactNode;
}) {
  const ticket = useSearchParams().get("ticket");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: email } = useQuery({
    queryKey: ["ticket", ticket],
    queryFn: ticket ? () => verifyTicket(ticket, publicKey) : skipToken,
  });

  if (!ticket || !email) return children;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          track("ticket_open");
        }}
        className={className}
      >
        Hiển thị vé
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="ticket-title"
        className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent text-on-dark backdrop:bg-surface-dark md:max-w-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="ticket-title" className="font-bold">
            Vé của bạn
          </h2>
          <form method="dialog">
            <button className="rounded-lg px-2 leading-8 text-on-dark-mute outline-none hover:text-on-dark focus-visible:ring-2 focus-visible:ring-brand">
              Đóng
            </button>
          </form>
        </div>
        <Ticket ticket={ticket} email={email} details={details} />
      </dialog>
    </>
  );
}
