"use client";

import { useEffect, useState } from "react";
import { loadEntryOptions } from "@/lib/actions/requests";
import type { RequestFormOptions } from "@/lib/requests";
import { EmployeeCombobox, type EntryEmployee } from "./employee-combobox";
import { RequestSheet } from "./request-sheet";

/**
 * HR / a manager records a request for an employee (most often a permission someone asked for
 * in person). The request sheet in "on behalf" mode, with the picked employee's figures loaded
 * from the server so balances, caps and clashes are checked for them, not for the recorder.
 * Mount it with a new `key` per opening so each one starts clean.
 */
export function RecordRequestSheet({
  open,
  onOpenChange,
  employees,
  initialEmployeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EntryEmployee[];
  initialEmployeeId: number | null;
}) {
  const [employeeId, setEmployeeId] = useState<number | null>(initialEmployeeId);
  const [loaded, setLoaded] = useState<{ id: number; options: RequestFormOptions } | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    if (employeeId === null) return;
    let live = true;
    loadEntryOptions(employeeId).then((res) => {
      if (!live) return;
      if (res.ok) {
        setLoaded({ id: employeeId, options: res.options });
        setError(null);
      } else setError({ id: employeeId, message: res.error });
    });
    return () => {
      live = false;
    };
  }, [employeeId]);

  const current = loaded && loaded.id === employeeId ? loaded.options : null;
  const failed = error && error.id === employeeId ? error.message : "";

  return (
    <RequestSheet
      open={open}
      onOpenChange={onOpenChange}
      options={current}
      initialType="PERMISSION"
      behalf={{
        employeeId,
        name: employees.find((e) => e.id === employeeId)?.name ?? null,
        loading: employeeId !== null && !current && !failed,
        error: failed,
        picker: <EmployeeCombobox id="entry-employee" employees={employees} value={employeeId} onChange={setEmployeeId} invalid={!!failed} />,
      }}
    />
  );
}
