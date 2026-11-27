import { Laptop } from "lucide-react";
import { AssetsView } from "@/components/assets/assets-view";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { assetsHeldBy, assignableEmployees, listAssets, nextAssetTag } from "@/lib/assets";
import { hasPermission, requireUser } from "@/lib/session";
import { assetListParams } from "@/lib/validations/assets";

export const metadata = { title: "Assets" };

/** HR (assets.manage): the asset register. Everyone else with an employee record: what they hold. */
export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = assetListParams.parse(await searchParams);
  const manages = hasPermission(user, "assets.manage");

  if (!manages && !user.employeeId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assets" />
        <Panel>
          <EmptyState icon={Laptop} title="Not linked to an employee record">
            Ask HR to link your sign-in to your employee record to see the assets you hold.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const [register, mine, employees, nextTag] = await Promise.all([
    manages ? listAssets(params) : null,
    manages ? null : assetsHeldBy(user.employeeId!),
    manages ? assignableEmployees() : [],
    manages ? nextAssetTag() : "",
  ]);

  return <AssetsView register={register} mine={mine} params={params} employees={employees} nextTag={nextTag} />;
}
