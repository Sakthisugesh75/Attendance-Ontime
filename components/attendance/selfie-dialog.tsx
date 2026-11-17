"use client";

import { Camera, CameraOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Front-camera capture, downscaled to 480px JPEG before it leaves the phone. */
export function SelfieDialog({
  open,
  onOpenChange,
  title,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onCapture: (dataUrl: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setShot(null);
    setError("");
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Camera access is blocked. Allow the camera for this site to punch."));
    if (!navigator.mediaDevices) setError("This browser can't use the camera.");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [open]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = 480 / Math.max(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    setShot(canvas.toDataURL("image/jpeg", 0.8));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Your photo is stored with this punch and visible to HR.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-sunken">
          {error ? (
            <p role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-m-meta text-ink-2 sm:text-body">
              <CameraOff aria-hidden className="size-6 text-ink-3" />
              {error}
            </p>
          ) : shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot} alt="Your selfie" className="size-full -scale-x-100 object-cover" />
          ) : (
            <video ref={video} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {shot ? (
            <>
              <Button variant="outline" size="lg" className="sm:h-10 sm:text-sm sm:font-medium" onClick={() => setShot(null)}>
                <RotateCcw /> Retake
              </Button>
              <Button size="lg" className="sm:h-10 sm:text-sm sm:font-medium" onClick={() => onCapture(shot)}>
                Use photo
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={capture} disabled={!!error} className="w-full sm:h-10 sm:w-auto sm:text-sm sm:font-medium">
              <Camera /> Take photo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
