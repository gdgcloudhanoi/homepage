import { z } from "zod";
import { loadPhotoPage, PHOTOS_REVALIDATE } from "@/lib/photos/gallery";

// The gallery's next pages. A GET, so the CDN and the browser can cache them like the page.
export async function GET(request: Request) {
  const after = z.uuidv7().safeParse(new URL(request.url).searchParams.get("after"));
  if (!after.success) return Response.json({ error: "Invalid cursor" }, { status: 400 });
  return Response.json(await loadPhotoPage(after.data), {
    headers: {
      "Cache-Control": `public, max-age=${PHOTOS_REVALIDATE}, s-maxage=${PHOTOS_REVALIDATE}, stale-while-revalidate=600`,
    },
  });
}
