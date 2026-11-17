"use client";

import { Check, Loader2, Network, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteLookup, renameLookup } from "@/lib/actions/settings";
import type { LookupKind } from "@/lib/validations/settings";
import type { LookupRow } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { SettingsSection } from "./section";

export function OrganisationSection({ departments, designations }: { departments: LookupRow[]; designations: LookupRow[] }) {
  return (
    <div className="space-y-8">
      <SettingsSection title="Departments" description="Rename to fix a typo or merge wording. A department can be deleted once no employee record uses it. New ones are added from the employee form.">
        <LookupList kind="department" rows={departments} />
      </SettingsSection>
      <SettingsSection title="Designations" description="Job titles shown on profiles and reports. Delete is available once no employee record uses it.">
        <LookupList kind="designation" rows={designations} />
      </SettingsSection>
    </div>
  );
}

function LookupList({ kind, rows }: { kind: LookupKind; rows: LookupRow[] }) {
  const noun = kind === "department" ? "department" : "designation";
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card">
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <LookupItem key={r.id} kind={kind} row={r} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Network} title={`No ${noun}s yet`}>
          They appear here once you type one on an employee.
        </EmptyState>
      )}
    </div>
  );
}

function LookupItem({ kind, row }: { kind: LookupKind; row: LookupRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const removed = row.references - row.employees;

  const save = () =>
    start(async () => {
      setError("");
      const res = await renameLookup(kind, row.id, name);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setEditing(false);
      router.refresh();
    });

  const cancel = () => {
    setEditing(false);
    setName(row.name);
    setError("");
  };

  return (
    <li className="px-4 py-3 sm:px-5">
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancel()}
            aria-label={`New name for ${row.name}`}
            aria-invalid={!!error}
            className="h-8"
          />
          <Button type="submit" size="icon-sm" aria-label="Save name" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel rename" onClick={cancel} disabled={pending}>
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium">{row.name}</p>
            <p className="text-caption text-ink-3">
              <span className="tabular-nums">{row.employees}</span> employee{row.employees === 1 ? "" : "s"}
              {removed > 0 && ` · ${removed} removed record${removed === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Rename ${row.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <ConfirmButton
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${row.name}`}
            title={`Delete ${row.name}?`}
            blockedReason={
              row.references > 0
                ? `${row.name} is used by ${row.references} employee record${row.references === 1 ? "" : "s"}${removed > 0 ? ` (including ${removed} removed)` : ""}. Move them to another ${kind} first, or rename it instead.`
                : undefined
            }
            description="No employee uses it, so nothing else changes."
            confirmLabel="Delete"
            action={() => deleteLookup(kind, row.id)}
            onDone={() => router.refresh()}
          >
            <Trash2 />
          </ConfirmButton>
        </div>
      )}
      {error && <p className="mt-1.5 text-caption text-danger" role="alert">{error}</p>}
    </li>
  );
}
