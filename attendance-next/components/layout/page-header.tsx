import { Illustration, type ArtName } from "@/components/ui/illustration";
import { cn } from "@/lib/utils";

/**
 * Standard page header for every module (DESIGN.md §3.1): small muted eyebrow, title-1 title,
 * one-line description, actions on the right. Use it at the top of each page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rise flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className={cn("text-[22px] leading-7 font-semibold tracking-[-0.01em] sm:text-title-1", eyebrow && "mt-1")}>{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard content panel: hairline border, surface card, optional header row. */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {title && <h3 className="text-title-3">{title}</h3>}
            {description && <p className="mt-0.5 text-caption text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Empty state with an icon, one sentence and an optional action. */
export function EmptyState({
  icon: Icon,
  art,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** A 3D illustration instead of the line icon, for the friendly "nothing to do" moments. */
  art?: ArtName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {art ? (
        <Illustration name={art} size={96} float />
      ) : (
        <span className="grid size-16 place-items-center rounded-full bg-sunken">
          <Icon className="size-7 text-ink-3" />
        </span>
      )}
      <p className="mt-4 text-title-3">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
