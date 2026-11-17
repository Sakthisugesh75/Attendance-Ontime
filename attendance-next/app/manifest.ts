import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Attendance",
    short_name: "Attendance",
    description: "Punch in and out, see your attendance and apply for leave.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5ecd6",
    theme_color: "#151410",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Punch in / out", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
