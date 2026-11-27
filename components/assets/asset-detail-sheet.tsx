"use client";

import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, Loader2, Pencil, Trash2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmployeeCombobox, type EntryEmployee } from "@/components/requests/employee-combobox";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { assignAsset, deleteAsset, returnAsset, setAssetStatus } from "@/lib/actions/assets";
import type { AssetRow } from "@/lib/assets";
import { formatDate, formatTime, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ASSET_CONDITIONS, CONDITION_LABEL, EVENT_LABEL, type AssetConditionKey } from "@/lib/validations/assets";
import { formatRupees } from "@/lib/validations/expenses";
import { AssetStatusChip } from "./asset-status-chip";

type Mode = null | "assign" | "return";

const when = (iso: string) => `${formatDate(istDate(new Date(iso)))}, ${formatTime(iso)}`;

export function AssetDetailSheet({
  asset,
  onClose,
  onEdit,
  employees,
  canManage,
}: {
  asset: AssetRow | null;
  onClose: () => void;
  onEdit: (a: AssetRow) => void;
  employees: EntryEmployee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [date, setDate] = useState(istDate());
  const [condition, setCondition] = useState<AssetConditionKey>("GOOD");
  const [next, setNext] = useState<"AVAILABLE" | "REPAIR" | "RETIRED">("AVAILABLE");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setMode(null);
    setEmployeeId(null);
    setDate(istDate());
    setCondition(asset?.condition === "NEW" ? "GOOD" : (asset?.condition ?? "GOOD"));
    setNext("AVAILABLE");
    setNote("");
    setError("");
  }, [asset?.id, asset?.condition]);

  const run = (fn: () => ReturnType<typeof deleteAsset>, close = false) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setMode(null);
      setNote("");
      if (close) onClose();
      router.refresh();
    });

  const facts: [string, React.ReactNode][] = asset
    ? [
        ["Category", asset.category],
        ["Serial / number", asset.serialNo || "—"],
        ["Condition", CONDITION_LABEL[asset.condition]],
        ["Bought on", asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"],
        ["Cost", asset.cost === null ? "—" : formatRupees(asset.cost)],
      ]
    : [];

  return (
    <Sheet open={!!asset} onOpenChange={(o) => !o && !pending && onClose()}>
      <DrawerContent>
        {asset && (
          <>
            <SheetHeader className={drawerHeader}>
              <SheetTitle className={drawerTitle}>{asset.name}</SheetTitle>
              <SheetDescription className={drawerDescription}>
                <span className="[font-feature-settings:'zero']">{asset.tag}</span>
              </SheetDescription>
            </SheetHeader>
            <div className={cn(drawerBody, "space-y-5")}>
              <div className="flex flex-wrap items-center gap-2">
                <AssetStatusChip status={asset.status} />
                {asset.holder && (
                  <span className="text-body text-ink-2">
                    {asset.holder.name} · since <span className="tabular-nums">{formatDate(asset.assignedAt)}</span>
                    {asset.holder.removed && <span className="text-danger"> (removed employee)</span>}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-caption text-ink-3">{k}</dt>
                    <dd className="truncate text-body text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {asset.notes && <p className="text-body whitespace-pre-line text-ink-2">{asset.notes}</p>}

              {canManage && mode === "assign" && (
                <div className="space-y-4 rounded-lg border border-line p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-employee">Hand over to</Label>
                    <EmployeeCombobox id="assign-employee" employees={employees} value={employeeId} onChange={setEmployeeId} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-date">From</Label>
                    <Input id="assign-date" type="date" max={istDate()} value={date} onChange={(e) => setDate(e.target.value)} className="tabular-nums sm:w-48" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-note">Note (optional)</Label>
                    <Input id="assign-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. With charger and bag" />
                  </div>
                </div>
              )}

              {canManage && mode === "return" && (
                <div className="space-y-4 rounded-lg border border-line p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="return-condition">Condition now</Label>
                    <Select value={condition} onValueChange={(v) => setCondition(v as AssetConditionKey)}>
                      <SelectTrigger id="return-condition" className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_CONDITIONS.filter((c) => c !== "NEW").map((c) => (
                          <SelectItem key={c} value={c}>
                            {CONDITION_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="return-next">Then</Label>
                    <Select value={next} onValueChange={(v) => setNext(v as typeof next)}>
                      <SelectTrigger id="return-next" className="w-full sm:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVAILABLE">Keep in store</SelectItem>
                        <SelectItem value="REPAIR">Send for repair</SelectItem>
                        <SelectItem value="RETIRED">Retire it</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="return-note">Note (optional)</Label>
                    <Textarea id="return-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Screen scratched, charger missing" />
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}

              <section aria-labelledby="asset-history" className="space-y-3">
                <h3 id="asset-history" className="text-label text-ink">
                  History
                </h3>
                <ol className="space-y-3 border-l border-line pl-4">
                  {asset.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-ink" />
                      <p className="text-body font-medium text-ink">
                        {EVENT_LABEL[e.action] ?? e.action}
                        {e.employee && <span className="font-normal text-ink-2"> · {e.employee}</span>}
                        {e.condition && e.action === "RETURNED" && <span className="font-normal text-ink-2"> · {CONDITION_LABEL[e.condition]}</span>}
                      </p>
                      <p className="text-caption text-ink-3 tabular-nums">
                        {e.by} · {when(e.at)}
                      </p>
                      {e.note && <p className="mt-0.5 text-body text-ink-2">{e.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {canManage && (
              <SheetFooter className={drawerFooter}>
                {mode ? (
                  <>
                    <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                      Back
                    </Button>
                    <Button
                      disabled={pending || (mode === "assign" && !employeeId)}
                      aria-busy={pending || undefined}
                      onClick={() =>
                        mode === "assign"
                          ? run(() => assignAsset(asset.id, { employeeId: employeeId!, date, note }))
                          : run(() => returnAsset(asset.id, { condition, next, note }))
                      }
                    >
                      {pending && <Loader2 className="animate-spin" />}
                      {mode === "assign" ? "Hand over" : "Take back"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" aria-label="Edit details" onClick={() => onEdit(asset)}>
                      <Pencil />
                    </Button>
                    {asset.status === "AVAILABLE" && !asset.events.some((e) => e.action === "ASSIGNED") && (
                      <Button variant="ghost" size="icon" className="text-danger" aria-label="Delete asset" disabled={pending} onClick={() => run(() => deleteAsset(asset.id), true)}>
                        <Trash2 />
                      </Button>
                    )}
                    {asset.status === "AVAILABLE" && (
                      <Button variant="outline" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, { status: "REPAIR" }))}>
                        <Wrench /> Repair
                      </Button>
                    )}
                    {(asset.status === "REPAIR" || asset.status === "RETIRED") && (
                      <Button variant="outline" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, { status: "AVAILABLE" }))}>
                        {asset.status === "REPAIR" ? "Back from repair" : "Put back in use"}
                      </Button>
                    )}
                    {asset.status === "REPAIR" && (
                      <Button variant="outline" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, { status: "RETIRED" }))}>
                        Retire
                      </Button>
                    )}
                    {asset.status === "AVAILABLE" && (
                      <Button onClick={() => setMode("assign")}>
                        <ArrowUpFromLine /> Hand over
                      </Button>
                    )}
                    {asset.status === "ASSIGNED" && (
                      <Button onClick={() => setMode("return")}>
                        <ArrowDownToLine /> Take back
                      </Button>
                    )}
                  </>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Sheet>
  );
}
