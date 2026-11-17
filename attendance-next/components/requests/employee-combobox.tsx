"use client";

import { Check, ChevronsUpDown, UserRound } from "lucide-react";
import { useState } from "react";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface EntryEmployee {
  id: number;
  name: string;
  code: string;
}

/** Single-select, searchable list of the employees in the approver's reach (by name or code). */
export function EmployeeCombobox({
  id,
  employees,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  employees: EntryEmployee[];
  value: number | null;
  onChange: (id: number) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="h-12 w-full justify-between border-line-strong bg-surface px-3 text-m-body font-normal md:h-10 md:text-body"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <EmployeeAvatar name={selected.name} photo={null} className="size-6" />
              <span className="truncate font-medium text-ink">{selected.name}</span>
              <span className="text-caption text-ink-3 tabular-nums">{selected.code}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-ink-3">
              <UserRound />
              Search by name or code
            </span>
          )}
          <ChevronsUpDown className="text-ink-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  className={cn("min-h-11 md:min-h-9", e.id === value && "bg-brand-subtle")}
                  value={`${e.name} ${e.code}`}
                  onSelect={() => {
                    onChange(e.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4 text-brand-ink", e.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="text-caption text-ink-3 tabular-nums">{e.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
