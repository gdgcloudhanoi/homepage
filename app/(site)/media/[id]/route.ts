import { serveMedia } from "@/lib/photos/media";

export async function GET(request: Request, { params }: RouteContext<"/media/[id]">) {
  return serveMedia(request, (await params).id, "main");
}
