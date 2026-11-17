"use client";

import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PickerEmployee {
  id: number;
  name: string;
  code: string;
  departmentId: number | null;
}

/** Multi-select of employees; applies when the popover closes so the report runs once. */
export function EmployeePicker({ employees, value, onChange }: { employees: PickerEmployee[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(value);

  const label =
    value.length === 0
      ? "All employees"
      : value.length === 1
        ? (employees.find((e) => e.id === value[0])?.name ?? "1 employee")
        : `${value.length} employees`;

  const toggle = (id: number) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value);
        else if (draft.slice().sort().join() !== value.slice().sort().join()) onChange(draft);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Employees" className="w-full justify-between font-normal text-ink sm:w-56">
          <span className="flex min-w-0 items-center gap-2">
            <Users className="text-ink-3" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="text-ink-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-line bg-raised p-0 shadow-md" align="start">
        <Command>
          <CommandInput placeholder="Search people" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all" onSelect={() => setDraft([])}>
                <Check className={cn("size-4", draft.length === 0 ? "text-brand-ink" : "opacity-0")} />
                All employees
              </CommandItem>
              {employees.map((e) => (
                <CommandItem key={e.id} value={`${e.name} ${e.code}`} onSelect={() => toggle(e.id)}>
                  <Check className={cn("size-4", draft.includes(e.id) ? "text-brand-ink" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="tabular-nums text-caption text-ink-3">{e.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex justify-end gap-2 border-t border-line p-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              if (draft.slice().sort().join() !== value.slice().sort().join()) onChange(draft);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
