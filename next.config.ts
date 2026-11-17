import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

export default function config(phase: string): NextConfig {
  return {
    // The project root, so a stray lockfile in a parent folder can't confuse build tracing.
    outputFileTracingRoot: path.join(__dirname),
    // Each kind of server gets its own build folder, so `npm run dev` and the production
    // server (`npm start`) can run side by side without overwriting each other's files.
    // NEXT_DIST_DIR lets the E2E server use a third one.
    distDir: process.env.NEXT_DIST_DIR ?? (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
    // Selfies, employee photos (2 MB) and Excel uploads (10 MB) travel through server actions.
    experimental: { serverActions: { bodySizeLimit: "11mb" } },
  };
}
