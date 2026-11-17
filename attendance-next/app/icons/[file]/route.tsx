import { ImageResponse } from "next/og";

const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

/** App icons drawn at build time: a clock on the signal-lime brand tile. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const icon = ICONS[(await params).file];
  if (!icon) return new Response("Not found", { status: 404 });
  const { size, maskable } = icon;
  // Maskable icons keep the mark inside the central safe zone (80%).
  const mark = Math.round(size * (maskable ? 0.46 : 0.58));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#151410", // --ad-brand (images can't read CSS variables)
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
