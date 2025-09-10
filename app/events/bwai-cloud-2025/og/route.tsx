import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <img
        src={`${process.env.NEXT_PUBLIC_SITE_URL}/bwai-cloud-2025/preview.jpg`}
        style={{
          position: "relative",
          bottom: -160,
          aspectRatio: "auto",
          background: "lightgray",
          borderRadius: 20,
          zIndex: 1,
        }}
      />
    )
  );
}
