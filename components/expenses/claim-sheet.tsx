"use client";

import { CircleAlert, Loader2, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { submitClaim } from "@/lib/actions/expenses";
import { istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatRupees, RECEIPT_MAX_BYTES } from "@/lib/validations/expenses";

export type ClaimCategory = { id: number; name: string; receiptRequired: boolean; limit: number | null };

type Errors = Partial<Record<"categoryId" | "expenseDate" | "amount" | "description" | "receipt" | "form", string>>;

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="flex items-center gap-1.5 text-caption text-danger">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {message}
    </p>
  ) : null;
}

/** New expense claim: category, date, amount, what it was for and the receipt. */
export function ClaimSheet({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: ClaimCategory[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(istDate());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setCategoryId("");
      setDate(istDate());
      setAmount("");
      setDescription("");
      setReceipt(null);
      setErrors({});
    }
  }, [open]);

  const category = categories.find((c) => String(c.id) === categoryId);
  const amountNum = Number(amount);
  const overLimit = !!category && category.limit !== null && amountNum > category.limit;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!categoryId) next.categoryId = "Pick a category";
    if (!date) next.expenseDate = "Pick the date of the expense";
    if (!(amountNum > 0)) next.amount = "Enter the amount";
    else if (overLimit) next.amount = `${category!.name} claims are limited to ${formatRupees(category!.limit!)} each`;
    if (description.trim().length < 3) next.description = "Say what it was for";
    if (category?.receiptRequired && !receipt) next.receipt = `${category.name} claims need a receipt`;
    setErrors(next);
    if (Object.keys(next).length) return;

    const form = new FormData();
    form.set("categoryId", categoryId);
    form.set("expenseDate", date);
    form.set("amount", amount);
    form.set("description", description);
    if (receipt) form.set("receipt", receipt);
    start(async () => {
      const res = await submitClaim(form);
      if (!res.ok) {
        const key = (res.field && ["categoryId", "expenseDate", "amount", "description", "receipt"].includes(res.field) ? res.field : "form") as keyof Errors;
        return setErrors({ [key]: res.error });
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DrawerContent size="form">
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>New expense claim</SheetTitle>
          <SheetDescription className={drawerDescription}>Your reporting manager approves it first, then HR, and HR marks it paid.</SheetDescription>
        </SheetHeader>
        <form id="claim-form" onSubmit={submit} noValidate className={cn(drawerBody, "space-y-5")}>
          <div className="space-y-1.5">
            <Label htmlFor="claim-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="claim-category" className="w-full" aria-invalid={!!errors.categoryId}>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.limit !== null && <span className="text-ink-3 tabular-nums"> · up to {formatRupees(c.limit)}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.categoryId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="claim-date">Date of expense</Label>
              <Input id="claim-date" type="date" max={istDate()} value={date} onChange={(e) => setDate(e.target.value)} className="tabular-nums" aria-invalid={!!errors.expenseDate} />
              <FieldError message={errors.expenseDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-amount">Amount</Label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
                  ₹
                </span>
                <Input
                  id="claim-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8 tabular-nums"
                  aria-invalid={!!errors.amount || overLimit}
                />
              </div>
              {errors.amount ? (
                <FieldError message={errors.amount} />
              ) : category?.limit != null ? (
                <p className={cn("text-caption tabular-nums", overLimit ? "text-danger" : "text-ink-3")}>Limit {formatRupees(category.limit)} per claim</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-description">What was it for?</Label>
            <Textarea
              id="claim-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Auto fare to the client office in Peelamedu and back"
              aria-invalid={!!errors.description}
            />
            <FieldError message={errors.description} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-receipt-button">Receipt{category && !category.receiptRequired ? " (optional)" : ""}</Label>
            {receipt ? (
              <div className="flex items-center gap-2 rounded-full border border-line bg-glass py-1 pr-1 pl-3">
                <Paperclip aria-hidden className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{receipt.name}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={() => setReceipt(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <Button id="claim-receipt-button" type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Paperclip /> Attach receipt
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > RECEIPT_MAX_BYTES) return setErrors((x) => ({ ...x, receipt: "The receipt must be 5 MB or smaller" }));
                setErrors((x) => ({ ...x, receipt: undefined }));
                setReceipt(f);
              }}
            />
            {errors.receipt ? <FieldError message={errors.receipt} /> : <p className="text-caption text-ink-3">A photo or PDF of the bill, up to 5 MB.</p>}
          </div>

          {errors.form && (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errors.form}
            </p>
          )}
        </form>
        <SheetFooter className={drawerFooter}>
          <Button type="button" variant="outline" className="max-md:h-12 max-md:flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="claim-form" className="max-md:h-12 max-md:flex-1" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            Submit claim
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}
