import { serveMedia } from "@/lib/photos/media";

export async function GET(request: Request, { params }: RouteContext<"/media/[id]/thumb">) {
  return serveMedia(request, (await params).id, "thumb");
}
