import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { MDXContent } from "mdx/types";

import Header from "@/components/header";
import { Footer, Legal } from "@/components/footer";
import { PhotoPreview } from "@/components/photo-preview";
import {
  FacebookIcon,
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
} from "@/components/ui/social";

const SOCIAL_ICONS = {
  github: GitHubIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  x: XIcon,
};

type PostMeta = {
  title: string;
  description: string;
  author: string;
  // Profile URLs of the author, shown as icons next to the name.
  socials?: Partial<Record<keyof typeof SOCIAL_ICONS, string>>;
  // YYYY-MM-DD
  publishedAt: string;
  lang: Lang;
  // Slug of the same post in the other language.
  translation?: string;
  // Show the latest album photos above the title.
  photos?: boolean;
  // Open Graph image URL (absolute or site path, 1200x630); defaults to /opengraph-image.jpg.
  image?: string;
};

type Lang = "vi" | "en";

const LOCALE = {
  vi: {
    og: "vi_VN",
    date: new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format,
    banner: { text: "Read this article in English", lang: "en" },
  },
  en: {
    og: "en_US",
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format,
    banner: { text: "Đọc bài viết này bằng tiếng Việt", lang: "vi" },
  },
} as const;

async function loadPost(slug: string) {
  // posts/ is bundled, not read from disk at runtime: an unknown slug fails the import.
  const post = await import(`@/posts/${slug}.mdx`).catch(() => notFound());
  return { Post: post.default as MDXContent, meta: post.metadata as PostMeta };
}

// Posts may show the latest photos (PhotoPreview), so like /photos nothing is rendered at build time:
// each post renders on its first request, then is cached and refreshed at most once a minute.
export const revalidate = 60;
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { meta } = await loadPost(slug);
  const url = `/blog/${slug}`;
  const other = LOCALE[meta.lang].banner.lang;
  return {
    title: meta.title,
    description: meta.description,
    authors: [{ name: meta.author }],
    alternates: {
      canonical: url,
      languages: meta.translation
        ? { [meta.lang]: url, [other]: `/blog/${meta.translation}` }
        : undefined,
    },
    openGraph: {
      type: "article",
      siteName: "GDG Cloud Hanoi",
      locale: LOCALE[meta.lang].og,
      url,
      title: meta.title,
      description: meta.description,
      publishedTime: meta.publishedAt,
      authors: [meta.author],
      // Setting openGraph here drops the inherited app/opengraph-image.jpg.
      images: [
        meta.image
          ? { url: meta.image }
          : { url: "/opengraph-image.jpg", width: 1200, height: 630 },
      ],
    },
  };
}

export default async function Page({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const { Post, meta } = await loadPost(slug);
  const locale = LOCALE[meta.lang];

  return (
    <div className="bg-canvas pb-20 text-base text-ink">
      <div className="mx-auto w-full max-w-frame border-hairline lg:border lg:border-t-0">
        <Header />
        {meta.translation && (
          <Link
            href={`/blog/${meta.translation}`}
            hrefLang={locale.banner.lang}
            lang={locale.banner.lang}
            className="group flex items-center justify-center gap-2 border-b border-hairline bg-surface-soft px-6 py-2.5 text-center text-sm text-body transition-colors hover:bg-surface-card lg:px-20"
          >
            <span>{locale.banner.text}</span>
            <ArrowRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
        <main>
          {meta.photos && <PhotoPreview lang={meta.lang} />}
          <article lang={meta.lang} className="px-6 py-12 lg:px-20 lg:py-16">
            <header className="border-b border-hairline pb-8">
              <h1 className="text-[28px] leading-normal font-bold md:text-display">{meta.title}</h1>
              <p className="mt-2 text-body">{meta.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-mute">
                <span>{meta.author}</span>
                {meta.socials && (
                  <ul className="flex items-center gap-2.5">
                    {Object.entries(meta.socials).map(([key, href]) => {
                      const Icon = SOCIAL_ICONS[key as keyof typeof SOCIAL_ICONS];
                      return (
                        Icon &&
                        href && (
                          <li key={key}>
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="transition-colors hover:text-ink"
                            >
                              <Icon className="size-3.5" />
                            </a>
                          </li>
                        )
                      );
                    })}
                  </ul>
                )}
                <span aria-hidden>·</span>
                <time dateTime={meta.publishedAt}>{locale.date(new Date(meta.publishedAt))}</time>
              </div>
            </header>
            <div className="prose mt-8 max-w-none prose-headings:font-bold prose-headings:text-ink prose-p:text-justify prose-p:text-body prose-a:font-normal prose-a:text-brand prose-a:no-underline prose-a:hover:underline prose-strong:text-ink prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-sm prose-pre:bg-surface-dark prose-pre:text-on-dark prose-li:text-body prose-th:text-ink">
              <Post />
            </div>
          </article>
        </main>
        <Footer />
      </div>
      <Legal>GDG Cloud Hanoi</Legal>
    </div>
  );
}
