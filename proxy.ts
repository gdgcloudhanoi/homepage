import { after, NextResponse, userAgent, type NextRequest } from "next/server";
import { recordShortUrlClick, resolveShortUrl } from "@/lib/shorten";

// The platform (admin) moved to its own app; this proxy only resolves short links.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/s" || pathname === "/s/") {
    console.log("[middleware] redirecting to home.");
    return NextResponse.redirect(new URL("/", request.url));
  }

  const key = pathname.slice("/s/".length);

  try {
    const id = decodeURIComponent(key);
    const target = await resolveShortUrl(id, request.url);

    if (target) {
      // Link previews and crawlers would inflate the count.
      if (!userAgent(request).isBot) {
        after(() =>
          recordShortUrlClick(id).catch((error) =>
            console.error("[middleware] click count failed:", error),
          ),
        );
      }
      console.log(`[middleware] redirecting to ${target.url} with code ${target.code}.`);
      return NextResponse.redirect(target.url, target.code);
    }
  } catch (error) {
    console.error("[middleware] Firestore read failed:", error);
  }

  return NextResponse.redirect(new URL(`/${key}`, request.url));
}

export const config = {
  matcher: ["/s", "/s/:key"],
};
