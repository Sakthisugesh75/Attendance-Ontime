import { createCn } from "cn/config";

/**
 * Class merging that knows the design-system type scale (DESIGN.md §3), so `text-caption`
 * is treated as a font size and `text-ink-3` as a colour. Without this, one silently
 * replaced the other when both were passed to cn().
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title-1", "title-2", "title-3", "body", "cell", "label", "caption", "col-header", "clock", "m-title", "m-section", "m-body", "m-meta", "m-caption"] }],
      shadow: [{ shadow: ["card", "brand"] }],
    },
  },
});

/** "Anitha Raman" -> "AR" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
