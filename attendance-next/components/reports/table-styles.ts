/**
 * Register-style table classes (DESIGN.md §4.2), shared by every HR data table: header on the
 * sunken surface in col-header type, 12×16 cells, hairline rows, sunken hover, brand-subtle
 * selection, numbers right-aligned in tabular figures. Use with components/ui/table.
 */

/** The panel that holds a table (and its toolbar / footer). */
export const tablePanel = "overflow-hidden rounded-xl bg-surface shadow-card";

/** Header row: no hover. */
export const headRow = "border-line bg-sunken hover:bg-sunken";

/** Header cell: 40px, sunken, col-header type in muted ink; sticky inside a scrolling container. */
export const th = "sticky top-0 z-10 h-10 bg-sunken px-4 text-col-header text-ink-3 whitespace-nowrap";

/** Body row: hairline divider, sunken hover, brand-subtle + 2px brand edge when selected. */
export const row =
  "border-line transition-colors duration-[120ms] hover:bg-sunken data-[state=selected]:bg-brand-subtle data-[state=selected]:shadow-[inset_2px_0_0_var(--ad-brand)]";

/** Body cell: 12px vertical / 16px horizontal, body type in secondary ink. */
export const td = "px-4 py-3 text-body text-ink-2";

/** Numbers, times, dates: right-aligned tabular figures. */
export const num = "text-right tabular-nums";

/** The em dash shown for an empty value. */
export const empty = "text-ink-3";

/** Toolbar above a table: search, filters, actions. */
export const toolbar = "flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4";

/** Footer below a table: counts and pagination. */
export const footer = "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-caption text-ink-3";

/** Search box: 240px on desktop, full width on phones. */
export const searchBox = "relative w-full sm:w-60";
