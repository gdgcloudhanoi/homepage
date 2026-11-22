"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, EllipsisIcon, Link2Icon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FacebookIcon, LinkedInIcon, XIcon as XLogo } from "@/components/ui/social";
import { track } from "@/lib/firebase/analytics";
import type { PublicPhoto } from "@/lib/photos/gallery";

const TITLE = "Ảnh sự kiện · GDG Cloud Hanoi";
const item = "justify-start gap-2.5 px-2 font-normal";

const pageUrl = (photo: PublicPhoto) => new URL(`/photos/${photo.id}`, location.origin).toString();

const subscribe = (onChange: () => void) => {
  const query = matchMedia("(pointer: coarse)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

// Phones share through the system sheet (Zalo, Messenger, …).
const useNativeShare = () =>
  useSyncExternalStore(
    subscribe,
    () => matchMedia("(pointer: coarse)").matches && "share" in navigator,
    () => false,
  );

async function nativeShare(photo: PublicPhoto) {
  try {
    await navigator.share({ title: TITLE, url: pageUrl(photo) });
    track("photo_share", { method: "native" });
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error(error);
  }
}

export function ShareButton({
  photo,
  className,
  onOpenChange,
}: {
  photo: PublicPhoto;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const native = useNativeShare();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const label = { "aria-label": "Chia sẻ", title: "Chia sẻ" };
  if (native) {
    return (
      <Button variant="ghost" size="icon-lg" className={className} onClick={() => nativeShare(photo)} {...label}>
        <Share2Icon />
      </Button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl(photo));
      setCopied(true);
      track("photo_share", { method: "copy" });
    } catch (error) {
      console.error(error);
    }
  };

  const intent = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params)}`;
  const targets = [
    { label: "Facebook", Icon: FacebookIcon, href: () => intent("https://www.facebook.com/sharer/sharer.php", { u: pageUrl(photo) }) },
    { label: "LinkedIn", Icon: LinkedInIcon, href: () => intent("https://www.linkedin.com/sharing/share-offsite/", { url: pageUrl(photo) }) },
    { label: "X", Icon: XLogo, href: () => intent("https://x.com/intent/post", { url: pageUrl(photo), text: TITLE }) },
  ];

  return (
    <Popover onOpenChange={(open) => onOpenChange?.(open)}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-lg" className={className} {...label} />}>
        <Share2Icon />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-52 gap-0.5 p-1">
        <Button variant="ghost" size="sm" className={item} onClick={copy}>
          {copied ? <CheckIcon data-icon="inline-start" className="text-success" /> : <Link2Icon data-icon="inline-start" />}
          {copied ? "Đã sao chép" : "Sao chép link"}
        </Button>
        {targets.map(({ label, Icon, href }) => (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            className={item}
            onClick={() => {
              window.open(href(), "_blank", "noopener,noreferrer");
              track("photo_share", { method: label.toLowerCase() });
            }}
          >
            <Icon data-icon="inline-start" aria-hidden />
            {label}
          </Button>
        ))}
        {"share" in navigator && (
          <Button variant="ghost" size="sm" className={item} onClick={() => nativeShare(photo)}>
            <EllipsisIcon data-icon="inline-start" />
            Khác…
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
