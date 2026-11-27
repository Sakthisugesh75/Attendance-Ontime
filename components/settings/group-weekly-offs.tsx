"use client";

import { Briefcase, Building2, CircleAlert, Hourglass, Loader2, Pencil, Plus, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { deleteScheduledRule, scheduleGroupWeeklyOff } from "@/lib/actions/settings";
import { SATURDAY_POLICIES, type WeeklyOffRuleLike } from "@/lib/attendance/weekly-off";
import { addDays, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buildPattern, describePattern, SATURDAY_POLICY_KEYS, type SaturdayPolicy } from "@/lib/validations/settings";
import type { WorkingWeekData } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { SettingsCard, SettingsSection } from "./section";
import { nextMonth, PreviewLegend, WeekPreview } from "./week-preview";

type Group = WorkingWeekData["groups"][number];
type Target = "department" | "designation";
type Choice = SaturdayPolicy | "COMPANY";

const SAT_HINT: Record<SaturdayPolicy, string> = { ALL_WORKING: "6-day week", ALL_OFF: "5-day week", ALT_1_3: "Alternate Saturdays", ALT_2_4: "Alternate Saturdays" };

/**
 * Weekly offs for one department or designation, e.g. Sales works every Saturday while
 * Developers get the 2nd and 4th Saturday off. Designation beats department beats company.
 */
export function GroupWeeklyOffs({ data }: { data: WorkingWeekData }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ open: boolean; group: Group | null; resetToCompany?: boolean }>({ open: false, group: null });
  const companyNow = data.rules.find((r) => r.id === data.currentId)?.label ?? "No weekly offs";
  const nothingToGroup = !data.departments.length && !data.designations.length;

  return (
    <SettingsSection
      title="By department or designation"
      description={
        <>
          Give a team its own week, for example Sales working every Saturday and Developers off on the 2nd and 4th Saturday. A designation&apos;s policy wins over its department&apos;s; everyone
          else follows the company policy above ({companyNow}).
        </>
      }
      aside={
        <Button variant="outline" onClick={() => setSheet({ open: true, group: null })} disabled={nothingToGroup}>
          <Plus /> Add team policy
        </Button>
      }
    >
      {data.groups.length === 0 ? (
        <SettingsCard>
          <p className="text-body text-ink-2">
            {nothingToGroup ? "Add departments or designations in the Departments tab first." : "Every team follows the company policy. Add a team policy to give one its own weekly offs."}
          </p>
        </SettingsCard>
      ) : (
        <ul className="space-y-3">
          {data.groups.map((g) => {
            const Icon = g.target === "designation" ? Briefcase : Building2;
            return (
              <li key={g.key} className="rounded-xl bg-surface p-4 shadow-card sm:p-5">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-2">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">
                      {g.name}
                      <span className="font-normal text-ink-3">
                        {" "}
                        · {g.target === "designation" ? "Designation" : "Department"} · <span className="tabular-nums">{g.employees}</span> {g.employees === 1 ? "person" : "people"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body text-ink-2">
                      {g.current ? (
                        <>
                          <span className="font-medium text-ink">{g.current.label}</span>
                          <span className="text-caption text-ink-3 tabular-nums"> · since {formatDate(g.current.effectiveFrom)}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">Follows the company policy now</span>
                      )}
                    </p>
                    {g.upcoming.map((u) => (
                      <div key={u.id} className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-st-pending bg-st-pending-tint pr-2 pl-1.5 text-caption font-semibold text-st-pending-fg">
                          <Hourglass aria-hidden className="size-3.5" /> Scheduled
                        </span>
                        <span className="text-caption text-ink-2 tabular-nums">
                          {u.inherit ? "Back to company policy" : u.label} from {formatDate(u.effectiveFrom)}
                        </span>
                        <ConfirmButton
                          title="Withdraw this scheduled change?"
                          description={`${g.name} won't switch to ${u.inherit ? "the company policy" : u.label} on ${formatDate(u.effectiveFrom)}.`}
                          confirmLabel="Withdraw"
                          action={() => deleteScheduledRule(u.id)}
                          onDone={() => router.refresh()}
                          variant="ghost"
                          size="sm"
                        >
                          <Undo2 /> Withdraw
                        </ConfirmButton>
                      </div>
                    ))}
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Change weekly offs for ${g.name}`} onClick={() => setSheet({ open: true, group: g })}>
                      <Pencil />
                    </Button>
                    {g.current && (
                      <Button variant="ghost" size="sm" onClick={() => setSheet({ open: true, group: g, resetToCompany: true })}>
                        Use company policy
                      </Button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <GroupSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        group={sheet.group}
        resetToCompany={!!sheet.resetToCompany}
        data={data}
      />
    </SettingsSection>
  );
}

function GroupSheet({ open, onOpenChange, group, resetToCompany, data }: { open: boolean; onOpenChange: (o: boolean) => void; group: Group | null; resetToCompany: boolean; data: WorkingWeekData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const firstOfNextMonth = `${nextMonth(data.today.slice(0, 7))}-01`;
  const [target, setTarget] = useState<Target>("department");
  const [targetId, setTargetId] = useState("");
  const [choice, setChoice] = useState<Choice>("ALL_WORKING");
  const [sundayOff, setSundayOff] = useState(true);
  const [from, setFrom] = useState(firstOfNextMonth);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget(group?.target ?? (data.departments.length ? "department" : "designation"));
    setTargetId(group ? String(group.targetId) : "");
    const policy = group?.current?.policy;
    setChoice(resetToCompany ? "COMPANY" : (policy?.saturday ?? "ALL_WORKING"));
    setSundayOff(policy?.sundayOff ?? true);
    setFrom(firstOfNextMonth);
    setError("");
  }, [open, group, resetToCompany, data.departments.length, firstOfNextMonth]);

  const list = target === "department" ? data.departments : data.designations;
  const picked = list.find((x) => String(x.id) === targetId);
  const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : data.today;
  const pattern = choice === "COMPANY" ? null : buildPattern(choice, sundayOff);

  // Preview: the company week, with this team's pattern from the chosen date.
  const previewRules: WeeklyOffRuleLike[] = useMemo(() => (pattern ? [...data.rules, { shiftId: null, effectiveFrom: validFrom, pattern }] : data.rules), [data.rules, validFrom, pattern]);
  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return setError(`Pick a ${target}.`);
    start(async () => {
      setError("");
      const res = await scheduleGroupWeeklyOff({
        target,
        targetId: Number(targetId),
        mode: choice === "COMPANY" ? "company" : "custom",
        saturday: choice === "COMPANY" ? "ALL_WORKING" : choice,
        sundayOff,
        effectiveFrom: from,
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  const options: { key: Choice; label: string; hint: string }[] = [
    ...SATURDAY_POLICY_KEYS.map((k) => ({ key: k as Choice, label: SATURDAY_POLICIES[k].label, hint: SAT_HINT[k] })),
    ...(group ? [{ key: "COMPANY" as Choice, label: "Same as the company", hint: "Remove this team's own policy" }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DrawerContent size="form">
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{group ? `Weekly offs for ${group.name}` : "Team weekly offs"}</SheetTitle>
          <SheetDescription className={drawerDescription}>Starts on the date you pick. Earlier months keep the week that applied then.</SheetDescription>
        </SheetHeader>
        <form id="group-weekly-off-form" onSubmit={save} noValidate className={cn(drawerBody, "space-y-5")}>
          {!group && (
            <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="gwo-target">For a</Label>
                <Select
                  value={target}
                  onValueChange={(v) => {
                    setTarget(v as Target);
                    setTargetId("");
                  }}
                >
                  <SelectTrigger id="gwo-target" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department" disabled={!data.departments.length}>
                      Department
                    </SelectItem>
                    <SelectItem value="designation" disabled={!data.designations.length}>
                      Designation
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gwo-group">{target === "department" ? "Department" : "Designation"}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger id="gwo-group" className="w-full" aria-invalid={!!error && !targetId}>
                    <SelectValue placeholder={`Pick a ${target}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((x) => (
                      <SelectItem key={x.id} value={String(x.id)}>
                        {x.name}
                        <span className="text-ink-3 tabular-nums"> · {x.employees}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <Label id="gwo-sat">Saturdays</Label>
            <div role="radiogroup" aria-labelledby="gwo-sat" className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const selected = choice === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setChoice(o.key)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      selected ? "border-brand bg-brand-subtle ring-1 ring-brand" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border", selected ? "border-brand" : "border-line-strong")}>
                      {selected && <span className="size-2 rounded-full bg-brand" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-body font-medium", selected ? "text-brand-ink" : "text-ink")}>{o.label}</span>
                      <span className="block text-caption text-ink-3">{o.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {choice !== "COMPANY" && (
            <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3.5 py-3">
              <span>
                <span className="block text-body font-medium">Sunday off</span>
                <span className="block text-caption text-ink-3">Turn off for teams that work on Sundays</span>
              </span>
              <Switch aria-label="Sunday off" checked={sundayOff} onCheckedChange={setSundayOff} />
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="gwo-from">Effective from</Label>
            <Input id="gwo-from" type="date" min={addDays(data.today, -400)} value={from} onChange={(e) => setFrom(e.target.value)} className="tabular-nums sm:w-48" />
            <p className="text-caption text-ink-3">
              <span className="font-medium text-ink">{picked?.name ?? group?.name ?? "This team"}</span>: {pattern ? describePattern(pattern) : "company policy"} from {formatDate(validFrom)}
              {validFrom < data.today ? ". Past days from that date are recalculated." : "."}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-label text-ink">Preview</span>
              <PreviewLegend />
            </div>
            <WeekPreview months={[validFrom.slice(0, 7), nextMonth(validFrom.slice(0, 7))]} rules={previewRules} holidays={holidays} from={validFrom} today={data.today} />
          </div>

          {error && (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </form>
        <SheetFooter className={drawerFooter}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="group-weekly-off-form" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {validFrom > data.today ? "Schedule" : "Apply"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
