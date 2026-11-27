"use client";

import { ArrowDown, ArrowUp, CircleAlert, ClipboardList, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { deleteReportForm, saveReportForm } from "@/lib/actions/settings";
import type { ReportFormRow } from "@/lib/report-forms";
import { cn } from "@/lib/utils";
import { DEFAULT_SECTIONS, FIELD_TYPE_LABEL, FIELD_TYPES, MAX_FIELDS, newFieldId, type FieldType, type FormField, type FormSections } from "@/lib/validations/report-forms";
import type { ReportFormsData } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { SettingsSection } from "./section";

type Lookup = { id: number; name: string };

const sectionWords = (s: FormSections) =>
  [s.tasks && "Tasks", s.summary.on && s.summary.label, s.tomorrowPlan.on && s.tomorrowPlan.label, s.blockers.on && s.blockers.label].filter(Boolean).join(" · ");

export function ReportFormsSection({ data }: { data: ReportFormsData }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ReportFormRow | null>(null);
  const [open, setOpen] = useState(false);
  const edit = (f: ReportFormRow | null) => {
    setEditing(f);
    setOpen(true);
  };
  const names = (ids: number[], list: Lookup[]) => list.filter((x) => ids.includes(x.id)).map((x) => x.name);

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Daily report forms"
        description="What people fill in for their daily report. Rename or switch off the standard sections, add your own fields, and give designations or departments their own form. Everyone else uses the default form."
        aside={
          <Button onClick={() => edit(null)}>
            <Plus /> New form
          </Button>
        }
      >
        <ul className="space-y-3">
          {data.forms.map((f) => {
            const who = f.isDefault ? ["Everyone else"] : [...names(f.designationIds, data.designations), ...names(f.departmentIds, data.departments)];
            return (
              <li key={f.id} className="flex items-start gap-3 rounded-xl bg-surface p-4 shadow-card sm:p-5">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-2">
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-ink">
                    {f.name}
                    {f.isDefault && <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-mint px-2 text-caption font-semibold text-on-mint">Default</span>}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-3">For: {who.join(", ") || "nobody yet"}</p>
                  <p className="mt-1 text-caption text-ink-2">
                    {sectionWords(f.sections) || "No standard sections"}
                    {f.fields.length > 0 && ` · ${f.fields.length} custom field${f.fields.length === 1 ? "" : "s"}: ${f.fields.map((x) => x.label).join(", ")}`}
                  </p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${f.name}`} onClick={() => edit(f)}>
                    <Pencil />
                  </Button>
                  {!f.isDefault && (
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      className="text-danger"
                      aria-label={`Delete ${f.name}`}
                      title={`Delete ${f.name}?`}
                      description="People it was for go back to the default form. Reports already sent keep their answers."
                      confirmLabel="Delete"
                      action={() => deleteReportForm(f.id)}
                      onDone={() => router.refresh()}
                    >
                      <Trash2 />
                    </ConfirmButton>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </SettingsSection>
      <ReportFormSheet open={open} onOpenChange={setOpen} form={editing} designations={data.designations} departments={data.departments} />
    </div>
  );
}

function ChipPicker({ label, items, picked, onChange }: { label: string; items: Lookup[]; picked: number[]; onChange: (ids: number[]) => void }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <span className="block text-label text-ink">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((d) => {
          const on = picked.includes(d.id);
          return (
            <Button
              key={d.id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={on}
              className={cn("rounded-full max-md:h-11", on && "border-brand bg-brand-subtle text-brand-ink hover:bg-brand-subtle")}
              onClick={() => onChange(on ? picked.filter((x) => x !== d.id) : [...picked, d.id])}
            >
              {d.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function ReportFormSheet({ open, onOpenChange, form, designations, departments }: { open: boolean; onOpenChange: (o: boolean) => void; form: ReportFormRow | null; designations: Lookup[]; departments: Lookup[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [sections, setSections] = useState<FormSections>(DEFAULT_SECTIONS);
  const [fields, setFields] = useState<(FormField & { optionsText: string })[]>([]);
  const [designationIds, setDesignationIds] = useState<number[]>([]);
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(form?.name ?? "");
    setSections(form?.sections ?? DEFAULT_SECTIONS);
    setFields((form?.fields ?? []).map((f) => ({ ...f, optionsText: f.options.join(", ") })));
    setDesignationIds(form?.designationIds ?? []);
    setDepartmentIds(form?.departmentIds ?? []);
    setError("");
  }, [open, form]);

  const patchField = (i: number, patch: Partial<FormField & { optionsText: string }>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: number) =>
    setFields((fs) => {
      const next = [...fs];
      const [x] = next.splice(i, 1);
      next.splice(i + by, 0, x!);
      return next;
    });
  const section = (key: "summary" | "tomorrowPlan" | "blockers", hint: string) => (
    <div className="flex items-center gap-3">
      <Switch aria-label={`Show ${sections[key].label}`} checked={sections[key].on} onCheckedChange={(on) => setSections((s) => ({ ...s, [key]: { ...s[key], on } }))} />
      <Input
        aria-label={`Name of the ${hint} section`}
        value={sections[key].label}
        maxLength={60}
        disabled={!sections[key].on}
        onChange={(e) => setSections((s) => ({ ...s, [key]: { ...s[key], label: e.target.value } }))}
      />
    </div>
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await saveReportForm(form?.id ?? null, {
        name,
        sections,
        fields: fields.map(({ optionsText, ...f }) => ({
          ...f,
          options:
            f.type === "select"
              ? optionsText
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
              : [],
        })),
        designationIds,
        departmentIds,
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DrawerContent size="form">
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{form ? `Edit ${form.name}` : "New report form"}</SheetTitle>
          <SheetDescription className={drawerDescription}>Changes apply to reports sent from now on. Reports already sent keep what was filled in.</SheetDescription>
        </SheetHeader>
        <form id="report-form-form" onSubmit={save} noValidate className={cn(drawerBody, "space-y-6")}>
          <div className="space-y-1.5">
            <Label htmlFor="rf-name">Form name</Label>
            <Input id="rf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Sales visit report" />
          </div>

          {!form?.isDefault && (
            <fieldset className="space-y-4 rounded-md border border-line p-3.5">
              <legend className="sr-only">Who uses it</legend>
              <span className="block text-body font-medium">Who uses it</span>
              <span className="block text-caption text-ink-3">A designation&apos;s form wins over a department&apos;s. Each one can use only one form.</span>
              <ChipPicker label="Designations" items={designations} picked={designationIds} onChange={setDesignationIds} />
              <ChipPicker label="Departments" items={departments} picked={departmentIds} onChange={setDepartmentIds} />
              {!designations.length && !departments.length && <p className="text-caption text-ink-3">Add designations or departments in the Departments tab first.</p>}
            </fieldset>
          )}

          <fieldset className="space-y-3 rounded-md border border-line p-3.5">
            <legend className="sr-only">Standard sections</legend>
            <span className="block text-body font-medium">Standard sections</span>
            <label className="flex items-center gap-3">
              <Switch aria-label="Show tasks" checked={sections.tasks} onCheckedChange={(tasks) => setSections((s) => ({ ...s, tasks }))} />
              <span className="text-body">Tasks with hours and status</span>
            </label>
            {section("summary", "summary")}
            {section("tomorrowPlan", "plan for tomorrow")}
            {section("blockers", "blockers")}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="sr-only">Custom fields</legend>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body font-medium">Custom fields</span>
              <span className="text-caption text-ink-3 tabular-nums">
                {fields.length}/{MAX_FIELDS}
              </span>
            </div>
            {fields.map((f, i) => (
              <div key={f.id} className="space-y-3 rounded-lg border border-line p-3.5">
                <div className="flex items-center gap-2">
                  <Input aria-label={`Label of field ${i + 1}`} value={f.label} maxLength={80} placeholder="e.g. Clients visited" onChange={(e) => patchField(i, { label: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="text-danger" aria-label={`Remove ${f.label || "field"}`} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={f.type} onValueChange={(v) => patchField(i, { type: v as FieldType })}>
                    <SelectTrigger className="w-full sm:w-48" aria-label={`Type of field ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {FIELD_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-body">
                    <Switch aria-label={`Field ${i + 1} required`} checked={f.required} onCheckedChange={(required) => patchField(i, { required })} />
                    Required
                  </label>
                </div>
                {f.type === "select" && (
                  <Input aria-label={`Choices for field ${i + 1}`} value={f.optionsText} onChange={(e) => patchField(i, { optionsText: e.target.value })} placeholder="Choices, separated by commas: Hot, Warm, Cold" />
                )}
                <Input aria-label={`Hint for field ${i + 1}`} value={f.hint} maxLength={120} onChange={(e) => patchField(i, { hint: e.target.value })} placeholder="Hint under the field (optional)" />
              </div>
            ))}
            {fields.length < MAX_FIELDS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-dashed"
                onClick={() => setFields((fs) => [...fs, { id: newFieldId(), label: "", type: "text", required: false, options: [], optionsText: "", hint: "" }])}
              >
                <Plus /> Add field
              </Button>
            )}
          </fieldset>

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
          <Button type="submit" form="report-form-form" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {form ? "Save form" : "Add form"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
