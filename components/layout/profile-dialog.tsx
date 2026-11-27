"use client";

import { CircleAlert, Loader2, UserPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyName } from "@/lib/actions/profile";

/** "Edit profile" from the account menu: the signed-in person's display name. */
export function ProfileDialog({ open, onOpenChange, name, email }: { open: boolean; onOpenChange: (open: boolean) => void; name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setValue(name);
      setError("");
    }
  }, [open, name]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await updateMyName(value);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={save} className="space-y-5">
          <DialogHeader>
            <div className="mb-1 grid size-10 place-items-center rounded-full bg-sunken text-ink-2">
              <UserPen aria-hidden className="size-5" />
            </div>
            <DialogTitle className="text-title-3 text-ink">Edit profile</DialogTitle>
            <DialogDescription className="text-body text-ink-2">{email ? `Signed in as ${email}. ` : ""}Your name shows in the menu, on approvals and in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" maxLength={150} aria-invalid={!!error} autoFocus />
            {error && (
              <p role="alert" className="flex items-start gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !value.trim()} aria-busy={pending || undefined}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
