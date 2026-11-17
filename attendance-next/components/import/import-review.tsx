"use client";

import { AlertTriangle, CalendarOff, CheckCircle2, CircleAlert, FileSpreadsheet, Info, Loader2, PartyPopper, Users, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmImport } from "@/lib/actions/import";
import { ISSUE_EFFECT, ISSUE_LABEL, type IssueKind } from "@/lib/excel/parse-workbook";
import type { ImportPreview } from "@/lib/import/service";
import { formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { commitImportSchema, type CommitImportInput } from "@/lib/validations/import";

type PersonChoice = CommitImportInput["people"][number];

/** Issue tags use feedback tints only: danger for unreadable, the late palette for "check this", neutral for auto-fixes. */
const ISSUE_TONE: Record<IssueKind, string> = {
  AMPM_FIXED: "text-ink-2 bg-sunken",
  UNREADABLE_TIME: "text-danger bg-danger-subtle",
  MISSING_OUT: "text-danger bg-danger-subtle",
  MISSING_IN: "text-danger bg-danger-subtle",
  UNCLEAR_REMARK: "text-st-late-fg bg-st-late-tint",
  UNUSUAL_TIME: "text-st-late-fg bg-st-late-tint",
  BAD_DATE: "text-danger bg-danger-subtle",
  DUPLICATE_DATE: "text-st-late-fg bg-st-late-tint",
  NO_HEADER: "text-danger bg-danger-subtle",
};

const STATUS_COUNT_LABEL: Record<string, string> = {
  TIMES: "with in/out times",
  LEAVE: "leave",
  WFH: "WFH",
  ON_DUTY: "on duty / shoot",
  PERMISSION: "permission",
  HALF_DAY: "half day",
  REMARK: "remark only",
};

export function ImportReview({ preview }: { preview: ImportPreview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const [people, setPeople] = useState<PersonChoice[]>(() =>
    preview.people.map((p) => ({
      key: p.key,
      action: p.suggestion.action,
      employeeId: p.suggestion.employeeId,
      fullName: p.names[0]!,
      department: "",
      joiningDate: p.suggestion.joiningDate,
      exitDate: p.suggestion.exitDate,
      status: p.suggestion.status,
    })),
  );
  const [holidays, setHolidays] = useState(() => preview.holidays.map((h) => ({ date: h.date, name: h.label, add: !h.existing, existing: h.existing })));
  const [extraOff, setExtraOff] = useState(() => preview.extraOff.map((o) => ({ ...o, add: true })));
  const [strategy, setStrategy] = useState<"skip" | "overwrite">("skip");
  const [issueKind, setIssueKind] = useState<IssueKind | "ALL">("ALL");

  const setPerson = (i: number, patch: Partial<PersonChoice>) => setPeople((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const issueCounts = useMemo(() => {
    const c: Partial<Record<IssueKind, number>> = {};
    for (const i of preview.parsed.issues) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [preview.parsed.issues]);
  const shownIssues = preview.parsed.issues.filter((i) => issueKind === "ALL" || i.kind === issueKind);

  const importing = people.filter((p) => p.action !== "skip").length;
  const creating = people.filter((p) => p.action === "create").length;

  const submit = () => {
    setError("");
    const input: CommitImportInput = {
      people,
      strategy,
      holidays: holidays.filter((h) => h.add && !h.existing).map((h) => ({ date: h.date, name: h.name })),
      extraOffDays: extraOff.filter((o) => o.add).map((o) => o.date),
    };
    const check = commitImportSchema.safeParse(input);
    if (!check.success) {
      const issue = check.error.issues[0]!;
      const idx = typeof issue.path[1] === "number" ? issue.path[1] : null;
      setError(idx !== null ? `${preview.people[idx]?.names[0]}: ${issue.message}` : issue.message);
      return;
    }
    start(async () => {
      const res = await confirmImport(preview.batch.id, input);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2">
          <FileSpreadsheet aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink sm:text-title-1">{preview.batch.fileName}</h2>
          <p className="mt-1 text-body text-ink-2">Review what was found. Nothing is saved until you press Import.</p>
        </div>
      </div>

      {/* Summary */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Months", String(preview.parsed.sheets.filter((s) => !s.skipped).length)],
          ["Dates", preview.parsed.firstDate ? `${formatDate(preview.parsed.firstDate).slice(0, 6)} – ${formatDate(preview.parsed.latestDate)}` : "—"],
          ["People", String(preview.people.length)],
          ["Person-days", String(preview.parsed.entries)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl bg-surface shadow-card p-4">
            <dt className="text-label text-ink-2">{k}</dt>
            <dd className="mt-1 truncate text-title-2 text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-body text-ink-2">
        {Object.entries(preview.statusCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <span key={k}>
              <b className="tabular-nums font-semibold text-ink">{n}</b> {STATUS_COUNT_LABEL[k] ?? k}
            </span>
          ))}
      </p>

      {/* People */}
      <Section icon={Users} title="People in the file" hint="Match each name to an existing employee, or create a new one. Days before joining and after exit are never imported.">
        <ul className="divide-y divide-line">
          {preview.people.map((p, i) => {
            const c = people[i]!;
            return (
              <li key={p.key} className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{p.names[0]}</p>
                  {p.names.length > 1 && <p className="truncate text-caption text-ink-3">Also written: {p.names.slice(1).join(", ")}</p>}
                  <p className="mt-1 text-caption text-ink-3 tabular-nums">
                    {p.firstWorked ? `${formatDate(p.firstWorked)} – ${formatDate(p.lastWorked)}` : "No working days"} · {p.daysWithData} days
                  </p>
                  <p className="text-caption text-ink-3">{p.sheets.length === 1 ? p.sheets[0] : `${p.sheets[0]} → ${p.sheets.at(-1)}`}</p>
                  {p.suggestion.status === "EXITED" && (
                    <span className="mt-1.5 inline-flex h-[22px] items-center rounded-full bg-st-late-tint px-2 text-caption font-semibold text-st-late-fg">Looks like they left</span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="inline-flex max-w-full flex-wrap gap-1 rounded-md bg-sunken p-1" role="radiogroup" aria-label={`What to do with ${p.names[0]}`}>
                    {(["match", "create", "skip"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={c.action === a}
                        disabled={a === "match" && preview.employees.length === 0}
                        onClick={() => setPerson(i, { action: a, employeeId: a === "match" ? (c.employeeId ?? p.matches[0]?.id ?? null) : c.employeeId })}
                        className={cn(
                          "h-10 rounded-sm px-3 text-label transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:text-ink-disabled md:h-8",
                          c.action === a ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                        )}
                      >
                        {a === "match" ? "Existing employee" : a === "create" ? "Create new" : "Skip"}
                      </button>
                    ))}
                  </div>

                  {c.action === "match" && (
                    <Select value={c.employeeId ? String(c.employeeId) : undefined} onValueChange={(v) => setPerson(i, { employeeId: Number(v) })}>
                      <SelectTrigger className="w-full sm:w-80" aria-label={`Employee for ${p.names[0]}`}>
                        <SelectValue placeholder="Pick an employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {p.matches.map((m) => (
                          <SelectItem key={`m-${m.id}`} value={String(m.id)}>
                            {m.fullName} <span className="text-ink-3">· {m.code} · {m.score}% match</span>
                          </SelectItem>
                        ))}
                        {preview.employees
                          .filter((e) => !p.matches.some((m) => m.id === e.id))
                          .map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.fullName} <span className="text-ink-3">· {e.code}</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}

                  {c.action === "create" && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="block space-y-1.5 xl:col-span-2">
                        <span className="text-label text-ink">Full name</span>
                        <Input value={c.fullName} onChange={(e) => setPerson(i, { fullName: e.target.value })} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-label text-ink">Department</span>
                        <Input list="import-departments" value={c.department} placeholder="Optional" onChange={(e) => setPerson(i, { department: e.target.value })} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-label text-ink">Joined</span>
                        <Input type="date" value={c.joiningDate} onChange={(e) => setPerson(i, { joiningDate: e.target.value })} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-label text-ink">Exit date</span>
                        <Input
                          type="date"
                          value={c.exitDate}
                          onChange={(e) => setPerson(i, { exitDate: e.target.value, status: e.target.value ? (c.status === "ACTIVE" ? "EXITED" : c.status) : "ACTIVE" })}
                        />
                      </label>
                    </div>
                  )}
                  {c.action === "match" && p.matches[0] && p.matches[0].score < 80 && (
                    <p className="text-caption text-ink-3">No close name match. Check this is the right person.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <datalist id="import-departments">
          {preview.departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Section>

      {/* Holidays */}
      {holidays.length > 0 && (
        <Section icon={PartyPopper} title="Holidays in the file" hint="Rows like “Labour Day”. Ticked ones are added to the holiday calendar so those days count as holidays, not absences.">
          <ul className="divide-y divide-line">
            {holidays.map((h, i) => (
              <li key={h.date} className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                <Checkbox
                  checked={h.add || !!h.existing}
                  disabled={!!h.existing}
                  onCheckedChange={(v) => setHolidays((list) => list.map((x, j) => (j === i ? { ...x, add: v === true } : x)))}
                  aria-label={`Add ${h.name}`}
                />
                <span className="w-36 text-body tabular-nums">
                  {formatDate(h.date)} <span className="text-caption text-ink-3">{WEEKDAYS[weekdayOf(h.date)]!.slice(0, 3)}</span>
                </span>
                {h.existing ? (
                  <span className="text-body text-ink-2">Already a holiday: {h.existing}</span>
                ) : (
                  <Input
                    value={h.name}
                    onChange={(e) => setHolidays((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="max-w-72 flex-1 md:h-8"
                    aria-label="Holiday name"
                  />
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {extraOff.length > 0 && (
        <Section
          icon={CalendarOff}
          title="Off days that differ from your weekly-off rule"
          hint="The sheet marks these days off (e.g. a Saturday), but your current rule treats them as working days. Ticked ones become off days so nobody is marked absent."
        >
          <ul className="grid gap-x-6 px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
            {extraOff.map((o, i) => (
              <li key={o.date} className="flex min-h-11 items-center gap-3 py-1.5 text-body">
                <Checkbox checked={o.add} onCheckedChange={(v) => setExtraOff((list) => list.map((x, j) => (j === i ? { ...x, add: v === true } : x)))} aria-label={`Mark ${o.date} off`} />
                <span className="tabular-nums">{formatDate(o.date)}</span>
                <span className="text-ink-3">{o.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Issues */}
      <Section
        icon={preview.parsed.issues.length ? AlertTriangle : CheckCircle2}
        title={preview.parsed.issues.length ? `${preview.parsed.issues.length} things to check` : "No problems found"}
        hint="Every automatic fix and every cell that couldn't be read. Cell references point to the original sheet."
      >
        {preview.parsed.issues.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3 sm:px-5">
              <Chip active={issueKind === "ALL"} onClick={() => setIssueKind("ALL")}>
                All · {preview.parsed.issues.length}
              </Chip>
              {(Object.keys(issueCounts) as IssueKind[]).map((k) => (
                <Chip key={k} active={issueKind === k} onClick={() => setIssueKind(k)}>
                  {ISSUE_LABEL[k]} · {issueCounts[k]}
                </Chip>
              ))}
            </div>
            {issueKind !== "ALL" && (
              <p className="flex items-center gap-2 border-b border-line bg-sunken px-5 py-2 text-caption text-ink-3">
                <Info aria-hidden className="size-3.5 shrink-0" /> {ISSUE_EFFECT[issueKind]}
              </p>
            )}
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {shownIssues.map((iss, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-body text-ink-2 hover:bg-sunken sm:px-5">
                  <span className={cn("rounded-xs px-1.5 py-0.5 text-caption font-semibold whitespace-nowrap", ISSUE_TONE[iss.kind])}>
                    {iss.kind === "AMPM_FIXED" && <Wand2 aria-hidden className="mr-1 inline size-3" />}
                    {ISSUE_LABEL[iss.kind]}
                  </span>
                  <span className="font-medium text-ink">{iss.name ?? "—"}</span>
                  <span className="text-ink-3 tabular-nums">{iss.date ? formatDate(iss.date) : ""}</span>
                  <span className="min-w-0 flex-1 basis-64">{iss.message}</span>
                  <span className="tabular-nums text-caption text-ink-3">
                    {iss.sheet}
                    {iss.cell ? `!${iss.cell}` : ` row ${iss.row}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* Existing days */}
      <Section icon={Info} title="Days that already have attendance" hint="If someone already has punches or remarks on a day in this file:">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {(
            [
              ["skip", "Keep what's already there", "Only empty days are filled from the file. Safest choice."],
              ["overwrite", "Replace with the file", "The file's times and remarks win. Undo puts the old values back."],
            ] as const
          ).map(([value, title, text]) => (
            <label key={value} className={cn("flex cursor-pointer gap-3 rounded-md border p-4 transition-colors duration-[120ms]", strategy === value ? "border-brand bg-brand-subtle ring-1 ring-brand" : "border-line hover:bg-sunken")}>
              <input type="radio" name="strategy" value={value} checked={strategy === value} onChange={() => setStrategy(value)} className="mt-0.5 size-[18px] accent-[var(--ad-brand)]" />
              <span>
                <span className={cn("block text-body font-medium", strategy === value ? "text-brand-ink" : "text-ink")}>{title}</span>
                <span className="block text-caption text-ink-3">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* Confirm bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:left-[var(--sidebar-width)] md:peer-data-[state=collapsed]:left-[var(--sidebar-width-icon)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="min-w-0 flex-1 text-body">
            {error ? (
              <span role="alert" className="inline-flex items-start gap-1.5 text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {error}
              </span>
            ) : (
              <span className="text-ink-3">
                Import <b className="text-ink tabular-nums">{importing}</b> of <span className="tabular-nums">{people.length}</span> people
                {creating ? (
                  <>
                    {" "}
                    · <b className="text-ink tabular-nums">{creating}</b> new employees
                  </>
                ) : null}
                {" "}· you can undo this afterwards
              </span>
            )}
          </p>
          <Button size="lg" className="max-sm:w-full" onClick={submit} disabled={pending || importing === 0} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Importing… this can take a minute" : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Users; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-card">
      <div className="flex gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <Icon aria-hidden className="mt-1 size-4 shrink-0 text-ink-3" />
        <div>
          <h3 className="text-title-3 text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-caption text-ink-3">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("inline-flex h-9 items-center rounded-full border px-3 text-caption font-semibold tabular-nums transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-7", active ? "border-brand bg-brand-subtle text-brand-ink" : "border-line text-ink-2 hover:bg-sunken hover:text-ink")}
    >
      {children}
    </button>
  );
}
