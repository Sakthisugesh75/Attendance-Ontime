"use client";

import { CircleAlert, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadWorkbook } from "@/lib/actions/import";
import { cn } from "@/lib/utils";

const MAX = 10 * 1024 * 1024;

export function UploadCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();

  const send = (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!/\.xlsx$/i.test(file.name)) return setError("Choose an Excel .xlsx file. For an old .xls file, open it in Excel and Save As .xlsx.");
    if (file.size > MAX) return setError("The file is larger than 10 MB.");
    setFileName(file.name);
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const res = await uploadWorkbook(form);
      if (!res.ok) {
        setError(res.error);
        setFileName("");
        return;
      }
      toast.success(res.message);
      router.push(`/import/${res.id}`);
    });
  };

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-surface px-6 py-12 text-center transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-wait",
          dragging ? "border-brand bg-brand-subtle" : "border-line-strong hover:bg-sunken",
        )}
      >
        <span className="grid size-16 place-items-center rounded-full bg-sunken text-ink-2">
          {pending ? <Loader2 className="size-6 animate-spin" /> : fileName ? <FileSpreadsheet className="size-6" /> : <UploadCloud className="size-6" />}
        </span>
        <span>
          <span className="block text-title-3 text-ink">{pending ? `Reading ${fileName}…` : "Drop your Excel file here, or click to choose"}</span>
          <span className="mt-1 block text-body text-ink-2">.xlsx up to 10 MB · nothing is saved until you confirm</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        aria-label="Excel file"
        onChange={(e) => {
          send(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
