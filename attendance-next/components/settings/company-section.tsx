"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { removeLogo, saveCompany, uploadLogo } from "@/lib/actions/settings";
import { companyFormSchema, LOGO_TYPES, MAX_LOGO_BYTES, type CompanyFormInput } from "@/lib/validations/settings";
import { SaveBar } from "./save-bar";
import { FieldError, SettingsCard, SettingsSection } from "./section";

export function CompanySection({ company }: { company: { name: string; address: string; logoPath: string | null } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logoPending, startLogo] = useTransition();
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const values = { name: company.name, address: company.address };
  const form = useForm<CompanyFormInput>({ resolver: zodResolver(companyFormSchema), values });
  const { register, formState } = form;

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const res = await saveCompany(v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<CompanyFormInput>, { message: res.error });
        else toast.error(res.error);
        return;
      }
      toast.success(res.message);
      form.reset(v);
      router.refresh();
    }),
  );

  const onFile = (file: File | undefined) => {
    setLogoError("");
    if (!file) return;
    if (!LOGO_TYPES[file.type]) return setLogoError("Use a PNG, JPG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("The logo must be 1 MB or smaller.");
    const fd = new FormData();
    fd.set("logo", file);
    startLogo(async () => {
      const res = await uploadLogo(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) return setLogoError(res.error);
      toast.success(res.message);
      router.refresh();
    });
  };

  const onRemove = () =>
    startLogo(async () => {
      const res = await removeLogo();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });

  const initials = company.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="space-y-8">
      <SettingsSection title="Company profile" description="Shown in the sidebar, on reports and in emails sent to staff.">
        <form id="company-form" onSubmit={onSubmit} noValidate>
          <SettingsCard>
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Company name</Label>
              <Input id="company-name" aria-invalid={!!formState.errors.name} {...register("name")} />
              <FieldError message={formState.errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-address">Address</Label>
              <Textarea id="company-address" rows={3} placeholder="Street, city, state, PIN" aria-invalid={!!formState.errors.address} {...register("address")} />
              <FieldError message={formState.errors.address?.message} />
            </div>
          </SettingsCard>
          <SaveBar form="company-form" show={formState.isDirty} pending={pending} onDiscard={() => form.reset(values)} />
        </form>
      </SettingsSection>

      <SettingsSection title="Logo" description="PNG, JPG or WebP, up to 1 MB. A square image works best.">
        <SettingsCard>
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-sunken">
              {company.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${company.logoPath}`} alt={`${company.name} logo`} className="size-full object-contain" />
              ) : (
                <span className="text-title-2 text-ink-3">{initials || "—"}</span>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  id="company-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" disabled={logoPending} onClick={() => fileRef.current?.click()}>
                  {logoPending ? <Loader2 className="animate-spin" /> : <ImageUp />}
                  {company.logoPath ? "Replace logo" : "Upload logo"}
                </Button>
                {company.logoPath && (
                  <Button type="button" variant="ghost" disabled={logoPending} onClick={onRemove}>
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
              <p className="text-caption text-ink-3">{company.logoPath ? "Visible to everyone who signs in." : "No logo yet: initials are shown instead."}</p>
              <FieldError message={logoError} />
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
