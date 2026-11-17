"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, CircleAlert, Loader2, Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncement, updateAnnouncement } from "@/lib/actions/announcements";
import type { AnnouncementItem } from "@/lib/announcements";
import { addDays, formatDate, istDate, monthDates, WEEKDAYS, weekdayOf } from "@/lib/time";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, announcementSchemaFor, type AnnouncementInput } from "@/lib/validations/announcements";

export function AnnouncementSheet({ open, onOpenChange, announcement }: { open: boolean; onOpenChange: (o: boolean) => void; announcement: AnnouncementItem | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const initial = (): AnnouncementInput =>
    announcement
      ? { title: announcement.title, body: announcement.body, pinned: announcement.pinned, expiresOn: announcement.expiresOn, notify: false }
      : { title: "", body: "", pinned: false, expiresOn: "", notify: true };
  const schema = useMemo(() => announcementSchemaFor(announcement?.expiresOn ?? ""), [announcement]);
  const form = useForm<AnnouncementInput>({ resolver: zodResolver(schema), defaultValues: initial() });
  const { register, control, watch, setValue, formState } = form;
  const errors = formState.errors;
  const body = watch("body") ?? "";
  const title = watch("title") ?? "";
  const expiresOn = watch("expiresOn");

  useEffect(() => {
    if (open) {
      form.reset(initial());
      setFormError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, announcement]);

  const today = istDate();
  const quick = [
    { label: "Today only", value: today },
    { label: "1 week", value: addDays(today, 6) },
    { label: "End of month", value: monthDates(today.slice(0, 7)).at(-1)! },
  ];

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      setFormError("");
      const res = announcement ? await updateAnnouncement(announcement.id, v) : await createAnnouncement(v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<AnnouncementInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    }),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="form">
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{announcement ? "Edit announcement" : "New announcement"}</SheetTitle>
          <SheetDescription className={drawerDescription}>Everyone who can sign in sees it on the notice board and their dashboard.</SheetDescription>
        </SheetHeader>
        <form id="announcement-form" onSubmit={onSubmit} noValidate className={cn(drawerBody, "space-y-5")}>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="announcement-title">Title</Label>
              <span className={cn("text-caption text-ink-3 tabular-nums", title.length > ANNOUNCEMENT_TITLE_MAX && "text-danger")}>
                {title.length}/{ANNOUNCEMENT_TITLE_MAX}
              </span>
            </div>
            <Input id="announcement-title" placeholder="e.g. Office closed on Saturday for maintenance" aria-invalid={!!errors.title} {...register("title")} />
            {errors.title && (
              <p className="flex items-center gap-1.5 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="announcement-body">Message</Label>
              <span className={cn("text-caption text-ink-3 tabular-nums", body.length > ANNOUNCEMENT_BODY_MAX && "text-danger")}>
                {body.length}/{ANNOUNCEMENT_BODY_MAX}
              </span>
            </div>
            <Textarea id="announcement-body" rows={7} className="min-h-40 leading-6" placeholder="Plain text. Line breaks are kept as you type them." aria-invalid={!!errors.body} {...register("body")} />
            {errors.body && (
              <p className="flex items-center gap-1.5 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.body.message}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3.5">
            <span className="flex gap-3">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-sunken text-ink-2">
                <Pin className="size-4" />
              </span>
              <span>
                <span className="block text-body font-medium text-ink">Pin to the top</span>
                <span className="block text-caption text-ink-3">Pinned posts stay above newer ones and stand out on the dashboard.</span>
              </span>
            </span>
            <Controller control={control} name="pinned" render={({ field }) => <Switch aria-label="Pin to the top" checked={field.value} onCheckedChange={field.onChange} />} />
          </label>

          <div className="space-y-2">
            <Label htmlFor="announcement-until">Show until</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="announcement-until" type="date" min={today} className="w-44 tabular-nums" aria-invalid={!!errors.expiresOn} {...register("expiresOn")} />
              {quick.map((q) => (
                <Button
                  key={q.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={expiresOn === q.value}
                  className={cn("rounded-full max-md:h-11", expiresOn === q.value && "border-brand bg-brand-subtle text-brand-ink hover:bg-brand-subtle")}
                  onClick={() => setValue("expiresOn", q.value, { shouldValidate: true, shouldDirty: true })}
                >
                  {q.label}
                </Button>
              ))}
              {expiresOn && (
                <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => setValue("expiresOn", "", { shouldValidate: true, shouldDirty: true })}>
                  Clear
                </Button>
              )}
            </div>
            {errors.expiresOn ? (
              <p className="flex items-center gap-1.5 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.expiresOn.message}
              </p>
            ) : (
              <p className="text-caption text-ink-3 tabular-nums">
                {/^\d{4}-\d{2}-\d{2}$/.test(expiresOn ?? "") ? `Shown up to and including ${WEEKDAYS[weekdayOf(expiresOn)]}, ${formatDate(expiresOn)}.` : "Leave empty to keep it up until you remove it."}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5">
            <Controller
              control={control}
              name="notify"
              render={({ field }) => <Checkbox id="announcement-notify" className="mt-0.5" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />}
            />
            <div className="min-w-0">
              <Label htmlFor="announcement-notify" className="flex items-center gap-1.5">
                <BellRing aria-hidden className="size-3.5" /> Notify everyone
              </Label>
              <p className="mt-0.5 text-caption text-ink-3">
                {announcement ? "Sends the updated post again: a bell notification and an email to everyone." : "Sends a bell notification and an email to everyone who can sign in."}
              </p>
            </div>
          </div>

          {formError && (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}
        </form>
        <SheetFooter className={drawerFooter}>
          <Button type="button" variant="outline" className="max-md:h-12 max-md:flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="announcement-form" className="max-md:h-12 max-md:flex-1" disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {announcement ? "Save changes" : "Post announcement"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
