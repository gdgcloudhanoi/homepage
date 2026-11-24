import { serveMedia } from "@/lib/photos/media";

// The watermarked copy as an attachment, never the original.
export async function GET(request: Request, { params }: RouteContext<"/photos/download/[id]">) {
  return serveMedia(request, (await params).id, "main", true);
}
