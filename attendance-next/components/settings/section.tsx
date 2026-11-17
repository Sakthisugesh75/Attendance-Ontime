import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One settings group: a description column on the left (stacked on phones) and the form card on the right.
 */
export function SettingsSection({
  title,
  description,
  children,
  aside,
  className,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  /** Extra content under the description (tips, status) */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid max-w-[720px] gap-3 border-b border-line pb-8 last:border-b-0 last:pb-0", className)}>
      <div className="min-w-0">
        <h3 className="text-title-3 text-ink">{title}</h3>
        <div className="mt-0.5 text-body text-ink-2">{description}</div>
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Form card body used inside a section. */
export function SettingsCard({ children, className, footer }: { children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card">
      <div className={cn("space-y-5 p-4 sm:p-6", className)}>{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken px-4 py-3 sm:px-6">{footer}</div>}
    </div>
  );
}

/** Field error line. */
export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="flex items-center gap-1 text-caption text-danger">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {message}
    </p>
  ) : null;
}

/** Number input with a unit suffix, label, hint and error. */
export function NumberField({
  id,
  label,
  suffix,
  hint,
  error,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string; label: string; suffix?: string; hint?: string; error?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <Input id={id} type="number" inputMode="numeric" aria-invalid={!!error} className="pr-14 tabular-nums" {...props} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center tabular-nums text-caption text-ink-3">{suffix}</span>}
      </div>
      {hint && !error && <p className="mt-1.5 text-caption text-ink-3">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-caption text-danger">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
