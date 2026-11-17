"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a temporary password once, for HR to pass on privately. It is never shown again. */
export function TempPasswordDialog({ password, name, onClose }: { password: string | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-full bg-sunken text-ink-2">
            <KeyRound aria-hidden className="size-5" />
          </div>
          <DialogTitle className="text-title-3 text-ink">Temporary password for {name}</DialogTitle>
          <DialogDescription className="text-body text-ink-2">Share it privately. They&apos;ll be asked to choose their own password the first time they sign in. You won&apos;t see this password again.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-line bg-sunken p-2 pl-4">
          <code className="flex-1 text-title-2 tracking-[0.04em] text-ink tabular-nums [font-feature-settings:'zero']">{password}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(password ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
