import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportResultView } from "@/components/import/import-result";
import { ImportReview } from "@/components/import/import-review";
import { Button } from "@/components/ui/button";
import { loadPreview } from "@/lib/import/service";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Review import" };

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("import.run");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const preview = await loadPreview(id);
  if (!preview) notFound();

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-2 text-ink-2 md:h-8">
        <Link href="/import">
          <ArrowLeft /> Import
        </Link>
      </Button>
      {preview.batch.status === "PREVIEW" ? <ImportReview preview={preview} /> : <ImportResultView preview={preview} />}
    </div>
  );
}
