"use client";

import { Download, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveExportFormat } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/validations/settings";
import type { ExportFormatData } from "@/app/(dashboard)/settings/data";
import { SaveBar } from "./save-bar";
import { FieldError, SettingsCard, SettingsSection } from "./section";

const SAMPLE_PDF = "/api/export/monthly-summary?format=pdf";

/** Settings → Export format: letterhead, notes, signature lines and which columns each export has. */
export function ExportFormatSection({ data }: { data: ExportFormatData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<ExportFormat>(data.format);
  const [f, setF] = useState<ExportFormat>(data.format);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [report, setReport] = useState(data.reports[0]!.key);
  const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(saved), [f, saved]);
  const set = <K extends keyof ExportFormat>(k: K, v: ExportFormat[K]) => setF((x) => ({ ...x, [k]: v }));

  const current = data.reports.find((r) => r.key === report)!;
  const hidden = f.hiddenColumns[report] ?? [];
  const toggleColumn = (key: string, on: boolean) => {
    const next = on ? hidden.filter((k) => k !== key) : [...hidden, key];
    setF((x) => ({ ...x, hiddenColumns: { ...x.hiddenColumns, [report]: next } }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      // Drop empty entries so the saved JSON stays tidy.
      const clean: ExportFormat = { ...f, hiddenColumns: Object.fromEntries(Object.entries(f.hiddenColumns).filter(([, v]) => v.length)) };
      const res = await saveExportFormat(clean);
      if (!res.ok) return setError({ field: res.field ?? "", message: res.error });
      toast.success(res.message);
      setSaved(clean);
      setF(clean);
      router.refresh();
    });
  };

  const sigError = error?.field.startsWith("signatures") ? error.message : undefined;

  return (
    <form id="export-format-form" onSubmit={submit} noValidate className="space-y-8">
      <SettingsSection
        title="Letterhead"
        description="Shown at the top of every Excel and PDF export: reports, muster, daily reports and expenses. The logo and address come from the Company tab."
        aside={
          <Button variant="outline" size="sm" asChild>
            <a href={SAMPLE_PDF} download>
              <Download /> Sample PDF
            </a>
          </Button>
        }
      >
        <SettingsCard>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-body font-medium">Company logo</span>
              <span className="block text-caption text-ink-3">{data.hasLogo ? "PNG or JPG logos appear top-left on PDFs and top-right in Excel." : "No logo yet. Upload one in the Company tab."}</span>
            </span>
            <Switch aria-label="Company logo" checked={f.showLogo} onCheckedChange={(v) => set("showLogo", v)} />
          </label>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-body font-medium">Company address</span>
              <span className="block text-caption text-ink-3">{data.hasAddress ? "Printed under the company name." : "No address yet. Add it in the Company tab."}</span>
            </span>
            <Switch aria-label="Company address" checked={f.showAddress} onCheckedChange={(v) => set("showAddress", v)} />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="ef-header">Note under the title</Label>
            <Input id="ef-header" value={f.headerNote} maxLength={200} onChange={(e) => set("headerNote", e.target.value)} placeholder="e.g. Confidential: for payroll use only" />
            <FieldError message={error?.field === "headerNote" ? error.message : undefined} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-footer">Footer note</Label>
            <Input id="ef-footer" value={f.footerNote} maxLength={300} onChange={(e) => set("footerNote", e.target.value)} placeholder="e.g. Computer-generated report. Queries to hr@company.in" />
            <FieldError message={error?.field === "footerNote" ? error.message : undefined} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-orientation">PDF page</Label>
            <Select value={f.pdfOrientation} onValueChange={(v) => set("pdfOrientation", v as ExportFormat["pdfOrientation"])}>
              <SelectTrigger id="ef-orientation" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">A4 landscape (wide tables)</SelectItem>
                <SelectItem value="portrait">A4 portrait</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Signature lines" description="Lines to sign at the end of each export, for example Prepared by, Checked by, Approved by. Up to 4.">
        <SettingsCard>
          {f.signatures.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Signature line ${i + 1}`}
                value={s}
                maxLength={40}
                onChange={(e) => set("signatures", f.signatures.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove signature line ${i + 1}`} onClick={() => set("signatures", f.signatures.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          {f.signatures.length < 4 && (
            <Button type="button" variant="outline" size="sm" onClick={() => set("signatures", [...f.signatures, ["Prepared by", "Checked by", "Approved by", "Received by"][f.signatures.length]!])}>
              <Plus /> Add signature line
            </Button>
          )}
          <FieldError message={sigError} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Columns" description="Pick the columns each export includes. The first column always stays. The on-screen tables don't change.">
        <SettingsCard>
          <div className="space-y-1.5">
            <Label htmlFor="ef-report">Export</Label>
            <Select value={report} onValueChange={setReport}>
              <SelectTrigger id="ef-report" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.reports.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.title}
                    {(f.hiddenColumns[r.key]?.length ?? 0) > 0 && <span className="text-ink-3 tabular-nums"> · {f.hiddenColumns[r.key]!.length} hidden</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {current.columns.map((c, i) => {
              const on = i === 0 || !hidden.includes(c.key);
              return (
                <li key={c.key}>
                  <label className={cn("flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-sunken", i === 0 && "cursor-not-allowed text-ink-3")}>
                    <Checkbox checked={on} disabled={i === 0} onCheckedChange={(v) => toggleColumn(c.key, v === true)} />
                    <span className="text-body">{c.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </SettingsCard>
      </SettingsSection>

      <SaveBar show={dirty} pending={pending} form="export-format-form" onDiscard={() => setF(saved)} />
    </form>
  );
}
