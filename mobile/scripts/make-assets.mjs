// Draws the source images @capacitor/assets turns into every Android/iOS icon and splash size.
// Same mark as the web icons (app/icons/[file]/route.tsx): a white clock on the ink tile.
// Splash: the ink tile centred on the canvas colour (light) or the ink tile on dark canvas.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const INK = "#151410"; // --ad-brand (light)
const CANVAS = "#F5ECD6"; // --ad-canvas (light)
const CANVAS_DARK = "#15130F"; // --ad-canvas (dark)
const out = (f) => new URL(`../assets/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(out(""), { recursive: true });

const clock = (size, x, y, stroke = "#FFFFFF") =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

// Full-bleed square: stores mask it themselves.
const S = 1024;
const iconOnly = svg(S, S, `<rect width="${S}" height="${S}" fill="${INK}"/>${clock(S * 0.58, S * 0.21, S * 0.21)}`);
// Android adaptive icon: mark inside the 66% safe zone on a transparent layer + flat ink background.
const fg = svg(S, S, clock(S * 0.4, S * 0.3, S * 0.3));
const bg = svg(S, S, `<rect width="${S}" height="${S}" fill="${INK}"/>`);

const P = 2732;
const tile = 360;
const splashBody = (canvas, tileFill, stroke) =>
  `<rect width="${P}" height="${P}" fill="${canvas}"/><rect x="${(P - tile) / 2}" y="${(P - tile) / 2}" width="${tile}" height="${tile}" rx="${tile * 0.22}" fill="${tileFill}"/>${clock(tile * 0.58, (P - tile * 0.58) / 2, (P - tile * 0.58) / 2, stroke)}`;

await Promise.all([
  sharp(iconOnly).png().toFile(out("icon-only.png")),
  sharp(fg).png().toFile(out("icon-foreground.png")),
  sharp(bg).png().toFile(out("icon-background.png")),
  sharp(svg(P, P, splashBody(CANVAS, INK, "#FFFFFF"))).png().toFile(out("splash.png")),
  // Dark: --ad-brand flips to cream, so the tile does too (ink clock).
  sharp(svg(P, P, splashBody(CANVAS_DARK, "#F6F1E6", INK))).png().toFile(out("splash-dark.png")),
]);
console.log("Wrote mobile/assets/*.png");
