"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Crosshair, ExternalLink, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { savePunching } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";
import { punchingFormSchema, type PunchingFormInput } from "@/lib/validations/settings";
import { SaveBar } from "./save-bar";
import { NumberField, SettingsCard, SettingsSection } from "./section";

type Values = { geofence: { enabled: boolean; lat: number; lng: number; radiusMeters: number }; punch: { selfieRequired: boolean } };

export function PunchingSection({ values }: { values: Values }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);
  const form = useForm<PunchingFormInput>({ resolver: zodResolver(punchingFormSchema), values });
  const { register, control, formState, watch, setValue } = form;
  const errors = formState.errors;
  const enabled = watch("geofence.enabled");
  const lat = Number(watch("geofence.lat"));
  const lng = Number(watch("geofence.lng"));

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const res = await savePunching(v);
      if (!res.ok) {
        if (res.field) form.setError(res.field as FieldPath<PunchingFormInput>, { message: res.error });
        else toast.error(res.error);
        return;
      }
      toast.success(res.message);
      form.reset(v);
      router.refresh();
    }),
  );

  const fillMyLocation = () => {
    if (!("geolocation" in navigator)) {
        toast.error("This browser can't share its location.");
        return;
      }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setValue("geofence.lat", Number(pos.coords.latitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });
        setValue("geofence.lng", Number(pos.coords.longitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });
        toast.success(`Location set (accuracy about ${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location. Try again outdoors or enter it by hand.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <form id="punching-form" onSubmit={onSubmit} noValidate className="space-y-8">
      <SettingsSection
        title="Office geofence"
        description="When on, punches must come from within the radius of the office (plus up to 100 m of GPS accuracy). Approved WFH and on-duty days skip the check."
      >
        <SettingsCard>
          <label className="flex items-start justify-between gap-4">
            <span className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken">
                <MapPin className="size-4 text-ink-3" />
              </span>
              <span>
                <span className="block text-body font-medium">Restrict punching to the office</span>
                <span className="block text-caption text-ink-3">{enabled ? "On: punches outside the radius are refused." : "Off: staff can punch from anywhere."}</span>
              </span>
            </span>
            <Controller control={control} name="geofence.enabled" render={({ field }) => <Switch aria-label="Restrict punching to the office" checked={field.value} onCheckedChange={field.onChange} />} />
          </label>

          <div className={cn("space-y-5 border-t border-line pt-5", !enabled && "[&_label]:text-ink-3")}>
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField id="geo-lat" label="Latitude" step="any" inputMode="decimal" error={errors.geofence?.lat?.message} {...register("geofence.lat", { valueAsNumber: true })} />
              <NumberField id="geo-lng" label="Longitude" step="any" inputMode="decimal" error={errors.geofence?.lng?.message} {...register("geofence.lng", { valueAsNumber: true })} />
            </div>
            <NumberField
              id="geo-radius"
              label="Radius"
              suffix="m"
              className="sm:max-w-[calc(50%-0.625rem)]"
              hint="20 to 5,000 metres"
              error={errors.geofence?.radiusMeters?.message}
              {...register("geofence.radiusMeters", { valueAsNumber: true })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={fillMyLocation} disabled={locating}>
                {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
                Use my current location
              </Button>
              {Number.isFinite(lat) && Number.isFinite(lng) && (
                <Button type="button" variant="ghost" asChild>
                  <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Check on map
                  </a>
                </Button>
              )}
            </div>
            <p className="text-caption text-ink-3">Stand in the office when using your location; the phone&apos;s GPS is more accurate than a laptop&apos;s.</p>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Selfie" description="Ask for a front-camera photo with every punch. Photos are downscaled on the phone and visible only to HR and the employee.">
        <SettingsCard>
          <label className="flex items-start justify-between gap-4">
            <span className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken">
                <Camera className="size-4 text-ink-3" />
              </span>
              <span>
                <span className="block text-body font-medium">Selfie required to punch</span>
                <span className="block text-caption text-ink-3">Applies to punch in and punch out.</span>
              </span>
            </span>
            <Controller control={control} name="punch.selfieRequired" render={({ field }) => <Switch aria-label="Selfie required to punch" checked={field.value} onCheckedChange={field.onChange} />} />
          </label>
        </SettingsCard>
      </SettingsSection>
      <SaveBar form="punching-form" show={formState.isDirty} pending={pending} onDiscard={() => form.reset(values)} />
    </form>
  );
}
