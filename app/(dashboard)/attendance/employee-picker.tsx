"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmployeePicker({ employees, value, month }: { employees: { id: number; fullName: string; code: string }[]; value: number; month: string }) {
  const router = useRouter();
  return (
    <Select value={String(value)} onValueChange={(id) => router.push(`/attendance?month=${month}&employee=${id}`)}>
      <SelectTrigger className="w-full bg-surface sm:w-64" aria-label="Employee">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {employees.map((e) => (
          <SelectItem key={e.id} value={String(e.id)}>
            {e.fullName} <span className="text-ink-3 tabular-nums">· {e.code}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
