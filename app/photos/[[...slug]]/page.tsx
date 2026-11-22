import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Footer, Legal } from "@/components/footer";
import Header from "@/components/header";
import {
  countPhotos,
  countTiles,
  loadPhoto,
  loadPhotoPage,
} from "@/lib/photos/gallery";
import { PhotoBrowser } from "../components/photo-browser";

// /photos and /photos/<id> (the same gallery, opened on that photo). Nothing is rendered at
// build time; each URL renders on its first request, then is cached and refreshed at most once
// a minute, so the HTML can be served from the CDN.
export const revalidate = 60;
export const generateStaticParams = async () => [];

const title = "Ảnh sự kiện";
const org = "GDG Cloud Hanoi";
const events = [
  "DevFest Cloud Hanoi",
  "Build with AI Cloud Hanoi",
  "Google Cloud Next Extended Cloud Hanoi",
  "Google I/O Extended Cloud Hanoi",
];
const description = `Khoảnh khắc tại ${events.join(", ")} và nhiều sự kiện khác cùng ${org}.`;
const site = {
  type: "website",
  siteName: "GDG Cloud Hanoi",
  locale: "vi_VN",
} as const;

async function photoOf(slug: string[] | undefined) {
  if (!slug) return null;
  const id = slug.length === 1 ? z.uuidv7().safeParse(slug[0]) : null;
  if (!id?.success) notFound();
  return (await loadPhoto(id.data)) ?? notFound();
}

export async function generateMetadata({
  params,
}: PageProps<"/photos/[[...slug]]">): Promise<Metadata> {
  const tile = await photoOf((await params).slug);
  if (!tile) {
    return {
      title,
      description,
      alternates: { canonical: "/photos" },
      // Setting openGraph drops the inherited app/opengraph-image.jpg.
      openGraph: {
        ...site,
        url: "/photos",
        title,
        description,
        images: [
          {
            url: "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/df26%2Fopengraph-image.jpg?alt=media&token=fb88530e-7853-4dde-95cd-a448380498b9",
            width: 1200,
            height: 630,
          },
        ],
      },
    };
  }
  // The tile is its group's cover; the link may point at another photo of the group.
  const id = (await params).slug![0];
  const photo = tile.group?.find((member) => member.id === id) ?? tile;
  const photoTitle = photo.capturedAt
    ? `Ảnh ${photo.capturedAt}`
    : "Ảnh sự kiện";
  const photoDescription = `Ảnh sự kiện của GDG Cloud Hanoi${photo.capturedAt ? `, chụp lúc ${photo.capturedAt}` : ""}.`;
  return {
    title: photoTitle,
    description: photoDescription,
    alternates: { canonical: `/photos/${photo.id}` },
    openGraph: {
      ...site,
      url: `/photos/${photo.id}`,
      title: photoTitle,
      description: photoDescription,
      images: [{ url: photo.main, width: photo.width, height: photo.height }],
    },
  };
}

export default async function Page({
  params,
}: PageProps<"/photos/[[...slug]]">) {
  const photo = await photoOf((await params).slug);
  const [page, total, tiles] = await Promise.all([
    loadPhotoPage(null),
    countPhotos(),
    countTiles(),
  ]);

  return (
    <div className="bg-canvas pb-20 text-base text-ink">
      <div className="mx-auto w-full max-w-frame border-hairline lg:border lg:border-t-0">
        <Header />
        <Link
          href="/blog/xay-dung-ung-dung-tim-kiem-anh-chup-bang-khuon-mat-voi-mediapip-va-firebase"
          className="group flex items-center justify-center gap-2 border-b border-hairline bg-surface-soft px-6 py-2.5 text-center text-sm text-body transition-colors hover:bg-surface-card lg:px-20"
        >
          <span>
            Xây dựng ứng dụng tìm kiếm ảnh chụp bằng khuôn mặt với Mediapipe và
            Firebase
          </span>
          <ArrowRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
        </Link>
        <main>
          <PhotoBrowser
            initial={page}
            total={tiles}
            photo={photo}
            intro={
              <div>
                <h1 className="text-[28px] leading-normal font-bold md:text-display">
                  {title}{" "}
                  <span className="font-normal text-mute">
                    [{new Intl.NumberFormat("vi-VN").format(total)}]
                  </span>
                </h1>
                <p className="mt-2 max-w-xl text-body">
                  Khoảnh khắc tại{" "}
                  {events.map((event, i) => (
                    <span key={event}>
                      {i > 0 && ", "}
                      <strong>{event}</strong>
                    </span>
                  ))}{" "}
                  và nhiều sự kiện khác cùng <strong>{org}</strong>.
                </p>
              </div>
            }
          />
        </main>
        <Footer />
      </div>
      <Legal>GDG Cloud Hanoi</Legal>
    </div>
  );
}
