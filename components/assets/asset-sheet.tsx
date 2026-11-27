"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { saveAsset } from "@/lib/actions/assets";
import type { AssetRow } from "@/lib/assets";
import { istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ASSET_CATEGORY_SUGGESTIONS, ASSET_CONDITIONS, CONDITION_LABEL, type AssetConditionKey } from "@/lib/validations/assets";

type Form = { tag: string; name: string; category: string; serialNo: string; purchaseDate: string; cost: string; condition: AssetConditionKey; notes: string };

const blank = (tag: string): Form => ({ tag, name: "", category: "", serialNo: "", purchaseDate: "", cost: "", condition: "NEW", notes: "" });
const fromRow = (a: AssetRow): Form => ({
  tag: a.tag,
  name: a.name,
  category: a.category,
  serialNo: a.serialNo,
  purchaseDate: a.purchaseDate,
  cost: a.cost === null ? "" : String(a.cost),
  condition: a.condition,
  notes: a.notes,
});

/** Add or edit an asset's details (hand-over and returns happen in the detail sheet). */
export function AssetSheet({ open, onOpenChange, asset, nextTag, categories }: { open: boolean; onOpenChange: (o: boolean) => void; asset: AssetRow | null; nextTag: string; categories: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Form>(blank(nextTag));
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (open) {
      setF(asset ? fromRow(asset) : blank(nextTag));
      setError(null);
    }
  }, [open, asset, nextTag]);

  const suggestions = [...new Set([...categories, ...ASSET_CATEGORY_SUGGESTIONS])];
  const err = (field: string) =>
    error?.field === field ? (
      <p className="flex items-center gap-1.5 text-caption text-danger">
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        {error.message}
      </p>
    ) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await saveAsset(asset?.id ?? null, { ...f, cost: f.cost === "" ? null : Number(f.cost) });
      if (!res.ok) return setError({ field: res.field, message: res.error });
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DrawerContent size="form">
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{asset ? `Edit ${asset.tag}` : "Add asset"}</SheetTitle>
          <SheetDescription className={drawerDescription}>Write the tag on a sticker on the item so anyone can match it.</SheetDescription>
        </SheetHeader>
        <form id="asset-form" onSubmit={submit} noValidate className={cn(drawerBody, "space-y-5")}>
          <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="asset-tag">Tag</Label>
              <Input id="asset-tag" value={f.tag} onChange={(e) => set("tag", e.target.value)} className="uppercase tabular-nums" maxLength={30} aria-invalid={error?.field === "tag"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Name</Label>
              <Input id="asset-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Dell Latitude 5440" maxLength={120} aria-invalid={error?.field === "name"} />
            </div>
          </div>
          {err("tag")}
          {err("name")}
          <div className="space-y-1.5">
            <Label htmlFor="asset-category">Category</Label>
            <Input id="asset-category" list="asset-categories" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Laptop, Phone, SIM card…" maxLength={60} aria-invalid={error?.field === "category"} />
            <datalist id="asset-categories">
              {suggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {err("category")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-serial">Serial / IMEI / number (optional)</Label>
            <Input id="asset-serial" value={f.serialNo} onChange={(e) => set("serialNo", e.target.value)} maxLength={100} className="tabular-nums" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="asset-bought">Bought on (optional)</Label>
              <Input id="asset-bought" type="date" max={istDate()} value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-cost">Cost (optional)</Label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
                  ₹
                </span>
                <Input id="asset-cost" type="number" inputMode="decimal" min={0} step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} className="pl-8 tabular-nums" aria-invalid={error?.field === "cost"} />
              </div>
              {err("cost")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-condition">Condition</Label>
            <Select value={f.condition} onValueChange={(v) => set("condition", v as AssetConditionKey)}>
              <SelectTrigger id="asset-condition" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONDITION_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-notes">Notes (optional)</Label>
            <Textarea id="asset-notes" rows={3} maxLength={1000} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Warranty till, charger included, password kept with IT…" />
          </div>
          {error && !["tag", "name", "category", "cost"].includes(error.field ?? "") && (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error.message}
            </p>
          )}
        </form>
        <SheetFooter className={drawerFooter}>
          <Button type="button" variant="outline" className="max-md:h-12 max-md:flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="asset-form" className="max-md:h-12 max-md:flex-1" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {asset ? "Save" : "Add asset"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
