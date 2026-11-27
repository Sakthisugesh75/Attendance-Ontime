"use client";

import { CircleAlert, Loader2, Pencil, Plus, Receipt, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/page-header";
import * as T from "@/components/reports/table-styles";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCategory, saveCategory } from "@/lib/actions/expenses";
import type { CategoryRow } from "@/lib/expenses";
import { cn } from "@/lib/utils";
import { formatRupees } from "@/lib/validations/expenses";

type Designation = { id: number; name: string };

export function CategoriesPanel({ categories, designations }: { categories: CategoryRow[]; designations: Designation[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const edit = (c: CategoryRow | null) => {
    setEditing(c);
    setOpen(true);
  };

  return (
    <section className={T.tablePanel}>
      <div className={cn(T.toolbar, "justify-between")}>
        <p className="text-body text-ink-2">Limits apply to one claim. A designation&apos;s limit wins over the category limit.</p>
        <Button variant="outline" size="sm" onClick={() => edit(null)}>
          <Plus /> New category
        </Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState icon={Receipt} title="No categories yet" action={<Button onClick={() => edit(null)}>Add a category</Button>}>
          Add Travel, Food or Fuel so people can start claiming.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={T.headRow}>
              <TableHead className={T.th}>Category</TableHead>
              <TableHead className={cn(T.th, "text-right")}>Limit per claim</TableHead>
              <TableHead className={T.th}>By designation</TableHead>
              <TableHead className={T.th}>Receipt</TableHead>
              <TableHead className={cn(T.th, "w-24")}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id} className={cn(T.row, !c.isActive && "[&_td]:text-ink-3")}>
                <TableCell className={T.td}>
                  <span className="font-medium text-ink">{c.name}</span>
                  {!c.isActive && <span className="ml-2 text-caption">Off</span>}
                </TableCell>
                <TableCell className={cn(T.td, T.num)}>{c.defaultLimit === null ? <span className={T.empty}>No limit</span> : formatRupees(c.defaultLimit)}</TableCell>
                <TableCell className={cn(T.td, "max-w-72")}>
                  {c.limits.length ? (
                    <span className="block truncate tabular-nums">{c.limits.map((l) => `${l.designation} ${formatRupees(l.maxAmount)}`).join(" · ")}</span>
                  ) : (
                    <span className={T.empty}>—</span>
                  )}
                </TableCell>
                <TableCell className={T.td}>{c.receiptRequired ? "Required" : "Optional"}</TableCell>
                <TableCell className={cn(T.td, "py-2 text-right")}>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => edit(c)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-danger"
                    aria-label={`Delete ${c.name}`}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteCategory(c.id);
                        if (res.ok) {
                          toast.success(res.message);
                          router.refresh();
                        } else toast.error(res.error);
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CategorySheet open={open} onOpenChange={setOpen} category={editing} designations={designations} />
    </section>
  );
}

function CategorySheet({ open, onOpenChange, category, designations }: { open: boolean; onOpenChange: (o: boolean) => void; category: CategoryRow | null; designations: Designation[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [receiptRequired, setReceiptRequired] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [limits, setLimits] = useState<{ designationId: number; maxAmount: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setLimit(category?.defaultLimit != null ? String(category.defaultLimit) : "");
    setReceiptRequired(category?.receiptRequired ?? true);
    setIsActive(category?.isActive ?? true);
    setLimits(category?.limits.map((l) => ({ designationId: l.designationId, maxAmount: String(l.maxAmount) })) ?? []);
    setError("");
  }, [open, category]);

  const unused = designations.filter((d) => !limits.some((l) => l.designationId === d.id));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await saveCategory(category?.id ?? null, {
        name,
        defaultLimit: limit === "" ? null : Number(limit),
        receiptRequired,
        isActive,
        limits: limits.map((l) => ({ designationId: l.designationId, maxAmount: Number(l.maxAmount) })),
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
          <SheetTitle className={drawerTitle}>{category ? `Edit ${category.name}` : "New expense category"}</SheetTitle>
          <SheetDescription className={drawerDescription}>Leave a limit empty for no limit.</SheetDescription>
        </SheetHeader>
        <form id="category-form" onSubmit={save} noValidate className={cn(drawerBody, "space-y-5")}>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-limit">Limit per claim (everyone)</Label>
            <Input id="cat-limit" type="number" inputMode="decimal" min={0} step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" className="tabular-nums sm:w-48" />
          </div>

          <fieldset className="space-y-2 rounded-md border border-line p-3.5">
            <legend className="sr-only">Limits by designation</legend>
            <span className="block text-body font-medium">Limits by designation</span>
            <span className="block text-caption text-ink-3">For example, Managers can claim more for travel than everyone else.</span>
            {limits.map((l, i) => (
              <div key={l.designationId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body text-ink">{designations.find((d) => d.id === l.designationId)?.name}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  aria-label={`Limit for ${designations.find((d) => d.id === l.designationId)?.name}`}
                  value={l.maxAmount}
                  onChange={(e) => setLimits((ls) => ls.map((x, j) => (j === i ? { ...x, maxAmount: e.target.value } : x)))}
                  className="w-36 tabular-nums"
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove limit" onClick={() => setLimits((ls) => ls.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            {unused.length > 0 ? (
              <Select value="" onValueChange={(v) => setLimits((ls) => [...ls, { designationId: Number(v), maxAmount: limit || "" }])}>
                <SelectTrigger className="w-full sm:w-64" aria-label="Add a designation limit">
                  <SelectValue placeholder="Add a designation" />
                </SelectTrigger>
                <SelectContent>
                  {unused.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              !designations.length && <span className="block text-caption text-ink-3">Add designations in Settings → Departments first.</span>
            )}
          </fieldset>

          <label className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
            <span>
              <span className="block text-body font-medium">Receipt required</span>
              <span className="block text-caption text-ink-3">Claims can&apos;t be sent without a bill attached.</span>
            </span>
            <Switch aria-label="Receipt required" checked={receiptRequired} onCheckedChange={setReceiptRequired} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
            <span>
              <span className="block text-body font-medium">Active</span>
              <span className="block text-caption text-ink-3">Turned-off categories can&apos;t be claimed but keep their history.</span>
            </span>
            <Switch aria-label="Active" checked={isActive} onCheckedChange={setIsActive} />
          </label>
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
          <Button type="submit" form="category-form" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {category ? "Save" : "Add category"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
