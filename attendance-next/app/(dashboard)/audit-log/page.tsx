import { Download } from "lucide-react";
import { auditFilterOptions, listAudit } from "@/components/audit/audit-query";
import { auditQueryString, parseAuditParams } from "@/components/audit/audit-utils";
import { AuditLogView } from "@/components/audit/audit-log-view";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("audit.view");
  const params = parseAuditParams(await searchParams);
  const [list, options] = await Promise.all([listAudit(params), auditFilterOptions()]);
  const qs = auditQueryString(params);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · read-only"
        title="Audit log"
        description="Every sign-in and change, who made it and from where. Expand an entry to see what changed."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/audit-log/export${qs ? `?${qs}` : ""}`} download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <AuditLogView rows={list.rows} total={list.total} page={list.page} pageCount={list.pageCount} params={{ ...params, page: list.page }} options={options} />
    </div>
  );
}
