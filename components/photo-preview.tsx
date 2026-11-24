import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { countPhotos, loadPhotoPage } from "@/lib/photos/gallery";
import { cn } from "@/lib/utils";

const COUNT = 5;

const LABEL = {
  vi: {
    locale: "vi-VN",
    cta: "Tìm ảnh của bạn",
    photos: "ảnh",
    photo: "Ảnh sự kiện GDG Cloud Hanoi",
  },
  en: {
    locale: "en-US",
    cta: "Find your photos",
    photos: "photos",
    photo: "GDG Cloud Hanoi event photo",
  },
} as const;

// Square cells, like the pinned block of /photos. From `sm`, 7 columns × 2 rows:
//   1 1 1 2 2 3 4
//   1 1 1 2 2 5 CTA
// Phones, 3 columns × 5 rows: 1 1 1 / 1 1 1 / 2 2 3 / 2 2 4 / 5 CTA CTA.
const SPAN = ["col-span-3 row-span-2", "col-span-2 row-span-2"];
const CTA = "col-span-2 sm:col-span-1";

// The first photos of /photos (pinned ones first, in their order); the whole block links there.
export async function PhotoPreview({ lang }: { lang: keyof typeof LABEL }) {
  const [page, total] = await Promise.all([loadPhotoPage(null), countPhotos()]);
  const photos = page.photos.slice(0, COUNT);
  if (photos.length < COUNT) return null;
  const label = LABEL[lang];

  return (
    <Link
      href="/photos"
      className="group block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="@container [--cols:3] [--gap:2px] sm:[--cols:7] sm:[--gap:4px]">
        <div
          className="grid gap-(--gap)"
          style={{
            gridTemplateColumns: "repeat(var(--cols), minmax(0, 1fr))",
            gridAutoRows: "calc((100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols))",
          }}
        >
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className={cn("relative overflow-hidden bg-surface-card", SPAN[i])}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumb}
                alt={label.photo}
                decoding="async"
                draggable={false}
                className="absolute inset-0 size-full object-cover transition-opacity duration-150 group-hover:opacity-90"
              />
            </div>
          ))}
          <div
            className={cn(
              "flex flex-col justify-between bg-brand p-4 text-primary-foreground transition-colors group-hover:bg-brand-hover group-active:bg-brand-active sm:p-3 lg:p-4",
              CTA,
            )}
          >
            <span className="text-sm opacity-90 sm:text-xs lg:text-sm">
              {new Intl.NumberFormat(label.locale).format(total)} {label.photos}
            </span>
            <span className="flex items-end justify-between gap-1 text-lg leading-tight font-bold sm:text-sm md:text-base lg:text-lg">
              {label.cta}
              <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
